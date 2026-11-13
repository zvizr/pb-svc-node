// pb-svc-node: a tiny HTTP fixture for testing a hosting platform's process controls. No
// dependencies, no build step. BOOT changes with every process, so a test can tell a fresh copy
// from the old one (on / and /boot). /healthz answers 200 until it is switched to 500, and
// /always500 always fails. The /_ctl/ routes need the header x-ctl-key equal to $CTL_KEY (a random
// value set per deployment); without it, or with a wrong one, they answer 404 like any unknown path.
//   POST /_ctl/exit            exit with status 3 (after answering 202)
//   POST /_ctl/health?code=500 make /healthz answer 500 (code=200 switches it back)
// Only the key above can end the process: a malformed request gets 400, a method other than GET or
// POST gets 405, and no request body is ever read.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const BOOT = crypto.randomBytes(6).toString('hex');
const STARTED = new Date().toISOString();
const KEY = process.env.CTL_KEY || '';
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
let health = 200;
const keyOk = (req) => KEY !== '' && typeof req.headers['x-ctl-key'] === 'string' &&
  crypto.timingSafeEqual(digest(req.headers['x-ctl-key']), digest(KEY));

function handle(req, res, send) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(405, 'text/plain', 'method not allowed\n');
  const u = new URL(req.url, 'http://fixture');
  const p = u.pathname;
  if (p === '/') return send(200, 'text/html; charset=utf-8',
    `<!doctype html><html><head><title>pb-svc-node</title></head><body><p>PB-SVC-NODE boot=${BOOT}</p></body></html>\n`);
  if (p === '/healthz') return send(health, 'text/plain', health === 200 ? 'ok\n' : 'failing on request\n');
  if (p === '/always500') return send(500, 'text/plain', 'failing on purpose\n');
  if (p === '/boot') return send(200, 'application/json', JSON.stringify({ boot: BOOT, pid: process.pid, started: STARTED }) + '\n');
  if (req.method === 'POST' && keyOk(req)) {
    if (p === '/_ctl/exit') {
      send(202, 'text/plain', 'exiting\n');
      return setTimeout(() => process.exit(3), 100);
    }
    const code = Number(u.searchParams.get('code'));
    if (p === '/_ctl/health' && (code === 200 || code === 500)) {
      health = code;
      return send(200, 'text/plain', `healthz now ${code}\n`);
    }
  }
  return send(404, 'text/plain', 'not found\n');
}

const server = http.createServer((req, res) => {
  const send = (code, type, body) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', connection: 'close' });
    res.end(body);
  };
  try {
    handle(req, res, send);
  } catch (e) {
    if (!res.headersSent) send(400, 'text/plain', 'bad request\n'); else res.destroy();
  }
});
server.headersTimeout = 5000;
server.requestTimeout = 10000;
server.keepAliveTimeout = 2000;
server.listen(Number(process.env.PORT), () => console.log('pb-svc-node: listening boot=' + BOOT));
