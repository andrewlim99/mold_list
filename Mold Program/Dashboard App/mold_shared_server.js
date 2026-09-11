const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = 3210;
const DASHBOARD_FILE = path.join(ROOT, 'mold_dashboard.html');
const DATA_FILE = path.join(ROOT, 'mold_shared_rows.json');

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readEmbeddedRows() {
  try {
    const html = fs.readFileSync(DASHBOARD_FILE, 'utf8');
    const match = html.match(/<script id="mold-data" type="application\/json">([\s\S]*?)<\/script>/i);
    if (!match) return [];
    const rows = JSON.parse(match[1]);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) return;
  const payload = {
    rows: readEmbeddedRows(),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function readPayload() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows)) return parsed;
  } catch (_) {}
  return { rows: [], updatedAt: new Date().toISOString() };
}

function writePayload(rows) {
  const payload = {
    rows: Array.isArray(rows) ? rows : [],
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === '/' ? '/mold_dashboard.html' : reqPath;
  const fullPath = path.join(ROOT, safePath.replace(/^\/+/, ''));
  if (!fullPath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.ico': 'image/x-icon'
  };
  send(res, 200, fs.readFileSync(fullPath), types[ext] || 'application/octet-stream');
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/', true);

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (req.method === 'GET' && parsed.pathname === '/api/health') {
    send(res, 200, JSON.stringify({ ok: true, dataFile: DATA_FILE }));
    return;
  }

  if (req.method === 'GET' && parsed.pathname === '/api/rows') {
    send(res, 200, JSON.stringify(readPayload()));
    return;
  }

  if (req.method === 'POST' && parsed.pathname === '/api/rows') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsedBody = JSON.parse(body || '{}');
        const payload = writePayload(parsedBody.rows);
        send(res, 200, JSON.stringify({ ok: true, count: payload.rows.length, updatedAt: payload.updatedAt }));
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (req.method === 'GET') {
    serveStatic(parsed.pathname || '/', res);
    return;
  }

  send(res, 405, JSON.stringify({ ok: false, error: 'Method not allowed' }));
});

ensureDataFile();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mold shared server running at http://127.0.0.1:${PORT}/mold_dashboard.html`);
  console.log(`Shared data file: ${DATA_FILE}`);
});
