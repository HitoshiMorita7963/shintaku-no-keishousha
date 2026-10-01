// 依存なしの開発用静的サーバー。 npm run serve → http://localhost:5173/
// （ES Modules は file:// では動かないため、ローカルではこのサーバー経由で開く）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/load-raw.mjs';

const GAME = path.join(ROOT, 'game');
const PORT = Number(process.env.PORT ?? 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.normalize(path.join(GAME, url.endsWith('/') ? url + 'index.html' : url));
  if (!file.startsWith(GAME)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[/** @type {keyof typeof TYPES} */ (path.extname(file))] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`神官養成学園: http://localhost:${PORT}/`));
