// さたぷよ BGM を Woody Class のプラグインで作るスクリプト
//
//   node tools/music/make_bgm.mjs              → ぜんぶ
//   node tools/music/make_bgm.mjs title jpop   → 指定した曲だけ（名前は下の SONGS）
//
// 音はすべてプラグインの処理（processBlock）をそのまま通したもの：
//   ドラム   … Woody Tsuzumi Beats   （TsuzumiTool.exe render <ジャンル> <wav> <小節> <テンポ> <グルーヴ>）
//   コード   … Woody Wasei Chords    （WaonTool.exe events <進行の ID> … でボイシングを取り出す）
//   音色     … Woody Katachi Synth   （KatachiTool.exe render <プリセット> <csv> <wav> all 0）
//   仕上げEQ … Woody Giongo EQ        （HibikiUiShots.exe render <in> <out> <楽器> preset=…）
// メロディとリズムの刻み方だけはこのファイルに書いてある（Wasei のコードの構成音に合わせて鳴らす）。
//
// 書き出す場所：
//   ゲームで使う曲 … assets/sound/bgm_*.mp3
//   保存用（テーマ1〜）… puyo/music/ と VSTプラグイン/BGM/ の「ループ」「フル尺」フォルダに「テーマN 名前.wav / .mp3」
//     ループ曲の wav はちょうど 1 ループ（そのままくり返せばつなぎ目なし）、mp3 は 2 回くり返してフェードアウトした試聴用
//
// 必要なもの: Node.js 18 以上 / ffmpeg / 上の 4 つの exe
//   exe の場所は %USERPROFILE%\WoodyClassBuild\…（作り方は Tsuzumi\コード\marketing\slideshow\使い方.md）。
//   別の場所なら環境変数 WOODY_BUILD でフォルダを指定する。保存用の VSTプラグイン フォルダは WOODY_PLUGINS で変えられる。
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
const PLUGINS = process.env.WOODY_PLUGINS || path.join(os.homedir(), 'Desktop', 'VSTプラグイン');
const ARCHIVE_DIRS = [path.join(ROOT, 'music'), path.join(PLUGINS, 'BGM')];
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
  subBass: 1, bass8bit: 2, reese: 3, supersaw: 4, chip12: 5, chip25: 6, chip50: 7, pad: 8, futureBass: 9, pluck: 10, lofi: 11,
  sine: 100, square: 101, saw: 102, triangle: 103,
};
const EIGHTHS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const SIXTEENTHS = Array.from({ length: 16 }, (_, i) => [i * 0.25, 0.2]);

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
// 1小節ぶんの "C5 . E5 - G5 …" → [{beat, len, note}]。「.」はのばす、「-」は休み。
// 区切りの数で細かさが決まる（8 個なら 8 分、16 個なら 16 分、4 個なら 4 分）
function bar(str, start) {
  const toks = str.trim().split(/\s+/);
  const step = 4 / toks.length;
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
function mp3(wav, out, kbps) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, out]);
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
const waonCache = new Map();
function waseiChords(id, twoBeats = false) {
  const key = id + (twoBeats ? ':2' : '');
  if (waonCache.has(key)) return waonCache.get(key);
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
  const chords = times.map((t, i) => {
    const notes = ons.get(t).sort((a, b) => a - b);
    const end = times[i + 1] ?? total;
    return { beat: t / 24000, len: (end - t) / 24000, bass: notes[0], upper: notes.slice(1) };
  });
  waonCache.set(key, chords);
  return chords;
}

