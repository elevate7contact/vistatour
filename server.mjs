import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const PORT = process.env.PORT || 7773;
const DIR = '/Users/juanmillan/Desktop';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  let path = req.url === '/' ? '/VistaTour.html' : req.url;
  const filePath = join(DIR, path);
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Serving on ${PORT}`));
