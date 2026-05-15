// tests/ci/serve.js
// Zero-dependency static file server for Playwright CI.
// Uses Node.js built-in http and fs modules only.
// Serves the project root (two directories above this file).
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '..', '..');

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.png':   'image/png',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.ttf':   'font/ttf',
};

const server = http.createServer(function (req, res) {
  // Strip query string and decode percent-encoding.
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (_) {
    res.writeHead(400); res.end('Bad request'); return;
  }

  // Normalise: root → index.html.
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // Remove leading slash(es) so path.resolve treats it as relative to ROOT.
  const relPath  = urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relPath);

  // Path-traversal guard: resolved path must stay within ROOT.
  const rootNorm = path.resolve(ROOT);
  if (filePath !== rootNorm && !filePath.startsWith(rootNorm + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + relPath);
      return;
    }
    const ext         = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, HOST, function () {
  // Playwright's webServer watches stdout for the url pattern.
  console.log('ready: http://' + HOST + ':' + PORT);
});
