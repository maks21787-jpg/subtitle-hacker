// Subtitle Hacker — локальний сервер: віддає index.html і /api/subs.
// Запуск: node server.js  →  http://localhost:5178
const http = require('http');
const fs = require('fs');
const path = require('path');
const subsHandler = require('./api/subs');

const PORT = process.env.PORT || 5178;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/subs') {
    req.query = Object.fromEntries(u.searchParams);
    return subsHandler(req, res);
  }
  const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/config.js': ['config.js', 'text/javascript'] };
  if (files[u.pathname]) {
    const [name, type] = files[u.pathname];
    res.setHeader('Content-Type', type + '; charset=utf-8');
    return fs.createReadStream(path.join(__dirname, name)).pipe(res);
  }
  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, () => console.log(`Subtitle Hacker: http://localhost:${PORT}`));