// Katachi Synth で鳴らす。notes: [{beat, len, note}]（1回ぶん）→ 曲の長さぶんの音
function katachi(song, preset, notes) {
  const ev = [];
  const sp = (beat) => Math.round(beat * song.spbS);
  for (let k = 0; k < song.copies; k++) {
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

// Tsuzumi Beats のグルーヴ。sections: [{from, bars, genre, groove}] → 曲の長さぶんに並べる
function tsuzumi(song, sections) {
  const out = new Float32Array(song.total * 2);
  const cache = new Map();
  for (const s of sections) {
    const key = `${s.genre}:${s.groove}:${s.bars}`;
    if (!cache.has(key)) {
      const wav = path.join(WORK, 'drums.wav');
      run(TOOL.tsuzumi, ['render', s.genre, wav, String(s.bars), String(song.bpm), String(s.groove)]);
      cache.set(key, readWav(wav));
    }
    const x = cache.get(key);
    const fade = Math.round(0.003 * SR);
    const n = Math.min(x.length / 2, Math.round(s.bars * 4 * song.spbS));
    for (let k = 0; k < song.copies; k++) {
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
  // once: true … ループしない曲（1回だけ鳴らす。最後に余韻をつける）
  constructor(name, { bpm, bars, once = false, key = 0, ending = 4 }) {
    Object.assign(this, { name, bpm, bars, once });
    this.spbS = (60 / bpm) * SR; // 1拍のサンプル数
    this.loopS = Math.round(bars * 4 * this.spbS);
    // ループ曲は 1 ループがちょうど整数サンプルでないと、つなぎ目がずれる（ループしない曲は気にしなくていい）
    if (!once && Math.abs(this.loopS - bars * 4 * this.spbS) > 1e-6) throw new Error('ループの長さが整数サンプルにならないテンポ');
    this.copies = once ? 1 : 3;
    this.total = once ? this.loopS + ending * SR : this.loopS * 3 + SR * 2;
    this.key = typeof key === 'function' ? key : () => key; // 拍ごとの移調（転調に使う）
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
  //   what: 'upper'（ベースを除く和音）| 'bass'（いちばん低い音）| 'arp'（和音の音を順に）| 'arpUp'（和音の音を下から順に）
  rhythm(fromBar, toBar, pattern, what, shift = 0) {
    const notes = [];
    for (let b = fromBar; b < toBar; b++) {
      pattern.forEach(([o, len, iv = 0], idx) => {
        const beat = b * 4 + o;
        const c = this.chordAt(beat);
        const k = this.key(beat) + shift;
        if (what === 'upper') c.upper.forEach((n) => notes.push({ beat, len, note: n + k }));
        else if (what === 'bass') notes.push({ beat, len, note: c.bass + iv + k });
        else if (what === 'arpUp') notes.push({ beat, len, note: c.upper[idx % c.upper.length] + k });
        else notes.push({ beat, len, note: c.upper[(idx + b) % c.upper.length] + k });
      });
    }
    return notes;
  }
  // メロディ：1小節ずつの文字列。fromBar 小節目から並べる
  melody(bars, fromBar, shift = 0) {
    return bars.flatMap((s, i) => bar(s, (fromBar + i) * 4)).map((n) => ({ ...n, note: n.note + shift + this.key(n.beat) }));
  }
  synth(name, preset, notes, targetLufs) {
    this.stems.push({ name, x: katachi(this, preset, notes), target: targetLufs });
  }
  drums(sections, targetLufs, eq = null) {
    let x = tsuzumi(this, sections);
    if (eq) x = giongo(x, 'drums', eq);
    this.stems.push({ name: 'drums', x, target: targetLufs });
  }

  // 書き出す音を作る → { game, loop, preview }
  render({ eq, target }) {
    const from = this.once ? 0 : this.loopS;
    const span = this.once ? this.total : this.loopS; // 音量を測る範囲
    const part = (x) => x.subarray(from * 2, (from + span) * 2);
    const mix = new Float32Array(this.total * 2);
    for (const s of this.stems) {
      const now = measureLufs(part(s.x));
      const g = Math.pow(10, (s.target - now) / 20);
      for (let i = 0; i < mix.length; i++) mix[i] += s.x[i] * g;
      console.log(`    ${s.name.padEnd(9)} ${now.toFixed(1).padStart(6)} → ${s.target} LUFS`);
    }
    const x = eq ? giongo(mix, 'full', eq) : mix;
    // 音量をそろえる（ピークはなめらかに抑える）。ピークを抑えると少し小さくなるので、2回測って合わせる
    const knee = 0.8;
    const level = (src, g) => {
      const out = new Float32Array(src.length);
      for (let i = 0; i < out.length; i++) {
        let v = src[i] * g;
        const a = Math.abs(v);
        if (a > knee) v = Math.sign(v) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
        out[i] = v * 0.94;
      }
      return out;
    };
    const ref = part(x);
    let g = Math.pow(10, (target - measureLufs(ref)) / 20);
    g *= Math.pow(10, (target - measureLufs(level(ref, g))) / 20);
    const all = level(x, g);
    console.log(`    仕上がり ${measureLufs(part(all)).toFixed(1)} LUFS`);
    if (this.once) {
      // 最後の 1.5 秒で消しきる
      const n = all.length / 2, f = Math.round(1.5 * SR);
      for (let i = n - f; i < n; i++) { const k = (n - i) / f; all[i * 2] *= k; all[i * 2 + 1] *= k; }
      return { game: all, loop: all, preview: all };
    }
    const tail = Math.round(TAIL * SR);
    const game = all.slice(this.loopS * 2, (this.loopS * 2 + tail) * 2);
    const loop = all.slice(this.loopS * 2, this.loopS * 4);
    // 試聴用：2回くり返して最後の 4 秒でフェードアウト
    const preview = all.slice(this.loopS * 2, this.loopS * 6);
    const n = preview.length / 2, f = Math.round(4 * SR);
    for (let i = n - f; i < n; i++) { const k = (n - i) / f; preview[i * 2] *= k; preview[i * 2 + 1] *= k; }
    return { game, loop, preview };
  }
}

// ===================================================================
//  テーマ1 タイトル：8bit のテーマソング（C メジャー / 150 BPM / 16小節）
// ===================================================================
function titleSong() {
  const s = new Song('title', { bpm: 150, bars: 16 });
  s.progression([['M06'], ['M02'], ['M24']]); // カノン進行 → 王道進行（三和音）→ ♭VI–♭VII–I
  s.drums([
    { from: 0, bars: 8, genre: 'anison', groove: 0 }, // 速い 8ビート
    { from: 8, bars: 8, genre: 'anison', groove: 9 }, // クラッシュ 4分のサビ
  ], -18, ['preset=pop']);
  s.synth('chords', K.chip12, s.rhythm(0, 16, EIGHTHS.map((o) => [o, 0.3]), 'upper'), -23);
  s.synth('bass', K.bass8bit, s.rhythm(0, 16, EIGHTHS.map((o, i) => [o, 0.42, i % 2 ? 12 : 0]), 'bass'), -19);
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
//  テーマ2 メニュー：ローファイ・ヒップホップ（C メジャー / 80 BPM / 16小節）
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
//  テーマ3 ゲーム中：激しめ（A マイナー / 160 BPM / 32小節）
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
  // ベース：8分で押しっぱなし（Reese Bass）＋サブベースで下を支える
  s.synth('bass', K.reese, [
    ...s.rhythm(0, 22, EIGHTHS.map((o) => [o, 0.4]), 'bass'),
    ...s.rhythm(22, 23, EIGHTHS.map((o) => [o, 0.4]), 'bass'),
    ...s.rhythm(24, 32, EIGHTHS.map((o, i) => [o, 0.4, i % 2 ? 12 : 0]), 'bass'),
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
  s.synth('arp', K.pluck, [...s.rhythm(0, 22, SIXTEENTHS, 'arp', 12), ...s.rhythm(24, 32, SIXTEENTHS, 'arp', 12)], -22);
  const melody = [
    'A5 . . E5 A5 . C6 .', 'C6 . A5 . F5 . A5 C6', 'G5 . . E5 G5 . C6 .', 'B5 . A5 . G5 . D5 .',
    'E5 . A5 . C6 . E6 .', 'F6 . E6 . C6 . A5 .', 'G5 . C6 . E6 . G6 .', 'D6 . . . B5 . G5 .',
  ];
  const melodyC = [
    'E5 . . . A5 . . .', 'C6 . . . A5 . . .', 'D6 . . . F6 . . .', 'E6 . . . D6 . B5 .',
    'C6 . . . E6 . . .', 'F6 . . . C6 . A5 .', 'A5 . . . D6 . F6 .', 'E6 . . . G#5 . B5 .',
  ];
  const lead = (bars, from, shift) => s.melody(bars, from, shift);
  s.synth('melody', K.chip12, [...lead(melody, 8, -12), ...lead(melodyC, 16, -12), ...lead(melody, 24, -12)], -17);
  s.synth('double', K.supersaw, lead(melody, 24, 0), -25);
  return s.render({ eq: ['preset=edm'], target: -14 });
}

// ===================================================================
//  テーマ4 シティポップ（E♭ メジャー / 120 BPM / 16小節）
//  丸サ進行 → 3625。16ビートのドラム、三角波のメロディ、プラックのカッティング
// ===================================================================
function cityPopSong() {
  const s = new Song('citypop', { bpm: 120, bars: 16, key: 3 });
  s.progression([['M05', 2], ['M14', 2]]); // FM7 E7 Am7 Gm7-C7 ×2 → Em7 Am7 Dm7 G7 ×2
  s.drums([
    { from: 0, bars: 8, genre: 'citypop', groove: 0 }, // シティポップの 16ビート
    { from: 8, bars: 8, genre: 'citypop', groove: 9 }, // ディスコ・ブギー
  ], -18, ['preset=pop']);
  // ベース：16分のシンコペーション
  s.synth('bass', K.triangle, s.rhythm(0, 16, [[0, 0.7, 0], [0.75, 0.2, 12], [1.5, 0.45, 0], [2, 0.7, 0], [2.75, 0.2, 12], [3.25, 0.2, 7], [3.5, 0.45, 0]], 'bass'), -18);
  s.synth('sub', K.subBass, s.rhythm(0, 16, [[0, 1.9], [2, 1.9]], 'bass', -12), -24);
  // ギターのカッティングっぽいプラック（うら拍）とパッド
  s.synth('cut', K.pluck, s.rhythm(0, 16, [[0.5, 0.15], [1.25, 0.15], [1.75, 0.15], [2.5, 0.15], [3.25, 0.15], [3.75, 0.15]], 'upper', 12), -23);
  s.synth('pad', K.pad, s.rhythm(0, 16, [[0, 3.9]], 'upper'), -25);
  const melody = [
    '- - A4 C5 E5 . D5 C5', 'B4 . . G#4 . . - -', '- - C5 E5 G5 . E5 D5', 'E5 . D5 . Bb4 . G4 .',
    '- - A4 C5 E5 . G5 F5', 'E5 . . D5 . B4 G#4 .', 'A4 . C5 . E5 . A5 .', 'G5 . . F5 . E5 . -',
    '- - E5 F5 G5 . B5 A5', 'G5 . . E5 . C5 . -', '- - F5 G5 A5 . C6 A5', 'B5 . . A5 . G5 F5 .',
    'E5 . G5 . B5 . . D6', 'C6 . . B5 . A5 G5 .', 'F5 . A5 . C6 . A5 F5', 'G5 . . . . . - -',
  ];
  s.synth('melody', K.triangle, s.melody(melody, 0), -17);
  s.synth('octave', K.pluck, s.melody(melody.slice(8), 8, 12), -24);
  return s.render({ eq: ['preset=brightpop'], target: -15 });
}

// ===================================================================
//  テーマ5 ボス戦（A マイナー / 180 BPM / 32小節）：8bit ＋メタルのツーバス
// ===================================================================
function bossSong() {
  const s = new Song('boss', { bpm: 180, bars: 32 });
  s.progression([['m01', 4], ['m14', 2], ['m01', 2]]); // アンダルシア進行 → ナポリの六の和音 → もどる
  s.drums([
    { from: 0, bars: 16, genre: 'metal', groove: 2 }, // ツーバス 16分＋ハイハット
    { from: 16, bars: 8, genre: 'metal', groove: 4 }, // ギャロップ
    { from: 24, bars: 6, genre: 'metal', groove: 2 },
    { from: 30, bars: 2, genre: 'metal', groove: 27 }, // 3・3・2 のキメ
  ], -16, ['preset=metal']);
  s.synth('bass', K.bass8bit, s.rhythm(0, 32, SIXTEENTHS.map(([o], i) => [o, 0.2, i % 4 === 3 ? 12 : 0]), 'bass'), -18);
  s.synth('sub', K.reese, s.rhythm(0, 32, [[0, 1.9], [2, 1.9]], 'bass', -12), -22);
  s.synth('power', K.supersaw, s.rhythm(0, 32, [[0, 0.7], [1.5, 0.7], [3, 0.9]], 'upper'), -22);
  const riff = [
    'A4 A4 C5 A4 E5 A4 D5 C5', 'G4 G4 B4 G4 D5 G4 C5 B4', 'F4 F4 A4 F4 C5 F4 B4 A4', 'E4 E4 G#4 E4 B4 E4 D5 B4',
  ];
  const theme = [
    'A5 . . . E5 . A5 B5', 'C6 . . B5 . G5 . D5', 'F5 . . E5 . F5 A5 C6', 'B5 . . . G#5 . E5 .',
    'A5 . . . E5 . A5 B5', 'C6 . D6 . E6 . D6 C6', 'B5 . C6 . A5 . F5 .', 'G#5 . . . . . - -',
  ];
  const middle = [
    'A4 . C5 . E5 . A5 .', 'Bb5 . . A5 . F5 . D5', 'E5 . G#5 . B5 . D6 .', 'C6 . . . B5 . A5 .',
    'E6 . . C6 . A5 . E5', 'F5 . Bb5 . D6 . F6 .', 'E6 . D6 . B5 . G#5 .', 'A5 . . . . . - -',
  ];
  s.synth('riff', K.chip25, s.melody([...riff, ...riff], 0), -21);
  s.synth('melody', K.chip12, [...s.melody(theme, 8), ...s.melody(middle, 16)], -16);
  s.synth('harmony', K.chip50, s.melody(theme, 24, -12), -21); // 1 オクターブ下で厚く
  s.synth('lead2', K.chip12, s.melody(theme, 24), -16);
  return s.render({ eq: ['preset=edm'], target: -14 });
}

// ===================================================================
//  テーマ6 町（C メジャー / 120 BPM / 16小節）：ほのぼの 8bit
// ===================================================================
function townSong() {
  const s = new Song('town', { bpm: 120, bars: 16 });
  s.progression([['M18', 2], ['M50'], ['M17']]); // C F C G ×2 → C Dm7 C/E F → C F G C
  s.drums([{ from: 0, bars: 16, genre: 'country', groove: 4 }], -20, ['preset=pop']); // ブーム・チック
  s.synth('bass', K.bass8bit, s.rhythm(0, 16, [[0, 0.45, 0], [1, 0.45, 7], [2, 0.45, 0], [3, 0.45, 7]], 'bass'), -19);
  s.synth('arp', K.chip12, s.rhythm(0, 16, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12), -24);
  s.synth('chords', K.chip50, s.rhythm(0, 16, [[1, 0.3], [3, 0.3]], 'upper'), -25);
  const melody = [
    'E5 . G5 . C6 . G5 .', 'A5 . . G5 F5 . . -', 'E5 . G5 . E5 . C5 .', 'D5 . . . - - - -',
    'E5 . G5 . C6 . G5 .', 'A5 . . C6 A5 . F5 .', 'G5 . E5 . C5 . E5 .', 'D5 . . . . . - -',
    'C5 . . E5 G5 . . -', 'F5 . . A5 C6 . . -', 'G5 . E5 . C5 . E5 .', 'F5 . A5 . C6 . A5 .',
    'G5 . . E5 C5 . E5 .', 'F5 . A5 . . G5 F5 .', 'D5 . . E5 F5 . D5 .', 'C5 . . . . . - -',
  ];
  s.synth('melody', K.chip50, s.melody(melody, 0, -12), -17);
  s.synth('echo', K.triangle, s.melody(melody.slice(8), 8, -12).map((n) => ({ ...n, beat: n.beat + 0.5 })).filter((n) => n.beat < 64), -26);
  return s.render({ eq: ['preset=brightpop'], target: -15.5 });
}

// ===================================================================
//  テーマ7 エンディング：J-POP（D メジャー → ラスサビで E♭ に転調 / 160 BPM / 140小節・約3分半）
//  頭サビ → イントロ（8bit）→ Aメロ → Bメロ → サビ → 間奏 → Aメロ2 → Bメロ2 → サビ2
//  → 8bit ソロ → Cメロ → 落ちサビ → 転調ラスサビ → アウトロ
// ===================================================================
function jpopSong() {
  const LAST = 116; // ラスサビの頭（ここから半音上げ）
  const s = new Song('jpop', { bpm: 160, bars: 140, once: true, ending: 5, key: (beat) => 2 + (beat >= LAST * 4 ? 1 : 0) });
  const CHORUS = [['M01'], ['M03'], ['M13'], ['M15']]; // FM7 G7 Em7 Am7 / FM7 G7 E7 Am7 / Dm7 G7 CM7 Am7 / Dm7 G7 CM7 CM7
  const VERSE = ['M07']; // カノン進行（ベース下降）
  const B_MELO = [['M19'], ['F13'], ['F13']]; // F G Am Am / F G / F G
  const RIFF = ['M24', 2]; // C A♭ B♭ C ×2
  s.progression([
    ['M01'], ['M03'], // 0  頭サビ（8）
    RIFF, // 8  イントロ（8）
    [...VERSE, 2], // 16 Aメロ1（16）
    ...B_MELO, // 32 Bメロ1（8）
    ...CHORUS, // 40 サビ1（16）
    ['M24'], // 56 間奏（4）
    VERSE, // 60 Aメロ2（8）
    ...B_MELO, // 68 Bメロ2（8）
    ...CHORUS, // 76 サビ2（16）
    RIFF, // 92 8bit ソロ（8）
    ['M31'], // 100 Cメロ（8）クリシェからサブドミナントマイナー
    ['M01'], ['M03'], // 108 落ちサビ（8）
    ...CHORUS, // 116 ラスサビ（16）
    RIFF, // 132 アウトロ（8）
  ]);

  // ---- ドラム（Tsuzumi の J-POP のグルーヴ） ----
  s.drums([
    { from: 6, bars: 2, genre: 'jpop', groove: 9 }, // サビ前の盛り上げ（頭サビのおわり）
    { from: 8, bars: 8, genre: 'jpop', groove: 2 }, // イントロ：サビの 8ビート
    { from: 16, bars: 16, genre: 'jpop', groove: 0 }, // Aメロ（音数少なめ）
    { from: 32, bars: 6, genre: 'jpop', groove: 1 }, // Bメロ（少しずつ増やす）
    { from: 38, bars: 2, genre: 'jpop', groove: 9 }, // サビ前の盛り上げ
    { from: 40, bars: 14, genre: 'jpop', groove: 2 }, // サビの 8ビート
    { from: 54, bars: 2, genre: 'jpop', groove: 16 }, // キメで止まるサビの終わり
    { from: 56, bars: 4, genre: 'jpop', groove: 2 }, // 間奏
    { from: 60, bars: 8, genre: 'jpop', groove: 4 }, // 16ビートの A メロ
    { from: 68, bars: 6, genre: 'jpop', groove: 1 },
    { from: 74, bars: 2, genre: 'jpop', groove: 9 },
    { from: 76, bars: 14, genre: 'jpop', groove: 3 }, // サビの 4つ打ち
    { from: 90, bars: 2, genre: 'jpop', groove: 16 },
    { from: 92, bars: 8, genre: 'anison', groove: 9 }, // ソロ：クラッシュ 4分
    { from: 100, bars: 8, genre: 'jpop', groove: 12 }, // Cメロ：ハーフタイム
    { from: 114, bars: 2, genre: 'jpop', groove: 9 }, // 落ちサビのおわりで盛り上げ
    { from: 116, bars: 14, genre: 'anison', groove: 15 }, // ラスサビ：2ビート＋ツーバス
    { from: 130, bars: 2, genre: 'jpop', groove: 16 },
    { from: 132, bars: 6, genre: 'jpop', groove: 2 }, // アウトロ
    { from: 138, bars: 2, genre: 'jpop', groove: 16 }, // 最後のキメ
  ], -16, ['preset=pop']);

  // ---- ベース ----
  const root8 = EIGHTHS.map((o) => [o, 0.42]);
  const oct8 = EIGHTHS.map((o, i) => [o, 0.42, i % 2 ? 12 : 0]);
  const verseBass = [[0, 1.4], [1.5, 0.45], [2, 1.4], [3.5, 0.45]];
  const bassNotes = [
    ...s.rhythm(0, 6, [[0, 3.9]], 'bass'), // 頭サビ：のばす
    ...s.rhythm(6, 8, root8, 'bass'),
    ...s.rhythm(8, 16, oct8, 'bass'), // イントロ
    ...s.rhythm(16, 32, verseBass, 'bass'), // Aメロ
    ...s.rhythm(32, 40, root8, 'bass'), // Bメロ
    ...s.rhythm(40, 54, oct8, 'bass'), // サビ
    ...s.rhythm(54, 56, [[0, 0.4], [1.5, 0.4], [3, 0.9]], 'bass'), // キメ
    ...s.rhythm(56, 60, oct8, 'bass'),
    ...s.rhythm(60, 68, root8, 'bass'),
    ...s.rhythm(68, 76, root8, 'bass'),
    ...s.rhythm(76, 90, oct8, 'bass'),
    ...s.rhythm(90, 92, [[0, 0.4], [1.5, 0.4], [3, 0.9]], 'bass'),
    ...s.rhythm(92, 100, oct8, 'bass'), // ソロ
    ...s.rhythm(100, 108, [[0, 1.9], [2, 1.9]], 'bass'), // Cメロ
    ...s.rhythm(114, 116, root8, 'bass'),
    ...s.rhythm(116, 130, oct8, 'bass'), // ラスサビ
    ...s.rhythm(130, 132, [[0, 0.4], [1.5, 0.4], [3, 0.9]], 'bass'),
    ...s.rhythm(132, 138, oct8, 'bass'),
    ...s.rhythm(138, 140, [[0, 0.4], [1.5, 0.4], [3, 3]], 'bass'),
  ];
  s.synth('bass', K.bass8bit, bassNotes, -19);
  s.synth('sub', K.subBass, s.rhythm(0, 140, [[0, 1.9], [2, 1.9]], 'bass', -12).filter((n) => n.beat < 108 * 4 || n.beat >= 114 * 4), -23);

  // ---- 和音 ----
  const chorusBars = [[40, 54], [76, 90], [116, 130]];
  s.synth('saw', K.supersaw, [
    ...chorusBars.flatMap(([a, b]) => s.rhythm(a, b, [[0, 3.9]], 'upper')),
    ...s.rhythm(54, 56, [[0, 0.3], [1.5, 0.3], [3, 0.9]], 'upper'),
    ...s.rhythm(90, 92, [[0, 0.3], [1.5, 0.3], [3, 0.9]], 'upper'),
    ...s.rhythm(130, 132, [[0, 0.3], [1.5, 0.3], [3, 0.9]], 'upper'),
    ...s.rhythm(100, 108, [[0, 3.9]], 'upper'),
    ...s.rhythm(138, 140, [[0, 0.3], [1.5, 0.3], [3, 4]], 'upper'),
  ], -21);
  s.synth('stab', K.futureBass, chorusBars.flatMap(([a, b]) => s.rhythm(a, b, [[0.5, 0.25], [1.5, 0.25], [2.5, 0.25], [3.5, 0.25]], 'bass', 12)), -26);
  s.synth('pad', K.pad, [
    ...s.rhythm(0, 8, [[0, 3.9]], 'upper', 12), // 頭サビ
    ...s.rhythm(16, 40, [[0, 3.9]], 'upper'), // Aメロ・Bメロ
    ...s.rhythm(60, 76, [[0, 3.9]], 'upper'),
    ...s.rhythm(100, 116, [[0, 3.9]], 'upper', 12), // Cメロ・落ちサビ
  ], -25);
  s.synth('pluck', K.pluck, [
    ...s.rhythm(0, 8, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12),
    ...s.rhythm(16, 40, EIGHTHS.map((o) => [o, 0.3]), 'arp', 12),
    ...s.rhythm(60, 76, EIGHTHS.map((o) => [o, 0.3]), 'arp', 12),
    ...s.rhythm(108, 116, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12), // 落ちサビ
    ...chorusBars.flatMap(([a, b]) => s.rhythm(a, b, SIXTEENTHS, 'arp', 24)),
  ], -24);
  s.synth('chip', K.chip12, [
    ...s.rhythm(8, 16, SIXTEENTHS, 'arp', 12),
    ...s.rhythm(56, 60, SIXTEENTHS, 'arp', 12),
    ...s.rhythm(92, 100, SIXTEENTHS, 'arp'),
    ...s.rhythm(132, 140, SIXTEENTHS, 'arp', 12).filter((n) => n.beat < 138 * 4),
  ], -24);

  // ---- メロディ ----
  const CH = [
    'E5 . E5 F5 . E5 C5 .', 'D5 . D5 E5 . D5 B4 .', 'G4 . B4 C5 . D5 E5 .', 'E5 . A5 . . G5 E5 .',
    'E5 . E5 F5 . E5 C5 .', 'D5 . D5 E5 . F5 G5 .', 'G#5 . . A5 B5 . . G#5', 'A5 . . . . . - -',
    'A5 . A5 C6 . A5 F5 .', 'G5 . G5 A5 . G5 D5 .', 'E5 . G5 . C6 . B5 .', 'A5 . . G5 . E5 . .',
    'F5 . F5 G5 . A5 . C6', 'B5 . . A5 . G5 . F5', 'E5 . . . D5 . C5 .', 'C5 . . . . . - -',
  ];
  const A = [
    '- - G4 . C5 . C5 D5', 'D5 . B4 . G4 . . -', '- - A4 . C5 . E5 D5', 'C5 . . . G4 . . -',
    '- - A4 . C5 . F5 E5', 'E5 . D5 . C5 . G4 .', 'A4 . C5 . D5 . F5 .', 'E5 . . . D5 . . -',
    '- - G4 . C5 . C5 D5', 'D5 . B4 . G4 . B4 D5', 'E5 . . D5 C5 . A4 .', 'G4 . . . C5 . D5 .',
    'E5 . F5 . A5 . G5 F5', 'E5 . . . C5 . . -', 'D5 . E5 . F5 . A5 .', 'G5 . . . . . - -',
  ];
  const B = [
    'A4 . A4 . C5 . A4 .', 'B4 . B4 . D5 . B4 .', 'C5 . C5 . E5 . C5 .', 'E5 . . . D5 . C5 .',
    'C5 . . A4 C5 . F5 .', 'D5 . . B4 D5 . G5 .', 'A5 . . . G5 . F5 .', 'G5 . . . - - - -',
  ];
  const RIFF_M = [
    'E5 . E5 F5 . E5 C5 .', 'Eb5 . Eb5 F5 . Eb5 C5 .', 'D5 . D5 F5 . D5 Bb4 .', 'C5 . G5 . C6 . . -',
    'E5 . E5 F5 . E5 C5 .', 'Eb5 . Eb5 F5 . Ab5 G5 .', 'F5 . D5 . Bb5 . A5 .', 'C6 . . . . . - -',
  ];
  const SOLO = [
    'C5 E5 G5 C6 E6 C6 G5 E5 C5 E5 G5 C6 E6 C6 G5 E5',
    'Ab4 C5 Eb5 Ab5 C6 Ab5 Eb5 C5 Ab4 C5 Eb5 Ab5 C6 Ab5 Eb5 C5',
    'Bb4 D5 F5 Bb5 D6 Bb5 F5 D5 Bb4 D5 F5 Bb5 D6 Bb5 F5 D5',
    'C6 . . . G5 . E5 . C5 . E5 . G5 . C6 .',
    'E6 . D6 C6 . G5 . C6', 'Eb6 . C6 Ab5 . Eb5 . Ab5', 'F6 . D6 Bb5 . F5 . D6', 'C6 . . . . . - -',
  ];
  const C = [
    'G4 . . . C5 . . .', 'B4 . . . E5 . . .', 'Bb4 . . . G5 . . .', 'A5 . . . . . G5 F5',
    'Ab5 . . . G5 . F5 .', 'E5 . . . G5 . . .', 'F5 . . . D5 . . .', 'E5 . . . . . - -',
  ];
  const vocal = []; // 歌のかわり（サビ以外）：8bit の矩形波
  const chorus = []; // サビ：Supersaw
  const sparkle = []; // サビのきらきら（1 オクターブ上の矩形波）
  vocal.push(...s.melody(A, 16), ...s.melody(B, 32), ...s.melody(A.slice(0, 8), 60), ...s.melody(B, 68));
  chorus.push(...s.melody(CH.slice(0, 8), 0, -12)); // 頭サビは低めにしっとり
  chorus.push(...s.melody(CH, 40), ...s.melody(CH, 76), ...s.melody(C, 100));
  chorus.push(...s.melody(CH, 116));
  sparkle.push(...s.melody(CH, 76, 12), ...s.melody(CH, 116, 12));
  s.synth('vocal', K.chip25, vocal, -16);
  s.synth('chorus', K.supersaw, chorus, -16);
  s.synth('sparkle', K.chip12, sparkle, -24);
  s.synth('soft', K.triangle, s.melody(CH.slice(0, 8), 108), -16); // 落ちサビは三角波でそっと
  s.synth('riff', K.chip25, [
    ...s.melody(RIFF_M, 8), ...s.melody(RIFF_M.slice(0, 4), 56), ...s.melody(RIFF_M, 132).filter((n) => n.beat < 139 * 4),
  ], -17);
  s.synth('solo', K.chip12, s.melody(SOLO, 92), -16);
  return s.render({ eq: ['preset=brightpop'], target: -14 });
}

// 保存用フォルダの中の、ループ曲とフル尺の曲の置き場所
const folderOf = (info) => (info.loop ? 'ループ' : 'フル尺');

// 1小節ごとに 2 つの刻みを交互に使う（ボサノバなど、2 小節でひとまとまりのリズム用）
function alternate(s, from, to, a, b, what, shift = 0) {
  const out = [];
  for (let i = from; i < to; i++) out.push(...s.rhythm(i, i + 1, (i - from) % 2 ? b : a, what, shift));
  return out;
}

// ===================================================================
//  テーマ8 午後のテラス席（ボサノバ・BGM / F メジャー / 120 BPM / 32小節・64秒）
//  しゃべりの後ろで流しやすいように、メロディは少なめ・音量も控えめ
// ===================================================================
function bossaSong() {
  const s = new Song('bossa', { bpm: 120, bars: 32, key: 5 });
  // 1625 → 裏コード終止 → サブドミナントマイナーから循環へ → 裏コードで下がる 3625
  s.progression([['M12', 2], ['M29', 2], ['M53'], ['M49', 2]]);
  s.drums([
    { from: 0, bars: 16, genre: 'bossa', groove: 0 }, // ボサノバの基本
    { from: 16, bars: 16, genre: 'bossa', groove: 2 }, // シェイカーのボサノバ
  ], -19, ['preset=jazz']);
  // ベース：1拍目と3拍目に根音、そのうらで 5 度（ボサノバの定番）
  s.synth('bass', K.triangle, s.rhythm(0, 32, [[0, 1.3, 0], [1.5, 0.45, 7], [2, 1.3, 0], [3.5, 0.45, 7]], 'bass'), -19);
  s.synth('sub', K.subBass, s.rhythm(0, 32, [[0, 1.4], [2, 1.4]], 'bass', -12), -27);
  // ギターのかわり：プラックでボサノバの刻み（2 小節でひとまとまり）
  s.synth('comp', K.pluck, alternate(s, 0, 32, [[0, 0.4], [1.5, 0.4], [3, 0.4]], [[0.5, 0.4], [2, 0.4], [3.5, 0.4]], 'upper', 12), -21);
  s.synth('pad', K.pad, s.rhythm(0, 32, [[0, 3.9]], 'upper'), -28);
  const melody = [
    '- - A5 . F5 . E5 .', 'F5 . . . Eb5 . . .', 'E5 . . . . . D5 .', 'E5 . . . - - - -',
    '- - C6 . A5 . F5 .', 'Ab5 . . . F5 . . .', 'G5 . . . E5 . . .', 'D5 . . . . . - -',
  ];
  const melody2 = [
    'B5 . . . Bb5 . . .', 'A5 . . . Ab5 . . .', 'G5 . . . E5 . . .', '- - - - - - - -',
    'D6 . B5 . Db6 . Bb5 .', 'C6 . A5 . B5 . Ab5 .', 'G5 . . . E5 . D5 .', 'E5 . . . . . - -',
  ];
  s.synth('melody', K.sine, [...s.melody(melody, 8, -12), ...s.melody(melody2, 24, -12)], -21);
  return s.render({ eq: ['preset=acoustic'], target: -16.5 });
}

// ===================================================================
//  テーマ9 深夜2時の作業部屋（ディープハウス・BGM / F マイナー / 125 BPM / 32小節・61秒）
// ===================================================================
function houseSong() {
  const s = new Song('house', { bpm: 125, bars: 32, key: -4 });
  s.progression([['m07', 4], ['M21', 4]]); // ドリアン・ヴァンプ（Am7 D7）→ ダイアトニック下降（FM7 Em7 Dm7 CM7）
  s.drums([
    { from: 0, bars: 8, genre: 'house', groove: 12 }, // ミニマルなハウス
    { from: 8, bars: 24, genre: 'house', groove: 3 }, // ディープハウス
  ], -17, ['preset=pop']);
  s.synth('bass', K.triangle, s.rhythm(0, 32, [[0.5, 0.4, 0], [1.5, 0.2, 0], [1.75, 0.4, 12], [2.5, 0.4, 0], [3.5, 0.35, 7]], 'bass'), -18);
  s.synth('sub', K.subBass, s.rhythm(0, 32, [[0.5, 0.45], [1.5, 0.2], [2.5, 0.45], [3.5, 0.3]], 'bass', -12), -23);
  // うら拍のコードスタブ（ディープハウスの定番）と、うしろのパッド
  s.synth('stab', K.lofi, s.rhythm(0, 32, [[1.5, 0.45], [3.5, 0.6]], 'upper'), -21);
  s.synth('pad', K.pad, s.rhythm(8, 32, [[0, 3.9]], 'upper', 12), -29);
  // プラックの短いフレーズをくり返す
  s.synth('pluck', K.pluck, s.rhythm(8, 32, [[0, 0.2], [0.75, 0.2], [1.5, 0.2], [2.25, 0.2], [3, 0.2]], 'arpUp', 12), -23);
  // 後半だけ、口笛みたいなメロディを少し
  const whistle = [
    'C6 . . . A5 . . .', 'G5 . . . . . - -', 'F5 . . . E5 . D5 .', 'E5 . . . . . - -',
    'C6 . . . A5 . . .', 'G5 . . . E5 . . .', 'F5 . . . D5 . . .', 'C5 . . . . . - -',
  ];
  s.synth('melody', K.sine, s.melody(whistle, 24), -22);
  return s.render({ eq: ['preset=edm'], target: -16 });
}

// ===================================================================
//  テーマ10 てくてく、さんぽ道（ゆるポップ・BGM / D メジャー / 100 BPM / 32小節・77秒）
//  ウクレレっぽいプラック、口笛っぽいサイン波、鉄琴っぽい三角波
// ===================================================================
function vlogSong() {
  const s = new Song('vlog', { bpm: 100, bars: 32, key: 2 });
  s.progression([['M09', 4], ['M11', 2], ['M18', 2]]); // C G Am F ×4 → C Am F G ×2 → C F C G ×2
  s.drums([
    { from: 0, bars: 16, genre: 'pop', groove: 7 }, // シェイカーで揺らす
    { from: 16, bars: 16, genre: 'pop', groove: 6 }, // タンバリン入り（モータウン風）
  ], -19, ['preset=pop']);
  s.synth('bass', K.triangle, s.rhythm(0, 32, [[0, 0.9, 0], [1.5, 0.4, 7], [2, 0.9, 0], [3.5, 0.4, 7]], 'bass'), -19);
  // ウクレレのかわり：ジャン・ジャジャ・ジャジャンの刻み
  s.synth('uke', K.pluck, s.rhythm(0, 32, [[0, 0.3], [1, 0.25], [1.5, 0.25], [2.5, 0.25], [3, 0.25], [3.5, 0.25]], 'upper', 12), -21);
  s.synth('glock', K.triangle, s.rhythm(0, 16, [[0, 0.4], [1.5, 0.4], [3, 0.4]], 'arpUp', 24), -26);
  const whistle = [
    'E5 . G5 . . . E5 .', 'C5 . . . A4 . C5 .', 'D5 . . C5 A4 . . .', 'B4 . . . - - - -',
    'E5 . G5 . C6 . B5 .', 'A5 . . G5 E5 . . .', 'F5 . . E5 D5 . C5 .', 'D5 . . . - - - -',
    'G5 . . E5 . . C5 .', 'A5 . . . F5 . . .', 'G5 . . E5 . . C5 .', 'D5 . . . . . - -',
    'E5 . . G5 . . C6 .', 'A5 . . . F5 . A5 .', 'G5 . . E5 . C5 . .', 'D5 . . . B4 . . .',
  ];
  s.synth('whistle', K.sine, s.melody(whistle, 16), -20);
  return s.render({ eq: ['preset=brightpop'], target: -16 });
}

// ===================================================================
//  テーマ11 ハロー、ネオンシティ（フューチャーベース・フル尺 / F メジャー / 150 BPM / 96小節・約2分40秒）
//  イントロ → Aメロ → ビルドアップ → ドロップ → ブレイク → Aメロ2 → ビルドアップ2 → ドロップ2 → アウトロ
// ===================================================================
function futureSong() {
  const s = new Song('future', { bpm: 150, bars: 96, once: true, ending: 5, key: 5 });
  const DROP = ['M01', 4]; // FM7 G7 Em7 Am7 ×4
  const BUILD = ['M19', 2]; // F G Am Am ×2
  s.progression([
    ['M01', 2], // 0  イントロ（8）
    ['M21', 4], // 8  Aメロ（16）FM7 Em7 Dm7 CM7
    BUILD, // 24 ビルドアップ（8）
    DROP, // 32 ドロップ（16）
    ['M21', 2], // 48 ブレイク（8）
    ['M21', 2], // 56 Aメロ2（8）
    BUILD, // 64 ビルドアップ2（8）
    DROP, // 72 ドロップ2（16）
    ['M21', 2], // 88 アウトロ（8）
  ]);
  s.drums([
    { from: 4, bars: 4, genre: 'edm', groove: 16 }, // イントロのキックとハイハット
    { from: 8, bars: 16, genre: 'edm', groove: 16 },
    { from: 24, bars: 4, genre: 'edm', groove: 2 }, // ビルドアップ（4小節）
    { from: 28, bars: 2, genre: 'edm', groove: 7 }, // スネアのビルドアップ
    { from: 30, bars: 2, genre: 'edm', groove: 17 }, // ドロップの直前
    { from: 32, bars: 16, genre: 'edm', groove: 3 }, // フューチャーベース
    { from: 56, bars: 8, genre: 'edm', groove: 16 },
    { from: 64, bars: 4, genre: 'edm', groove: 2 },
    { from: 68, bars: 2, genre: 'edm', groove: 14 }, // クラップのビルドアップ
    { from: 70, bars: 2, genre: 'edm', groove: 17 },
    { from: 72, bars: 16, genre: 'edm', groove: 13 }, // キックを細かくしたドロップ
    { from: 88, bars: 4, genre: 'edm', groove: 16 },
  ], -16, ['preset=pop']);
  const drops = [[32, 48], [72, 88]];
  const chop = [[0, 0.6], [0.75, 0.6], [1.5, 0.4], [2, 0.6], [2.75, 0.4], [3.25, 0.6]]; // フューチャーベースの「刻み」
  s.synth('sub', K.subBass, [
    ...s.rhythm(8, 24, [[0, 1.9], [2, 1.9]], 'bass', -12),
    ...s.rhythm(24, 30, EIGHTHS.map((o) => [o, 0.45]), 'bass', -12),
    ...drops.flatMap(([a, b]) => s.rhythm(a, b, chop, 'bass', -12)),
    ...s.rhythm(56, 64, [[0, 1.9], [2, 1.9]], 'bass', -12),
    ...s.rhythm(64, 70, EIGHTHS.map((o) => [o, 0.45]), 'bass', -12),
  ], -18);
  s.synth('fbass', K.futureBass, drops.flatMap(([a, b]) => s.rhythm(a, b, chop, 'bass', 12)), -19);
  s.synth('saw', K.supersaw, [
    ...drops.flatMap(([a, b]) => s.rhythm(a, b, chop, 'upper')),
    ...s.rhythm(24, 32, [[0, 3.9]], 'upper'), // ビルドアップはのばす
    ...s.rhythm(64, 72, [[0, 3.9]], 'upper'),
  ], -20);
  s.synth('pad', K.pad, [
    ...s.rhythm(0, 32, [[0, 3.9]], 'upper'),
    ...s.rhythm(48, 72, [[0, 3.9]], 'upper'),
    ...s.rhythm(88, 96, [[0, 3.9]], 'upper'),
  ], -24);
  s.synth('pluck', K.pluck, [
    ...s.rhythm(0, 24, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12),
    ...s.rhythm(24, 28, EIGHTHS.map((o) => [o, 0.2]), 'arpUp', 12),
    ...s.rhythm(28, 32, SIXTEENTHS, 'arpUp', 12), // だんだん細かく
    ...s.rhythm(48, 64, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12),
    ...s.rhythm(64, 68, EIGHTHS.map((o) => [o, 0.2]), 'arpUp', 12),
    ...s.rhythm(68, 72, SIXTEENTHS, 'arpUp', 12),
    ...s.rhythm(88, 96, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12).filter((n) => n.beat < 94 * 4),
  ], -22);
  const DROP_M = [
    'A5 . C6 . E6 . D6 C6', 'D6 . . B5 . G5 . -', 'G5 . B5 . D6 . E6 D6', 'C6 . . . . . - -',
    'A5 . C6 . E6 . G6 E6', 'F6 . . D6 . B5 . -', 'E6 . D6 . B5 . G5 .', 'A5 . . . . . - -',
  ];
  const DROP_M2 = [...DROP_M.slice(0, 7), 'A5 . . . C6 . E6 .'];
  const VERSE_M = [
    '- - C5 . A4 . C5 .', 'D5 . . . B4 . G4 .', 'A4 . . . C5 . D5 .', 'E5 . . . . . - -',
    '- - C5 . A4 . F5 .', 'E5 . . . D5 . B4 .', 'C5 . . . D5 . F5 .', 'E5 . . . . . - -',
  ];
  const VERSE_M2 = [...VERSE_M.slice(0, 7), 'G5 . . . . . - -'];
  const BUILD_M = ['F5 . . . . . . .', 'G5 . . . . . . .', 'A5 . . . . . . .', 'C6 . . . B5 . . .'];
  // Aメロとブレイクはやわらかい三角波、ドロップは Supersaw（2回目は 1 オクターブ上のきらきらも）
  s.synth('vox', K.triangle, [...s.melody([...VERSE_M, ...VERSE_M2], 8), ...s.melody(DROP_M, 48, -12), ...s.melody(VERSE_M2, 56)], -17);
  s.synth('build', K.chip25, [...s.melody([...BUILD_M, ...BUILD_M], 24), ...s.melody([...BUILD_M, ...BUILD_M], 64)], -19);
  s.synth('lead', K.supersaw, [...s.melody([...DROP_M, ...DROP_M2], 32), ...s.melody([...DROP_M, ...DROP_M2], 72)], -16);
  s.synth('sparkle', K.chip12, s.melody([...DROP_M, ...DROP_M2], 72, 12), -23);
  return s.render({ eq: ['preset=edm'], target: -14 });
}

// ===================================================================
//  テーマ12 夜明けのハイウェイ（リキッド・ドラムンベース・フル尺 / D マイナー / 174 BPM / 112小節・約2分40秒）
//  イントロ → ドロップ → ブレイク → ドロップ2 → アウトロ
// ===================================================================
function dnbSong() {
  const s = new Song('dnb', { bpm: 174, bars: 112, once: true, ending: 6, key: 5 });
  s.progression([
    ['m09', 2], // 0   イントロ（16）Dm7 G7 CM7 FM7 Bm7♭5 E7 Am Am
    ['m09', 4], // 16  ドロップ（32）
    ['m16', 4], // 48  ブレイク（16）Am7 FM7 Bm7♭5 E7
    ['m09', 4], // 64  ドロップ2（32）
    ['m09', 2], // 96  アウトロ（16）
  ]);
  s.drums([
    { from: 8, bars: 8, genre: 'dnb', groove: 19 }, // ハイハットだけのイントロ
    { from: 16, bars: 24, genre: 'dnb', groove: 6 }, // リキッド
    { from: 40, bars: 8, genre: 'dnb', groove: 2 }, // 16分ハイハット
    { from: 56, bars: 8, genre: 'dnb', groove: 7 }, // ハーフタイム（ブレイクの後半で盛り上げ）
    { from: 64, bars: 24, genre: 'dnb', groove: 3 }, // ゴースト入りのスネア
    { from: 88, bars: 8, genre: 'dnb', groove: 18 }, // 開くハイハットで走る
    { from: 96, bars: 8, genre: 'dnb', groove: 19 },
  ], -16, ['preset=pop']);
  const drops = [[16, 48], [64, 96]];
  s.synth('reese', K.reese, drops.flatMap(([a, b]) => s.rhythm(a, b, [[0, 1.4, 0], [1.5, 0.4, 0], [2.5, 1.2, 0], [3.5, 0.45, 12]], 'bass')), -18);
  s.synth('sub', K.subBass, [
    ...drops.flatMap(([a, b]) => s.rhythm(a, b, [[0, 1.4], [1.5, 0.4], [2.5, 1.4]], 'bass', -12)),
    ...s.rhythm(56, 64, [[0, 3.9]], 'bass', -12),
  ], -21);
  s.synth('pad', K.pad, s.rhythm(0, 112, [[0, 3.9]], 'upper').filter((n) => n.beat < 110 * 4), -22);
  s.synth('keys', K.lofi, [
    ...drops.flatMap(([a, b]) => s.rhythm(a, b, [[0, 1.2], [1.5, 0.4], [2.5, 1.2]], 'upper')),
    ...s.rhythm(48, 56, [[0, 3.9]], 'upper'),
  ], -22);
  s.synth('arp', K.pluck, [
    ...s.rhythm(0, 16, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12),
    ...drops.flatMap(([a, b]) => s.rhythm(a, b, EIGHTHS.map((o) => [o, 0.25]), 'arp', 24)),
    ...s.rhythm(96, 108, EIGHTHS.map((o) => [o, 0.3]), 'arpUp', 12),
  ], -24);
  const LEAD = [
    'F5 . . . A5 . . C6', 'B5 . . . G5 . . .', 'E5 . . . G5 . B5 .', 'A5 . . . . . - -',
    'D6 . . . B5 . A5 .', 'G#5 . . . B5 . . .', 'A5 . . . E5 . . .', 'C6 . . . B5 . A5 .',
    'A5 . . . C6 . . D6', 'D6 . . . B5 . . G5', 'G5 . . . E5 . . .', 'F5 . . . E5 . . .',
    'D5 . . . F5 . A5 .', 'B5 . . . G#5 . . .', 'A5 . . . . . . .', '- - - - - - - -',
  ];
  const BREAK = [
    'E5 . . . . . . .', 'C5 . . . A4 . . .', 'D5 . . . F5 . . .', 'E5 . . . G#4 . . .',
    'E5 . . . A5 . . .', 'C6 . . . A5 . . .', 'B5 . . . D6 . . .', 'G#5 . . . . . . .',
  ];
  s.synth('lead', K.triangle, [...s.melody([...LEAD, ...LEAD], 16), ...s.melody([...LEAD, ...LEAD], 64, -12)], -17);
  s.synth('lead2', K.supersaw, s.melody([...LEAD, ...LEAD], 64), -18);
  s.synth('hint', K.sine, s.melody(LEAD.slice(0, 8), 8, -12), -26); // イントロでうっすら予告
  s.synth('break', K.sine, s.melody(BREAK, 48), -18);
  return s.render({ eq: ['preset=edm'], target: -14 });
}

// ---------------- 書き出し ----------------
// game: ゲームで使うときのファイル名（bgm_<game>.mp3。null ならゲームでは使わない）、archive: 保存用の名前、
// where: 'both' … puyo/music と VSTプラグイン/BGM の両方 / 'vst' … VSTプラグイン/BGM だけ（YouTube 用など）、use: 一覧に書く使いみち
const SONGS = {
  title: { make: titleSong, game: 'title', archive: 'テーマ1 はじまりのピコピコ（タイトル・8bit）', bpm: 150, loop: true, where: 'both', use: 'タイトル画面で使用' },
  menu: { make: menuSong, game: 'menu', archive: 'テーマ2 午後3時のローファイ（メニュー）', bpm: 80, loop: true, where: 'both', use: 'メニュー画面で使用' },
  game: { make: gameSong, game: 'game', archive: 'テーマ3 連鎖ラッシュ（バトル・激しめ）', bpm: 160, loop: true, where: 'both', use: 'ゲーム中に使用' },
  citypop: { make: cityPopSong, game: null, archive: 'テーマ4 ミッドナイト・モール（シティポップ）', bpm: 120, loop: true, where: 'both', use: '未使用' },
  boss: { make: bossSong, game: null, archive: 'テーマ5 ロッカー0004の逆襲（ボス戦・8bit×メタル）', bpm: 180, loop: true, where: 'both', use: '未使用' },
  town: { make: townSong, game: null, archive: 'テーマ6 ぽかぽか商店街（町・8bit）', bpm: 120, loop: true, where: 'both', use: '未使用' },
  jpop: { make: jpopSong, game: 'ending', archive: 'テーマ7 100万点の空（エンディング・J-POP）', bpm: 160, loop: false, where: 'both', use: 'エンディングで使用' },
  bossa: { make: bossaSong, game: null, archive: 'テーマ8 午後のテラス席（ボサノバ・BGM）', bpm: 120, loop: true, where: 'vst', use: 'YouTube 用 BGM（解説・トークの後ろに）' },
  house: { make: houseSong, game: null, archive: 'テーマ9 深夜2時の作業部屋（ディープハウス・BGM）', bpm: 125, loop: true, where: 'vst', use: 'YouTube 用 BGM（作業・紹介の後ろに）' },
  vlog: { make: vlogSong, game: null, archive: 'テーマ10 てくてく、さんぽ道（ゆるポップ・BGM）', bpm: 100, loop: true, where: 'vst', use: 'YouTube 用 BGM（vlog・日常の後ろに）' },
  future: { make: futureSong, game: null, archive: 'テーマ11 ハロー、ネオンシティ（フューチャーベース）', bpm: 150, loop: false, where: 'vst', use: 'YouTube 用（フル尺）' },
  dnb: { make: dnbSong, game: null, archive: 'テーマ12 夜明けのハイウェイ（リキッド・ドラムンベース）', bpm: 174, loop: false, where: 'vst', use: 'YouTube 用（フル尺）' },
};
for (const [name, exe] of Object.entries(TOOL)) {
  if (!fs.existsSync(exe)) {
    console.error(`${name} のツールがありません: ${exe}`);
    process.exit(1);
  }
}
const pick = process.argv.slice(2).filter((a) => SONGS[a]);
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const d of ARCHIVE_DIRS) fs.mkdirSync(d, { recursive: true });
console.log('Woody Class のプラグインで BGM を作っています…');
const loops = {};
try {
  // --list … 曲は作らず、保存用フォルダの一覧（00_曲の一覧.txt）だけ書きなおす
  const onlyList = process.argv.includes('--list');
  for (const name of onlyList ? [] : pick.length ? pick : Object.keys(SONGS)) {
    const info = SONGS[name];
    const t0 = Date.now();
    console.log(`  ${info.archive}`);
    const { game, loop, preview } = info.make();
    const loopSec = info.loop ? loop.length / 2 / SR : null;
    if (info.game) {
      const wav = path.join(WORK, 'game.wav');
      writeWav(wav, game);
      mp3(wav, path.join(OUT_DIR, `bgm_${info.game}.mp3`), 128);
      if (loopSec) loops[info.game] = { loopStart: LOOP_START, loopEnd: +(LOOP_START + loopSec).toFixed(6) };
    }
    // 保存用：wav（ループならちょうど 1 ループ）と、試聴用の mp3
    const wavPath = path.join(WORK, 'archive.wav');
    const prevPath = path.join(WORK, 'preview.wav');
    writeWav(wavPath, loop);
    writeWav(prevPath, preview);
    for (const d of info.where === 'vst' ? ARCHIVE_DIRS.slice(1) : ARCHIVE_DIRS) {
      const sub = path.join(d, folderOf(info)); // 「ループ」か「フル尺」のフォルダへ
      fs.mkdirSync(sub, { recursive: true });
      fs.copyFileSync(wavPath, path.join(sub, `${info.archive}.wav`));
      mp3(prevPath, path.join(sub, `${info.archive}.mp3`), 192);
    }
    console.log(`    → ${(loop.length / 2 / SR).toFixed(1)} 秒（${((Date.now() - t0) / 1000).toFixed(0)} 秒で作成）`);
  }
  // 保存用フォルダに一覧を書く（そのフォルダにある曲だけ。長さは wav から測る）
  const seconds = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
  for (const d of ARCHIVE_DIRS) {
    const wavOf = (i) => path.join(d, folderOf(i), `${i.archive}.wav`);
    const here = Object.values(SONGS).filter((i) => fs.existsSync(wavOf(i)));
    const group = (loop) => here.filter((i) => i.loop === loop)
      .map((i) => `${i.archive}  … ${i.bpm} BPM・${seconds(wavOf(i)).toFixed(1)} 秒・${i.use}`);
    const lines = [
      'さたぷよ BGM（Woody Class のプラグインで制作）',
      '',
      'ドラム：Woody Tsuzumi Beats / コード進行：Woody Wasei Chords / 音色：Woody Katachi Synth / 仕上げEQ：Woody Giongo EQ',
      '作り方：puyo/tools/music/make_bgm.mjs（node tools/music/make_bgm.mjs で全部作り直す。曲の名前を書けばその曲だけ）',
      '',
      '・ループ曲の .wav はちょうど 1 ループ。くり返して鳴らせばつなぎ目なしでループする（48kHz / 24bit）',
      '・.mp3 は試聴用（ループ曲は 2 回くり返してフェードアウト）',
      '・テーマ7 のエンドロール動画（mp4）は node tools/video/make_ending_video.mjs で作り直せる',
      '',
      '■ ループ（ループ フォルダ）',
      ...group(true),
      '',
      '■ フル尺（フル尺 フォルダ）',
      ...group(false),
      '',
    ];
    fs.writeFileSync(path.join(d, '00_曲の一覧.txt'), '﻿' + lines.join('\r\n'), 'utf8');
  }
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
}
if (Object.keys(loops).length) {
  console.log('\njs/config.js の sounds に書くループ位置:');
  for (const [name, l] of Object.entries(loops)) console.log(`  bgm${name[0].toUpperCase() + name.slice(1)}: { src: 'assets/sound/bgm_${name}.mp3', loopStart: ${l.loopStart}, loopEnd: ${l.loopEnd} },`);
}
console.log('\n保存先:', ARCHIVE_DIRS.join(' / '));
