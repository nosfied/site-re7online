"""Capture raw command output privately; emit only fixed metadata, never argv/env/content."""
import argparse, hashlib, json, os, re, stat, subprocess, time, traceback
from pathlib import Path

def run(directory, label, command, timeout):
    p = Path(directory)
    info = p.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ValueError("private_directory_type_invalid")
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("private_directory_owner_or_mode_invalid")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,60}", label):
        raise ValueError("private_label_invalid")
    os.umask(0o077)
    paths = [p / (label + suffix) for suffix in [".stdout.private", ".stderr.private", ".receipt.private.json"]]
    handles = []
    try:
        for path in paths:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            handles.append(os.fdopen(fd, "wb"))
        began = time.monotonic()
        timed_out = False
        try:
            result = subprocess.run(command, stdout=handles[0], stderr=handles[1], timeout=timeout)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code, timed_out = 124, True
        except OSError:
            handles[1].write(traceback.format_exc().encode())
            code = 125
        for stream in handles[:2]:
            stream.flush()
            os.fsync(stream.fileno())
        record = {"exitCode": code, "timeout": timed_out, "seconds": round(time.monotonic() - began, 3),
                  "outputs": [{"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                              for path in paths[:2]], "rawOutputPrinted": False, "automaticRetry": False}
        handles[2].write((json.dumps(record, sort_keys=True) + "\n").encode())
        handles[2].flush()
        os.fsync(handles[2].fileno())
        print(json.dumps(record, sort_keys=True))
        return code
    finally:
        for handle in handles:
            handle.close()

if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--directory", required=True)
    a.add_argument("--label", required=True)
    a.add_argument("--timeout", type=int, default=60)
    a.add_argument("command", nargs=argparse.REMAINDER)
    v = a.parse_args()
    command = v.command[1:] if v.command[:1] == ["--"] else v.command
    if not command or not 1 <= v.timeout <= 180:
        a.error("bounded_command_required")
    try:
        code = run(v.directory, v.label, command, v.timeout)
    except Exception as error:
        print(json.dumps({"result": "PRIVATE_OUTPUT_CAPTURE_DENIED", "errorClass": type(error).__name__, "rawOutputPrinted": False, "automaticRetry": False}))
        code = 125
    raise SystemExit(code)
