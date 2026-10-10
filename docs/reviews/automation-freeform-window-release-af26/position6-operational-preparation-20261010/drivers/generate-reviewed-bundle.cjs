// Reproduction recipe only. Not invoked in the capacity-review round.
// No app entrypoint/provider/DB; reject reuse of a prepared output directory.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
if (process.version !== 'v20.20.0') throw Error('node20_20_0_required');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ADMIN_MANIFEST.json')));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
for (const [name, expected] of Object.entries(manifest.reviewedSourceInputs)) {
  if (hash(fs.readFileSync(name)) !== expected) throw Error('reviewed_source_mismatch:' + name);
}
const esbuild = require(path.resolve('apps/whatsapp-agent/node_modules/esbuild'));
if (esbuild.version !== '0.27.2') throw Error('esbuild_0_27_2_required');
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw Error('new_output_directory_required');
(async () => {
  const result = await esbuild.build({
    entryPoints: ['apps/whatsapp-agent/scripts/reconcile-position6-accepted-delivery.ts'],
    outfile: path.join(output, 'reconcile-position6.mjs'), bundle: true,
    platform: 'node', format: 'esm', target: 'node20', external: ['@prisma/client'],
    metafile: true, write: false,
  });
  const file = result.outputFiles.find(x => x.path.endsWith('reconcile-position6.mjs'));
  if (!file || hash(file.contents) !== manifest.files['reconcile-position6.mjs']) throw Error('prepared_bundle_bytes_mismatch');
  const inputs = Object.keys(result.metafile.inputs).sort();
  if (JSON.stringify(inputs) !== JSON.stringify(Object.keys(manifest.reviewedSourceInputs).sort())) throw Error('prepared_graph_mismatch');
  fs.mkdirSync(output, {mode: 0o700});
  fs.writeFileSync(path.join(output, 'reconcile-position6.mjs'), file.contents, {flag: 'wx', mode: 0o600});
  fs.writeFileSync(path.join(output, 'build-metafile.json'), JSON.stringify(result.metafile, null, 2), {flag: 'wx', mode: 0o600});
  console.log('REPRODUCED_REVIEWED_BUNDLE_HASH_PASS_NO_APPLICATION_START');
})().catch(e => {console.error(e.message);process.exitCode = 1;});
