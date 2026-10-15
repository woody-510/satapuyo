// さたぷよ BGM を Woody Class のプラグインで作るスクリプト
//
//   node tools/music/make_bgm.mjs              → 3曲ぜんぶ
//   node tools/music/make_bgm.mjs title game   → 指定した曲だけ
//
// 音はすべてプラグインの処理（processBlock）をそのまま通したもの：
//   ドラム   … Woody Tsuzumi Beats   （TsuzumiTool.exe render <ジャンル> <wav> <小節> <テンポ> <グルーヴ>）
//   コード   … Woody Wasei Chords    （WaonTool.exe events <進行の ID> … でボイシングを取り出す）
//   音色     … Woody Katachi Synth   （KatachiTool.exe render <プリセット> <csv> <wav> all 0）
//   仕上げEQ … Woody Giongo EQ        （HibikiUiShots.exe render <in> <out> <楽器> preset=…）
// メロディとリズムの刻み方だけはこのファイルに書いてある（Wasei のコードの構成音に合わせて鳴らす）。
//
// 必要なもの: Node.js 18 以上 / ffmpeg / 上の 4 つの exe
//   exe の場所は %USERPROFILE%\WoodyClassBuild\…（作り方は Tsuzumi\コード\marketing\slideshow\使い方.md）。
//   別の場所なら環境変数 WOODY_BUILD でフォルダを指定する。
//
// ループのしくみ：曲を3回ぶん並べて鳴らし、2回目だけを切り出す（前の回の余韻が乗るので、つなぎ目で音が切れない）。
// ゲーム側は loopStart〜loopEnd（js/config.js）を、つなぎ目を少し重ねながらくり返す。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'assets', 'sound');
const BUILD = process.env.WOODY_BUILD || path.join(os.homedir(), 'WoodyClassBuild');
const TOOL = {
  tsuzumi: path.join(BUILD, 'Tsuzumi', 'build', 'TsuzumiTool_artefacts', 'Release', 'TsuzumiTool.exe'),
  waon: path.join(BUILD, 'Waon', 'build_tool', 'WaonTool_artefacts', 'Release', 'WaonTool.exe'),
  katachi: path.join(BUILD, 'Katachi', 'build', 'KatachiTool_artefacts', 'Release', 'KatachiTool.exe'),
  giongo: path.join(BUILD, 'Hibiki', 'build_tool', 'HibikiUiShots_artefacts', 'Release', 'HibikiUiShots.exe'),
};
const SR = 48000; // ツールの出力に合わせる
const TAIL = 0.3; // ループの後ろにつけ足す秒数
const LOOP_START = 0.1; // ゲーム側のループ開始位置（秒）
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'satapuyo_bgm_'));

// Katachi Synth のプリセット番号（KatachiTool render の番号）
const K = {
  subBass: 1, bass8bit: 2, reese: 3, supersaw: 4, chip12: 5, chip25: 6, chip50: 7, pad: 8, pluck: 10, lofi: 11,
  sine: 100, square: 101, saw: 102, triangle: 103,
};

// ---------------- 小物 ----------------
function run(exe, args) {
  return execFileSync(exe, args, { cwd: WORK, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 });
}
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('音名がおかしい: ' + n);
  return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
// "C5 . E5 - G5" → [{beat, len, note}]。「.」はのばす、「-」は休み
function seq(str, step, start) {
  const toks = str.trim().split(/\s+/);
  const out = [];
  toks.forEach((tk, i) => {
    if (tk === '.' || tk === '-') return;
    let len = 1;
    while (toks[i + len] === '.') len++;
    out.push({ beat: start + i * step, len: len * step, note: midi(tk) });
  });
  return out;
}

// ---------------- 音の読み書き ----------------
function readWav(file) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}
function writeWav(file, x) {
  const n = x.length / 2;
  const buf = Buffer.alloc(44 + n * 6);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 6, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 6, 40);
  for (let i = 0; i < x.length; i++) buf.writeIntLE(Math.round(Math.max(-1, Math.min(1, x[i])) * 8388607), 44 + i * 3, 3);
  fs.writeFileSync(file, buf);
}
// ラウドネス（LUFS）を測る
function measureLufs(x) {
  const f = path.join(WORK, 'measure.wav');
  writeWav(f, x);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 30 }).stderr || '';
  const v = parseFloat(r.slice(r.lastIndexOf('Integrated loudness')).split('I:')[1]);
  return Number.isFinite(v) ? v : -70;
}

