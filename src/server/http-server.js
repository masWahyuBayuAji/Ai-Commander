const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleRequest } = require('./router');
const wsServer = require('./ws-server');

// Load all route modules (side-effect: registers routes)
require('./routes/settings.routes');
require('./routes/project-groups.routes');
require('./routes/kanban-groups.routes');
require('./routes/tasks.routes');
require('./routes/deleted-tasks.routes');
require('./routes/orchestrator.routes');
require('./routes/dashboard.routes');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const NODE_MODULES_DIR = path.join(__dirname, '..', '..', 'node_modules');

const VENDOR_PACKAGES = {
  'xterm': '@xterm/xterm',
  'xterm-addon-fit': '@xterm/addon-fit',
  'xterm-addon-web-links': '@xterm/addon-web-links',
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const contentType = getMimeType(filePath);
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
  return true;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function createServer(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      const handled = await handleRequest(req, res);
      if (!handled) {
        sendJson(res, 404, { error: 'Not Found' });
      }
      return;
    }

    // Vendor packages from node_modules (allowlisted)
    if (pathname.startsWith('/vendor/')) {
      const parts = pathname.slice('/vendor/'.length).split('/');
      const alias = parts[0];
      const rest = parts.slice(1).join('/');
      const pkgName = VENDOR_PACKAGES[alias];
      if (pkgName) {
        const vendorPath = path.join(NODE_MODULES_DIR, pkgName, rest);
        if (serveStaticFile(res, vendorPath)) return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Static files
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (serveStaticFile(res, filePath)) return;

    // Default to index.html for SPA-like behavior
    if (pathname === '/') {
      filePath = path.join(PUBLIC_DIR, 'index.html');
      if (serveStaticFile(res, filePath)) return;
    }

    // 404 for static files
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  wsServer.attachToServer(server);

  return server;
}

module.exports = { createServer };
