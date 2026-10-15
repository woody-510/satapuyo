// エンドロールを mp4 に書き出す（YouTube 向け 1920x1080・30fps、音はテーマ7）
//
//   node tools/video/make_ending_video.mjs
//
// しくみ：このフォルダのページ（ending_video.html）を Edge で画面なしに開き、ゲームと同じ描き方で
// 1コマずつ描かせて受けとり、ffmpeg で動画にする。音は music/ のテーマ7（なければ assets/sound/bgm_ending.mp3）。
// 必要なもの：Node.js 18 以上 / ffmpeg / Microsoft Edge（ネットにつながっていること。文字のフォントを読むため）
// できあがり：music/ と VSTプラグイン/BGM/ に「テーマ7 エンディング（J-POP）エンドロール.mp4」
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGINS = process.env.WOODY_PLUGINS || path.join(os.homedir(), 'Desktop', 'VSTプラグイン');
const NAME = 'テーマ7 100万点の空（エンディング・J-POP）';
const OUT_DIRS = [path.join(ROOT, 'music'), path.join(PLUGINS, 'BGM')];
const W = 1920, H = 1080, FPS = 30;
const EDGE = [
  process.env.EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => p && fs.existsSync(p));
if (!EDGE) {
  console.error('Microsoft Edge が見つかりません（環境変数 EDGE で場所を指定できます）');
  process.exit(1);
}

const audio = [path.join(ROOT, 'music', `${NAME}.wav`), path.join(ROOT, 'assets', 'sound', 'bgm_ending.mp3')].find((p) => fs.existsSync(p));
if (!audio) {
  console.error('エンディングの曲がありません（先に node tools/music/make_bgm.mjs jpop）');
  process.exit(1);
}
const duration = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]).toString().trim();
// js/config.js から、曲のあとの長さ（tail）と最後のボイスを読む
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), sandbox);
const CFG = sandbox.window.GAME_CONFIG;
const tail = (CFG.ending && CFG.ending.tail) || 0;
const voiceKey = CFG.ending && CFG.ending.endVoice;
const voice = voiceKey && CFG.voices && CFG.voices[voiceKey] ? path.join(ROOT, CFG.voices[voiceKey]) : null;
const total = process.env.TEST_SECONDS ? +process.env.TEST_SECONDS : duration + tail; // TEST_SECONDS は確認用
const frames = Math.round(total * FPS);
for (const d of OUT_DIRS) fs.mkdirSync(d, { recursive: true });
const out = path.join(OUT_DIRS[0], `${NAME}エンドロール.mp4`);
console.log(`エンドロールを書き出します：${total.toFixed(1)} 秒・${frames} コマ（${W}x${H}・${FPS}fps）${voice ? '・最後に ' + path.basename(voice) : ''}`);

// 音：曲のうしろに無音をつけて全体の長さにし、config の endVoiceAt の時刻にボイスを重ねる
const delay = Math.round((duration + ((CFG.ending && CFG.ending.endVoiceAt) ?? 0.2)) * 1000);
const audioArgs = voice
  ? ['-i', audio, '-i', voice, '-filter_complex', `[1:a]apad=whole_dur=${total}[s];[2:a]adelay=${delay}|${delay}[v];[s][v]amix=inputs=2:normalize=0:duration=first[a]`, '-map', '0:v', '-map', '[a]']
  : ['-i', audio, '-filter_complex', `[1:a]apad=whole_dur=${total}[a]`, '-map', '0:v', '-map', '[a]'];
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...audioArgs,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', total.toFixed(3), out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
let got = 0;
let edge = null;
const t0 = Date.now();
const finish = (code, msg) => {
  if (msg) console.log(msg);
  if (edge) edge.kill();
  server.close();
  if (code) {
    ff.kill();
    process.exit(code);
  }
  ff.stdin.end();
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (url.pathname === '/frame') {
        const ok = ff.stdin.write(body);
        got++;
        if (got % 300 === 0 || got === frames) {
          const sec = (Date.now() - t0) / 1000;
          process.stdout.write(`\r  ${got}/${frames} コマ（${Math.round((got / frames) * 100)}%・のこり約 ${Math.round((sec / got) * (frames - got))} 秒）   `);
        }
        // ffmpeg が追いつくまで待ってから返事をする
        if (ok) res.end('ok');
        else ff.stdin.once('drain', () => res.end('ok'));
        return;
      }
      res.end('ok');
      if (url.pathname === '/log') console.log('  [ページ] ' + body.toString());
      if (url.pathname === '/done') finish(0, '\n  コマを描き終わりました。動画にまとめています…');
      if (url.pathname === '/error') finish(1, '\nページでエラー: ' + body.toString());
    });
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'satapuyo_edge_'));
  const page = `http://127.0.0.1:${port}/tools/video/ending_video.html?w=${W}&h=${H}&fps=${FPS}&dur=${duration}&max=${frames}`;
  edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, `--window-size=${W},${H}`, page,
  ], { stdio: 'ignore' });
  edge.on('exit', () => fs.rmSync(profile, { recursive: true, force: true }));
});

ff.on('exit', (code) => {
  if (code !== 0) {
    console.error('ffmpeg が失敗しました');
    process.exit(1);
  }
  for (const d of OUT_DIRS.slice(1)) fs.copyFileSync(out, path.join(d, path.basename(out)));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`  できました：${out}（${mb} MB・${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  console.log('  コピー先：' + OUT_DIRS.slice(1).join(' / '));
});
