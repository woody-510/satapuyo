// インスタのストーリー広告の画像（1080x1920）を ads/ に書き出す
//   npm i -D playwright（ブラウザも必要）してから： node tools/make_story_ads.mjs
//   ゲーム画面の写真は ads/src/cap_field.png（とことん）と ads/src/cap_versus.png（CPU たいせん）。差しかえてもOK
//   絵の中身は tools/story_ads_draw.js
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (req, res) => {
  try {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
await page.addScriptTag({ path: join(root, 'tools/story_ads_draw.js') });
const images = await page.evaluate(() => window.drawStoryAds());
for (const [name, url] of Object.entries(images)) {
  await writeFile(join(root, 'ads', name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('書き出し: ads/' + name + '.png');
}
await browser.close();
server.close();
