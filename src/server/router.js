const { URL } = require('node:url');

const routes = [];
const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

function addRoute(method, path, handler) {
  const paramNames = [];
  const pattern = path.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    method: method.toUpperCase(),
    pattern: new RegExp(`^${pattern}$`),
    paramNames,
    handler,
  });
}

const router = {};
for (const method of httpMethods) {
  router[method.toLowerCase()] = (path, handler) => addRoute(method, path, handler);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const query = Object.fromEntries(urlObj.searchParams);

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;

    const params = {};
    for (let i = 0; i < route.paramNames.length; i++) {
      params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
    }

    let body = null;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try {
        body = await parseBody(req);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return true;
      }
    }

    try {
      await route.handler(req, res, { params, query, body });
    } catch (err) {
      console.error('Route handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
    return true;
  }

  return false;
}

module.exports = { router, handleRequest };
