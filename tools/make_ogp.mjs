// SNS に URL を貼ったときのプレビュー画像（assets/ui/ogp.png・1200x630）を作る
//   npm i -D playwright（ブラウザも必要）してから： node tools/make_ogp.mjs
// 絵はシェアの画像と同じ作り（js/share.js の Share.card）
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
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof Share !== 'undefined'); // const で作ったものは window には付かない
const dataUrl = await page.evaluate(async () => {
  // 文字（M PLUS Rounded 1c）を読み終わるまで待つ（読めないときは 5秒で あきらめる）
  await Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 5000))]);
  const CFG = window.GAME_CONFIG;
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = () => ok(i); i.src = src; });
  const faces = await Promise.all([11, 2, 5, 9, 16].map((n) => load(CFG.faces[n - 1].src)));
  const logo = await load(CFG.images.logo);
  return Share.card({
    mode: 'さたろうの顔が おちてくる ぷよぷよ風パズル',
    big: '5', unit: 'モードで あそべる',
    sub: 'とことん・タイム・ぜんけし・たいせん・くみて',
    face: faces[0], faces: faces.slice(1), logo,
  }).toDataURL('image/png');
});
await writeFile(join(root, 'assets/ui/ogp.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('書き出し: assets/ui/ogp.png');
await browser.close();
server.close();
