'use strict';
// Offline preparation codec. Never loads runtime environment or rewrites source events.
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const FIELDS = new Set(['recipientsCiphertext', 'componentsByWaIdCiphertext']);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function scope(s) {
  assert(s && typeof s.clientId === 'string' && s.clientId && typeof s.eventId === 'string' && s.eventId && FIELDS.has(s.field), 'seed_scope_required');
  return JSON.stringify([s.clientId, s.eventId, s.field]);
}
function key(secret) {
  assert(typeof secret === 'string' && secret.length >= 32, 'seed_key_required');
  return crypto.createHash('sha256').update(secret.trim(), 'utf8').digest();
}
function decode(raw, secret, aad, prefix) {
  assert(typeof raw === 'string' && raw.startsWith(prefix), 'seed_cipher_version');
  const parts = raw.slice(prefix.length).split(':');
  assert(parts.length === 3, 'seed_cipher_structure');
  const bytes = parts.map(p => {
    const b = Buffer.from(p, 'base64');
    assert(b.toString('base64') === p, 'seed_cipher_encoding');
    return b;
  });
  assert(bytes[0].length === 12 && bytes[1].length === 16 && bytes[2].length > 0, 'seed_cipher_structure');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(secret), bytes[0]);
    if (aad) d.setAAD(Buffer.from(aad));
    d.setAuthTag(bytes[1]);
    return JSON.parse(Buffer.concat([d.update(bytes[2]), d.final()]).toString('utf8'));
  } catch { throw new Error('seed_cipher_authentication_denied'); }
}
function readHistorical({ciphertext, context, authorization, historicalSecret, now}) {
  const s = scope(context);
  assert(Number.isFinite(now), 'seed_observation_time_required');
  assert(authorization && authorization.version === 1 && Array.isArray(authorization.entries), 'seed_authorization_required');
  assert(Number.isFinite(authorization.expiresAt) && now < authorization.expiresAt, 'seed_authorization_expired');
  assert(authorization.keySha256 === sha(historicalSecret), 'seed_historical_key_drift');
  const entries = authorization.entries.filter(e => scope(e) === s && e.ciphertextSha256 === sha(ciphertext));
  assert(entries.length === 1, 'seed_ciphertext_not_uniquely_authorized');
  return decode(ciphertext, historicalSecret, null, 'v1:');
}
function writeDedicated({value, context, dedicatedSecret, epoch}) {
  const s = scope(context);
  assert(typeof epoch === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(epoch), 'seed_epoch_required');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(dedicatedSecret), iv);
  c.setAAD(Buffer.from(JSON.stringify([epoch, s])));
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return {ciphertext: 'v2:' + [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join(':'), epoch};
}
function readDedicated({record, context, dedicatedSecret, epoch}) {
  assert(record.epoch === epoch, 'seed_epoch_drift');
  return decode(record.ciphertext, dedicatedSecret, JSON.stringify([epoch, scope(context)]), 'v2:');
}
module.exports = {readHistorical, writeDedicated, readDedicated};
