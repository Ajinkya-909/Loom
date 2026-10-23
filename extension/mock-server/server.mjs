// ContextPort mock backend. Node 20+, built-ins only.
//   node mock-server/server.mjs
// Env: PORT=4000  MOCK_TOKEN=devtoken  MOCK_GEMMA=0  MOCK_FAIL=401|413|429|500|slow|drop
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4000);
const TOKEN = process.env.MOCK_TOKEN ?? 'devtoken';
const GEMMA = process.env.MOCK_GEMMA !== '0';
const FAIL = process.env.MOCK_FAIL ?? '';
const DATA = join(dirname(fileURLToPath(import.meta.url)), 'mock-data');

/** sourceUrl -> { version, hash, captureId } */
const byUrl = new Map();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeName = (n) => basename(String(n)).replace(/[^\w.\-]+/g, '_') || 'asset.bin';
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const err = (res, status, code, message) => json(res, status, { error: { code, message } });
const drain = (req) => new Promise((r) => { req.on('end', r); req.on('error', r); req.resume(); });
const authed = (req) => req.headers.authorization === `Bearer ${TOKEN}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
}

async function readJsonFile(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------- POST /api/captures
async function handleCapture(req, res, url) {
  if (FAIL === 'drop') { req.socket.destroy(); return; }
  if (FAIL === 'slow') await sleep(10_000);

  if (['401', '413', '429', '500'].includes(FAIL)) {
    await drain(req);
    const map = { 401: 'UNAUTHORIZED', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED', 500: 'SERVER_ERROR' };
    return err(res, Number(FAIL), map[FAIL], `Simulated failure (MOCK_FAIL=${FAIL})`);
  }
  if (!authed(req)) { await drain(req); return err(res, 401, 'UNAUTHORIZED', 'Bad or missing bearer token'); }

  let form;
  try {
    form = await new Request('http://mock.local/', {
      method: 'POST', headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')),
      body: Readable.toWeb(req), duplex: 'half',
    }).formData();
  } catch (e) {
    return err(res, 400, 'VALIDATION_FAILED', `Could not parse multipart body: ${e.message}`);
  }

  let meta, messages;
  try {
    meta = JSON.parse(await form.get('meta')?.text());
    messages = JSON.parse(await form.get('messages')?.text());
  } catch { return err(res, 400, 'VALIDATION_FAILED', 'meta and messages must be valid JSON parts'); }
  if (!Array.isArray(messages) || messages.length === 0) return err(res, 400, 'VALIDATION_FAILED', 'messages must be a non-empty array');
  if (!meta?.sourceUrl || !['context', 'summarize'].includes(meta.action)) return err(res, 400, 'VALIDATION_FAILED', 'meta.sourceUrl and meta.action are required');
  const snapshot = form.get('snapshot');
  if (!snapshot) return err(res, 400, 'VALIDATION_FAILED', 'snapshot part is required');

  // Duplicate detection: same content hash as the previous capture of this URL.
  const hash = createHash('sha256').update(JSON.stringify(messages.map((m) => [m.role, m.text]))).digest('hex');
  const prev = byUrl.get(meta.sourceUrl);
  const force = url.searchParams.get('force') === '1';
  if (prev && prev.hash === hash && !force) {
    console.log(`\n= duplicate of v${prev.version} (${prev.captureId.slice(0, 8)}) - nothing stored`);
    return json(res, 200, { duplicate: true, captureId: prev.captureId, version: prev.version, viewerUrl: `/c/${prev.captureId}` });
  }

  const captureId = randomUUID();
  const version = (prev?.version ?? 0) + 1;
  byUrl.set(meta.sourceUrl, { version, hash, captureId });

  const dir = join(DATA, captureId);
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'meta.json'), JSON.stringify({ ...meta, _version: version, _receivedAt: new Date().toISOString() }, null, 2));
  await writeFile(join(dir, 'messages.json'), JSON.stringify(messages, null, 2));
  await writeFile(join(dir, 'snapshot.html'), Buffer.from(await snapshot.arrayBuffer()));

  let assetCount = 0, assetBytes = 0;
  for (const [key, val] of form.entries()) {
    if (!key.startsWith('asset:') || typeof val === 'string') continue;
    const buf = Buffer.from(await val.arrayBuffer());
    await writeFile(join(dir, 'assets', safeName(val.name)), buf);
    assetCount++; assetBytes += buf.length;
  }

  const roles = messages.reduce((a, m) => ((a[m.role] = (a[m.role] ?? 0) + 1), a), {});
  const exp = meta.expected ?? {};
  const failed = (meta.assets ?? []).filter((a) => !a.uploaded).length;
  console.log(`
