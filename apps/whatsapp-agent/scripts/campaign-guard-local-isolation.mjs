import http from 'node:http';
import https from 'node:https';
const db = new URL(process.env.DATABASE_URL);
if (db.hostname !== '127.0.0.1' || db.port !== '55434' || !['/re7_guard_local', '/re7_guard_recovery_base'].includes(db.pathname)) throw new Error('synthetic_local_DB_only');
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('real_network_forbidden');
  return nativeFetch(input, init);
};
for (const transport of [http, https]) {
  const native = transport.request;
  transport.request = function(input, ...rest) {
    const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input.hostname || input.host || 'localhost';
    if (!['127.0.0.1','localhost','::1','[::1]'].includes(host)) throw new Error('real_network_forbidden');
    return native.call(this,input,...rest);
  };
}
