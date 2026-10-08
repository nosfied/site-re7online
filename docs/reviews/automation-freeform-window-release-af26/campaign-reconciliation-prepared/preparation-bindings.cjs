const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
module.exports = {
  sql: require('./waiting-work.cjs').sql,
  noWork(q) {
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../window/waiting-work.private.json')));
    require('./waiting-work.cjs').noWork(q, expected);
  },
  baseline(dir, q) {
    const b=JSON.parse(fs.readFileSync(path.join(dir,'baseline.private.json')));
    for (const k of ['flags','connected','auth']) assert.deepStrictEqual(q[k], b[k], 'identity baseline divergence: '+k);
  },
  frontend(dir, build) {
    const b=JSON.parse(fs.readFileSync(path.join(dir,'baseline.private.json')));
    assert.equal(build,b.frontendBuild,'frontend BUILD_ID diverges from prepared artifact');
  },
  proofs(dir) {
    const b=JSON.parse(fs.readFileSync(path.join(dir,'proof-bindings.private.json')));
    const manifest=path.join(dir,'backup-manifest.json'), restore=path.join(dir,'../window/restore-result.json');
    assert.equal(hash(manifest), b.backupManifestSha256);
    assert.equal(hash(restore), b.restoreResultSha256);
    const m=JSON.parse(fs.readFileSync(manifest)), r=JSON.parse(fs.readFileSync(restore));
    assert.equal(m.files['database.dump'].sha256, b.dumpSha256);
    assert.equal(m.files['database.dump'].bytes, b.dumpBytes);
    assert.equal(m.catalogObjects, b.catalogObjects);
    assert.equal(r.dumpSha256, b.dumpSha256);
    assert(r.temporaryDatabaseRemoved && r.providerCalls === 0 && r.applicationStarted === false);
    assert(Array.isArray(r.migrationChecksumMismatches) && r.migrationChecksumMismatches.length === 0);
  }
};