+--------------------------------------------------------------
| CAPTURE ${captureId.slice(0, 8)}  v${version}   action=${meta.action}   platform=${meta.platform}
| title    ${meta.title}
| url      ${meta.sourceUrl}
| messages ${messages.length} (expected ${exp.messageCount})   ${Object.entries(roles).map(([k, v]) => `${k}:${v}`).join(' ')}
| pre/table/img expected ${exp.codeBlockCount}/${exp.tableCount}/${exp.imageCount}
| assets   ${assetCount} saved (${(assetBytes / 1024).toFixed(1)} KB), ${failed} not uploaded
| warnings ${(meta.clientWarnings ?? []).map((w) => w.code).join(', ') || 'none'}
| snapshot ${(snapshot.size / 1024).toFixed(0)} KB   stored in mock-data/${captureId}/
+--------------------------------------------------------------`);
  if (messages.length !== exp.messageCount) console.log(`! message count differs from expected (${messages.length} vs ${exp.messageCount})`);

  json(res, 202, {
    chatId: createHash('sha1').update(meta.sourceUrl).digest('hex').slice(0, 12), captureId, version,
    jobId: randomUUID(), duplicate: false, viewerUrl: `/c/${captureId}`, eventsUrl: `/api/captures/${captureId}/events`,
  });
}

// ---------------------------------------------------------------- viewer pages
const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  :root{color-scheme:light dark;--bg:#faf9f5;--ink:#1f1e1d;--muted:#6e695d;--line:#e6e1d3;--card:#fff;--acc:#c6613f}
  @media (prefers-color-scheme:dark){:root{--bg:#212121;--ink:#ececec;--muted:#a3a3a3;--line:#3d3d3d;--card:#2b2b2b;--acc:#e07a55}}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:760px;margin:0 auto;padding:40px 20px}
  h1{font:600 28px Georgia,serif;margin:0 0 6px} a{color:var(--acc)} .m{color:var(--muted)}
  .c{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
  code{font:12.5px ui-monospace,monospace} .u{border-left:3px solid var(--acc)} img{max-width:100%;border-radius:8px}
  pre{white-space:pre-wrap;margin:0}
</style><main>${body}</main>`;

async function viewer(res, id) {
  const dir = join(DATA, id);
  const meta = await readJsonFile(join(dir, 'meta.json'));
  const messages = await readJsonFile(join(dir, 'messages.json'));
  if (!meta || !messages) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(page('Not found', '<h1>Capture not found</h1><p><a href="/">Back to library</a></p>')); }
  const assets = existsSync(join(dir, 'assets')) ? await readdir(join(dir, 'assets')) : [];
  const body = `<p><a href="/">Library</a></p><h1>${esc(meta.title)}</h1>
<p class="m">v${meta._version} · ${esc(meta.platform)} · action <code>${esc(meta.action)}</code> · ${messages.length} messages · <a href="${esc(meta.sourceUrl)}">source</a></p>
<div class="c"><b>Expected</b> <code>${esc(JSON.stringify(meta.expected))}</code><br><b>Warnings</b> <code>${esc(JSON.stringify(meta.clientWarnings))}</code></div>
<h3>Assets (${assets.length})</h3>${assets.map((a) => `<div class="c"><a href="/c/${id}/assets/${encodeURIComponent(a)}">${esc(a)}</a></div>`).join('') || '<p class="m">None</p>'}
<h3>Messages</h3>${messages.map((m) => `<div class="c ${m.role === 'user' ? 'u' : ''}"><b>${esc(m.role)}</b> <span class="m">#${m.idx}</span><pre>${esc(m.text.slice(0, 600))}${m.text.length > 600 ? '…' : ''}</pre></div>`).join('')}`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page(meta.title, body));
}

async function library(res) {
  const ids = existsSync(DATA) ? await readdir(DATA) : [];
  const rows = [];
  for (const id of ids) { const m = await readJsonFile(join(DATA, id, 'meta.json')); if (m) rows.push({ id, m }); }
  rows.sort((a, b) => String(b.m._receivedAt).localeCompare(String(a.m._receivedAt)));
  const body = `<h1>ContextPort mock library</h1><p class="m">${rows.length} captures</p>${rows.map(({ id, m }) => `<div class="c"><a href="/c/${id}">${esc(m.title)}</a><br><span class="m">v${m._version} · ${esc(m.action)} · ${esc(m._receivedAt)}</span></div>`).join('') || '<p class="m">Nothing captured yet.</p>'}`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page('ContextPort mock', body));
}

// ---------------------------------------------------------------- router
createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      if (!authed(req)) return err(res, 401, 'UNAUTHORIZED', 'Bad or missing bearer token');
      return json(res, 200, { version: '0.1.0-mock', gemmaEnabled: GEMMA, authorized: true, defaultMode: 'B' });
    }
    if (req.method === 'POST' && url.pathname === '/api/captures') return await handleCapture(req, res, url);
    if (req.method === 'GET' && url.pathname === '/') return await library(res);
    const m = url.pathname.match(/^\/c\/([\w-]+)(?:\/assets\/(.+))?$/);
    if (req.method === 'GET' && m) {
      if (!m[2]) return await viewer(res, m[1]);
      const file = join(DATA, m[1], 'assets', safeName(decodeURIComponent(m[2])));
      if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200); return res.end(await readFile(file));
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  } catch (e) {
    console.error('handler error:', e.message);
    if (!res.headersSent) err(res, 500, 'SERVER_ERROR', 'mock server error');
  }
}).listen(PORT, () => {
  console.log(`ContextPort mock server on http://localhost:${PORT}`);
  console.log(`  token=${TOKEN}  gemma=${GEMMA ? 'on' : 'off'}  fail=${FAIL || 'none'}  data=${DATA}`);
});