// ---------------- プラグイン ----------------
// Wasei Chords の進行をボイシングごと取り出す → [{beat, len, bass, upper[]}]（120 BPM で書き出して拍に直す）
function waseiChords(id, twoBeats = false) {
  const csv = path.join(WORK, `waon_${id}.csv`);
  run(TOOL.waon, ['events', id, csv, '120', twoBeats ? '1' : '0', '1']);
  const lines = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/);
  const total = +lines[0].split(',')[1];
  const ons = new Map();
  for (const l of lines.slice(1)) {
    const [t, kind, note] = l.split(',');
    if (kind === 'on') (ons.get(+t) || ons.set(+t, []).get(+t)).push(+note);
  }
  const times = [...ons.keys()].sort((a, b) => a - b);
  return times.map((t, i) => {
    const notes = ons.get(t).sort((a, b) => a - b);
    const end = times[i + 1] ?? total;
    return { beat: t / 24000, len: (end - t) / 24000, bass: notes[0], upper: notes.slice(1) };
  });
}

// Katachi Synth で鳴らす。notes: [{beat, len, note}]（1ループぶん）→ 3ループぶんの音
function katachi(song, preset, notes) {
  const ev = [];
  const sp = (beat) => Math.round(beat * song.spbS);
  for (let k = 0; k < 3; k++) {
    for (const n of notes) {
      const on = k * song.loopS + sp(n.beat);
      const off = k * song.loopS + sp(n.beat + n.len);
      if (off > on) ev.push([on, 1, n.note], [off, 0, n.note]);
    }
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // 同じ時刻は off を先に
  const csv = path.join(WORK, 'notes.csv');
  fs.writeFileSync(csv, `total,${song.total}\n` + ev.map(([t, on, n]) => `${t},${on ? 'on' : 'off'},${n}`).join('\n') + '\n');
  const wav = path.join(WORK, 'katachi.wav');
  run(TOOL.katachi, ['render', String(preset), csv, wav, 'all', '0']);
  return fit(readWav(wav), song.total);
}

// Tsuzumi Beats のグルーヴ。sections: [{from, bars, genre, groove}] → 3ループぶんに並べる
function tsuzumi(song, sections) {
  const out = new Float32Array(song.total * 2);
  for (const s of sections) {
    const wav = path.join(WORK, 'drums.wav');
    run(TOOL.tsuzumi, ['render', s.genre, wav, String(s.bars), String(song.bpm), String(s.groove)]);
    const x = readWav(wav);
    const fade = Math.round(0.003 * SR);
    const n = Math.min(x.length / 2, Math.round(s.bars * 4 * song.spbS));
    for (let k = 0; k < 3; k++) {
      const at = k * song.loopS + Math.round(s.from * 4 * song.spbS);
      for (let i = 0; i < n; i++) {
        const g = Math.min(1, i / fade, (n - i) / fade);
        const j = (at + i) * 2;
        if (j + 1 >= out.length) break;
        out[j] += x[i * 2] * g;
        out[j + 1] += x[i * 2 + 1] * g;
      }
    }
  }
  return out;
}

// Giongo EQ をかける
function giongo(x, instrument, args) {
  const a = path.join(WORK, 'eq_in.wav'), b = path.join(WORK, 'eq_out.wav');
  writeWav(a, x);
  run(TOOL.giongo, ['render', a, b, instrument, ...args]);
  return fit(readWav(b), x.length / 2);
}

function fit(x, frames) {
  if (x.length === frames * 2) return x;
  const y = new Float32Array(frames * 2);
  y.set(x.subarray(0, Math.min(x.length, y.length)));
  return y;
}

// ---------------- 曲の組み立て ----------------
class Song {
  constructor(name, { bpm, bars }) {
    Object.assign(this, { name, bpm, bars });
    this.spbS = (60 / bpm) * SR; // 1拍のサンプル数
    this.loopS = Math.round(bars * 4 * this.spbS);
    if (Math.abs(this.loopS - bars * 4 * this.spbS) > 1e-6) throw new Error('ループの長さが整数サンプルにならないテンポ');
    this.total = this.loopS * 3 + SR * 2;
    this.chords = [];
    this.stems = [];
  }
  // Wasei の進行を順番に並べる：[[ID, 回数, 2拍ずつ?], …]
  progression(list) {
    let at = 0;
    for (const [id, times = 1, two = false] of list) {
      const prog = waseiChords(id, two);
      const len = prog.reduce((s, c) => Math.max(s, c.beat + c.len), 0);
      for (let r = 0; r < times; r++) {
        for (const c of prog) this.chords.push({ ...c, beat: at + c.beat });
        at += len;
      }
    }
    if (Math.abs(at - this.bars * 4) > 1e-6) throw new Error(`${this.name}: 進行の長さ ${at} 拍が ${this.bars * 4} 拍と合わない`);
  }
  chordAt(beat) {
    return this.chords.find((c) => beat >= c.beat - 1e-9 && beat < c.beat + c.len - 1e-9) || this.chords[this.chords.length - 1];
  }
  // 1小節ぶんの刻み [[拍, 長さ, 音程の足し算?], …] を、Wasei のコードの音でくり返す
  //   what: 'upper'（ベースを除く和音）| 'bass'（いちばん低い音）| 'arp'（和音の音を順に）
  rhythm(fromBar, toBar, pattern, what, shift = 0) {
    const notes = [];
    for (let b = fromBar; b < toBar; b++) {
      pattern.forEach(([o, len, iv = 0], idx) => {
        const beat = b * 4 + o;
        const c = this.chordAt(beat);
        if (what === 'upper') c.upper.forEach((n) => notes.push({ beat, len, note: n + shift }));
        else if (what === 'bass') notes.push({ beat, len, note: c.bass + iv + shift });
        else notes.push({ beat, len, note: c.upper[(idx + b) % c.upper.length] + shift });
      });
    }
    return notes;
  }
  melody(bars, fromBar, shift = 0) {
    return bars.flatMap((bar, i) => seq(bar, 0.5, (fromBar + i) * 4)).map((n) => ({ ...n, note: n.note + shift }));
  }
  synth(name, preset, notes, targetLufs) {
    this.stems.push({ name, x: katachi(this, preset, notes), target: targetLufs });
  }
  drums(sections, targetLufs, eq = null) {
    let x = tsuzumi(this, sections);
    if (eq) x = giongo(x, 'drums', eq);
    this.stems.push({ name: 'drums', x, target: targetLufs });
  }

  render({ eq, target }) {
    const mid = (x) => x.subarray(this.loopS * 2, this.loopS * 4);
    const mix = new Float32Array(this.total * 2);
    for (const s of this.stems) {
      const now = measureLufs(mid(s.x));
      const g = Math.pow(10, (s.target - now) / 20);
      for (let i = 0; i < mix.length; i++) mix[i] += s.x[i] * g;
      console.log(`    ${s.name.padEnd(8)} ${now.toFixed(1)} → ${s.target} LUFS`);
    }
    let x = eq ? giongo(mix, 'full', eq) : mix;
    // 2回目のループ＋少しを切り出して、音量をそろえる（ピークはなめらかに抑える）
    const from = this.loopS, to = this.loopS * 2 + Math.round(TAIL * SR);
    const src = x.slice(from * 2, to * 2);
    const knee = 0.8;
    const level = (g) => {
      const out = new Float32Array(src.length);
      for (let i = 0; i < out.length; i++) {
        let v = src[i] * g;
        const a = Math.abs(v);
        if (a > knee) v = Math.sign(v) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
        out[i] = v * 0.94;
      }
      return out;
    };
    // ピークを抑えると少し小さくなるので、2回測って合わせる
    let g = Math.pow(10, (target - measureLufs(src.subarray(0, this.loopS * 2))) / 20);
    let out = level(g);
    g *= Math.pow(10, (target - measureLufs(out.subarray(0, this.loopS * 2))) / 20);
    out = level(g);
    console.log(`    仕上がり ${measureLufs(out.subarray(0, this.loopS * 2)).toFixed(1)} LUFS`);
    return out;
  }
}

// ===================================================================
//  タイトル：8bit のテーマソング（C メジャー / 150 BPM / 16小節）
// ===================================================================
function titleSong() {
  const s = new Song('title', { bpm: 150, bars: 16 });
  s.progression([['M06'], ['M02'], ['M24']]); // カノン進行 → 王道進行（三和音）→ ♭VI–♭VII–I
  s.drums([
    { from: 0, bars: 8, genre: 'anison', groove: 0 }, // 速い 8ビート
    { from: 8, bars: 8, genre: 'anison', groove: 9 }, // クラッシュ 4分のサビ
  ], -18, ['preset=pop']);
  const eighths = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  s.synth('chords', K.chip12, s.rhythm(0, 16, eighths.map((o) => [o, 0.3]), 'upper'), -23);
  s.synth('bass', K.bass8bit, s.rhythm(0, 16, eighths.map((o, i) => [o, 0.42, i % 2 ? 12 : 0]), 'bass'), -19);
  s.synth('melody', K.chip25, s.melody([
    // カノン進行（C G Am Em F C F G）
    'C6 . . G5 E5 . G5 .', 'D6 . . B5 G5 . B5 .', 'C6 . . A5 E5 . A5 .', 'B5 . . G5 E5 . . .',
    'A5 . . C6 F6 . E6 D6', 'E6 . . C6 G5 . . .', 'A5 . G5 . F5 . A5 .', 'G5 . . . B5 . D6 .',
    // 王道進行（F G Em Am）→ C A♭ B♭ C
    'C6 . A5 . F5 . A5 .', 'D6 . B5 . G5 . B5 .', 'E6 . D6 . B5 . G5 .', 'A5 . . . C6 . E6 .',
    'E6 . . C6 G5 . E5 .', 'Ab5 . C6 . Eb6 . C6 .', 'Bb5 . D6 . F6 . D6 .', 'C6 . . . . . - -',
  ], 0, -12), -17);
  return s.render({ eq: ['preset=brightpop'], target: -14.5 });
}

// ===================================================================
//  メニュー：ローファイ・ヒップホップ（C メジャー / 80 BPM / 16小節）
// ===================================================================
function menuSong() {
  const s = new Song('menu', { bpm: 80, bars: 16 });
  s.progression([['M22', 4]]); // テンション付き 2516（Dm9 G9 CM9 Am9）
  s.drums([
    { from: 0, bars: 8, genre: 'lofi', groove: 0 }, // ローファイの基本
    { from: 8, bars: 8, genre: 'lofi', groove: 3 }, // シェイカーのローファイ
  ], -19);
  s.synth('keys', K.lofi, s.rhythm(0, 16, [[0, 2.4], [2.75, 1.1]], 'upper'), -21);
  s.synth('bass', K.subBass, s.rhythm(0, 16, [[0, 1.4, 0], [1.75, 0.25, 0], [2.5, 1.2, 0]], 'bass'), -20);
  s.synth('pad', K.pad, s.rhythm(8, 16, [[0, 4]], 'upper', 12), -27);
  s.synth('melody', K.pluck, s.melody([
    '- - A5 . F5 . E5 .', 'D5 . . . - - B4 .', 'C5 . E5 . G5 . B5 .', 'A5 . . . . . - -',
    '- - F5 . A5 . C6 .', 'B5 . A5 . G5 . F5 .', 'E5 . . . G5 . D5 .', 'C5 . . . . . - -',
  ], 8), -20);
  return s.render({ eq: ['preset=lofi'], target: -16.5 });
}

// ===================================================================
//  ゲーム中：激しめ（A マイナー / 160 BPM / 32小節）
//  A：4つ打ち → B：メロディ＋2ビートとツーバス → C：展開してメロスピ → ブレイク → D：全部のせ
// ===================================================================
function gameSong() {
  const s = new Song('game', { bpm: 160, bars: 32 });
  s.progression([['m04', 4], ['m11', 2], ['m04', 2]]); // マイナー版 Axis（Am F C G）→ Am F Dm E7 → もどる
  s.drums([
    { from: 0, bars: 8, genre: 'jrock', groove: 1 }, // 4つ打ち・16分ハイハット
    { from: 8, bars: 8, genre: 'anison', groove: 15 }, // 2ビート＋ツーバス（ラストのサビ）
    { from: 16, bars: 6, genre: 'metal', groove: 31 }, // ツーバス＋2ビート（メロスピ）
    { from: 22, bars: 2, genre: 'anison', groove: 12 }, // ブレイク前の止め
    { from: 24, bars: 8, genre: 'anison', groove: 15 },
  ], -16, ['preset=metal']);
  const eighths = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  const sixteenths = Array.from({ length: 16 }, (_, i) => [i * 0.25, 0.2]);
  // ベース：8分で押しっぱなし（Reese Bass）＋サブベースで下を支える
  s.synth('bass', K.reese, [
    ...s.rhythm(0, 22, eighths.map((o) => [o, 0.4]), 'bass'),
    ...s.rhythm(22, 23, eighths.map((o) => [o, 0.4]), 'bass'),
    ...s.rhythm(24, 32, eighths.map((o, i) => [o, 0.4, i % 2 ? 12 : 0]), 'bass'),
  ], -18);
  s.synth('sub', K.subBass, s.rhythm(0, 32, [[0, 1.9], [2, 1.9]], 'bass', -12).filter((n) => !(n.beat >= 92 && n.beat < 96)), -22);
  // コード：A はうら拍の刻み、B〜D は Supersaw でのばす
  s.synth('chords', K.supersaw, [
    ...s.rhythm(0, 8, [[0.5, 0.3], [1.5, 0.3], [2.5, 0.3], [3.5, 0.3]], 'upper'),
    ...s.rhythm(8, 22, [[0, 3.9]], 'upper'),
    ...s.rhythm(22, 24, [[0, 0.3], [1.5, 0.3], [3, 0.9]], 'upper'),
    ...s.rhythm(24, 32, [[0, 3.9]], 'upper'),
  ], -21);
  // 16分のアルペジオ（プラック）
  s.synth('arp', K.pluck, [...s.rhythm(0, 22, sixteenths, 'arp', 12), ...s.rhythm(24, 32, sixteenths, 'arp', 12)], -22);
  const melody = [
    'A5 . . E5 A5 . C6 .', 'C6 . A5 . F5 . A5 C6', 'G5 . . E5 G5 . C6 .', 'B5 . A5 . G5 . D5 .',
    'E5 . A5 . C6 . E6 .', 'F6 . E6 . C6 . A5 .', 'G5 . C6 . E6 . G6 .', 'D6 . . . B5 . G5 .',
  ];
  const melodyC = [
    'E5 . . . A5 . . .', 'C6 . . . A5 . . .', 'D6 . . . F6 . . .', 'E6 . . . D6 . B5 .',
    'C6 . . . E6 . . .', 'F6 . . . C6 . A5 .', 'A5 . . . D6 . F6 .', 'E6 . . . G#5 . B5 .',
  ];
  s.synth('melody', K.chip12, [...s.melody(melody, 8, -12), ...s.melody(melodyC, 16, -12), ...s.melody(melody, 24, -12)], -17);
  s.synth('double', K.supersaw, s.melody(melody, 24, 0), -25);
  return s.render({ eq: ['preset=edm'], target: -14 });
}

// ---------------- 書き出し ----------------
const SONGS = { title: titleSong, menu: menuSong, game: gameSong };
for (const [name, exe] of Object.entries(TOOL)) {
  if (!fs.existsSync(exe)) {
    console.error(`${name} のツールがありません: ${exe}`);
    process.exit(1);
  }
}
const pick = process.argv.slice(2).filter((a) => SONGS[a]);
fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Woody Class のプラグインで BGM を作っています…');
const loops = {};
try {
  for (const name of pick.length ? pick : Object.keys(SONGS)) {
    const t0 = Date.now();
    console.log(`  ${name}`);
    const x = SONGS[name]();
    const wav = path.join(WORK, `bgm_${name}.wav`);
    const mp3 = path.join(OUT_DIR, `bgm_${name}.mp3`);
    writeWav(wav, x);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', mp3]);
    const loopSec = (x.length / 2 - Math.round(TAIL * SR)) / SR;
    loops[name] = { loopStart: LOOP_START, loopEnd: +(LOOP_START + loopSec).toFixed(6) };
    console.log(`    → ${path.relative(ROOT, mp3)}  ループ ${loopSec.toFixed(3)} 秒  ${(fs.statSync(mp3).size / 1024).toFixed(0)} KB  （${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  }
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
}
console.log('\njs/config.js の sounds に書くループ位置:');
for (const [name, l] of Object.entries(loops)) console.log(`  bgm${name[0].toUpperCase() + name.slice(1)}: { src: 'assets/sound/bgm_${name}.mp3', loopStart: ${l.loopStart}, loopEnd: ${l.loopEnd} },`);
