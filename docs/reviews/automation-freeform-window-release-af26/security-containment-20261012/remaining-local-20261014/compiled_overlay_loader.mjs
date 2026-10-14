// Local tests only: untouched imports resolve to the attested active base.
// No application entrypoint, scheduler, provider or recovery execution.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  const prefix = path.resolve(process.env.SEED_TEST_OVERLAY) + '/dist/';
  if (context.parentURL?.startsWith('file:') && specifier.startsWith('.')) {
    const parent=fileURLToPath(context.parentURL);
    const p=path.resolve(path.dirname(parent),specifier);
    if (parent.startsWith(prefix) && p.startsWith(prefix) && !fs.existsSync(p)) {
      const fallback=path.resolve(process.env.SEED_TEST_BASE,'dist',path.relative(prefix,p));
      return nextResolve(pathToFileURL(fallback).href,context);
    }
  }
  return nextResolve(specifier,context);
}
