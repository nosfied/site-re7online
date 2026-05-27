import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "../logger/logger.js";

function inferInputExtension(params: { inputMimeType?: string | null; fileName?: string | null }) {
  const mimeType = String(params.inputMimeType ?? "")
    .trim()
    .toLowerCase();
  if (mimeType.includes("ogg")) return ".ogg";
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("mpeg")) return ".mp3";
  if (mimeType.includes("wav")) return ".wav";
  if (mimeType.includes("aac")) return ".aac";
  if (mimeType.includes("amr")) return ".amr";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return ".m4a";

  const fileName = String(params.fileName ?? "").trim();
  const extension = path.extname(fileName).trim().toLowerCase();
  return extension || ".bin";
}

function summarizeStderr(stderr: string) {
  const value = stderr.trim();
  if (!value) return null;
  return value.length > 1200 ? `${value.slice(0, 1197)}...` : value;
}

function runFfmpeg(args: string[], timeoutMs: number) {
  return new Promise<{ stderr: string }>((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) {
        reject({
          error,
          stderr: summarizeStderr(stderr),
        });
        return;
      }
      resolve({ stderr });
    });
  });
}

function runFfprobe(targetFile: string, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", targetFile],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject({
            error,
            stderr: summarizeStderr(stderr),
          });
          return;
        }
        resolve(stdout);
      }
    );
  });
}

export async function transcodeAudioToOggOpus(params: {
  inputBuffer: Buffer;
  inputMimeType?: string | null;
  fileName?: string | null;
  requestId?: string | null;
  clientId?: string | null;
  clientKey?: string | null;
}): Promise<
  | {
      ok: true;
      buffer: Buffer;
      mimeType: "audio/ogg";
      fileName: string;
    }
  | {
      ok: false;
      error: string;
      details?: string;
    }
> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "wa-audio-transcode-"));
  const inputFile = path.join(tempDir, `input${inferInputExtension(params)}`);
  const outputFile = path.join(tempDir, `output-${randomUUID()}.ogg`);
  const logContext = {
    event: "audio.transcode.started",
    requestId: params.requestId ?? null,
    clientId: params.clientId ?? null,
    clientKey: params.clientKey ?? null,
    mimeType: params.inputMimeType ?? null,
    inputBytes: params.inputBuffer.length,
  };

  logger.info(logContext);

  try {
    await writeFile(inputFile, params.inputBuffer);
    await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputFile,
        "-vn",
        "-map_metadata",
        "-1",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-application",
        "voip",
        "-b:a",
        "32k",
        "-f",
        "ogg",
        outputFile,
      ],
      20_000
    );
    const buffer = await readFile(outputFile);
    try {
      const ffprobeOutput = await runFfprobe(outputFile, 10_000);
      logger.info({
        event: "audio.transcode.probe",
        requestId: params.requestId ?? null,
        clientId: params.clientId ?? null,
        clientKey: params.clientKey ?? null,
        fileName: path.basename(outputFile),
        ffprobe: ffprobeOutput.length > 4000 ? `${ffprobeOutput.slice(0, 3997)}...` : ffprobeOutput,
      });
    } catch (probeError) {
      const typedProbeError = probeError as { error?: NodeJS.ErrnoException; stderr?: string | null };
      logger.warn({
        event: "audio.transcode.probe_failed",
        requestId: params.requestId ?? null,
        clientId: params.clientId ?? null,
        clientKey: params.clientKey ?? null,
        fileName: path.basename(outputFile),
        stderr: typedProbeError.stderr ?? typedProbeError.error?.message ?? null,
      });
    }
    logger.info({
      event: "audio.transcode.succeeded",
      requestId: params.requestId ?? null,
      clientId: params.clientId ?? null,
      clientKey: params.clientKey ?? null,
      mimeType: params.inputMimeType ?? null,
      inputBytes: params.inputBuffer.length,
      outputBytes: buffer.length,
    });
    return {
      ok: true,
      buffer,
      mimeType: "audio/ogg",
      fileName: `${path.basename(params.fileName ?? "recording", path.extname(params.fileName ?? "")) || "recording"}.ogg`,
    };
  } catch (error) {
    const typed = error as { error?: NodeJS.ErrnoException; stderr?: string | null };
    const details =
      typed.stderr ||
      typed.error?.message ||
      "Falha ao converter o audio gravado com ffmpeg.";
    logger.error({
      event: "audio.transcode.failed",
      requestId: params.requestId ?? null,
      clientId: params.clientId ?? null,
      clientKey: params.clientKey ?? null,
      mimeType: params.inputMimeType ?? null,
      inputBytes: params.inputBuffer.length,
      stderr: summarizeStderr(details),
    });
    return {
      ok: false,
      error: "audio_transcode_failed",
      details,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
