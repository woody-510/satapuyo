// ぜんけしアタック「はいち あり」の最初の配置を作って js/presets.js に書き出す
//   node tools/make_presets.mjs
// ぷよの種類（3〜5）ごとに PER 個。次の条件をみたすものだけを残す
//   ・4つ以上つながっている所がない（置いたとたんに消えない）
//   ・どの色も2個以上ある
//   ・ペアの色を自由に選べれば、MAX_PIECES 手以内に全消しできる（ビームサーチで確認）
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Sim } = require('../js/cpu.js');
const { W, H, EMPTY } = Sim;

const PER = 12;
const MAX_PIECES = 12;
const BEAM = 160;
const SIZE = { 3: [10, 16], 4: [12, 18], 5: [14, 20] }; // ぷよの数の範囲

// 毎回同じ配置になるように、乱数は種から作る
let seed = 20261017;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const ri = (n) => Math.floor(rand() * n);

function makeBoard(n) {
  const [lo, hi] = SIZE[n];
  const total = lo + ri(hi - lo + 1);
  // 3・4列目（出てくる所のまわり）は低めに
  const cap = [6, 6, 3, 3, 6, 6];
  const h = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < total; k++) {
    const cand = [0, 1, 2, 3, 4, 5].filter((x) => h[x] < cap[x]);
    // となりと高さがそろいやすいように、低い列をやや選びやすく
    const w = cand.map((x) => 1 / (1 + h[x] * 0.6));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    let x = cand[cand.length - 1];
    for (let i = 0; i < cand.length; i++) if ((r -= w[i]) <= 0) { x = cand[i]; break; }
    h[x]++;
  }
  const b = new Int8Array(W * H).fill(EMPTY);
  for (let x = 0; x < W; x++) for (let k = 0; k < h[x]; k++) b[(H - 1 - k) * W + x] = ri(n);
  return b;
}

function hasGroup4(b) {
  const c = b.slice();
  return Sim.chain(c).chain > 0;
}

function colorCounts(b, n) {
  const cnt = Array(n).fill(0);
  for (const v of b) if (v >= 0) cnt[v]++;
  return cnt;
}

// ペアの色を自由に選べるとして、全消しまでの最短手数を探す（見つからなければ 0）
function solvable(start, n) {
  const pairs = [];
  for (let a = 0; a < n; a++) for (let c = a; c < n; c++) pairs.push([a, c]);
  let beam = [start];
  for (let depth = 1; depth <= MAX_PIECES; depth++) {
    const next = new Map();
    for (const b of beam) {
      for (const [a, c] of pairs) {
        for (const [x, r] of Sim.placements(b, a, c)) {
          const nb = Sim.place(b, x, r, a, c);
          const res = Sim.chain(nb);
          if (res.allClear) return depth;
          if (Sim.dead(nb)) continue;
          const key = nb.join(',');
          if (next.has(key)) continue;
          const f = Sim.features(nb);
          next.set(key, { b: nb, v: -f.count * 10 + f.conn * 3 + res.chain * 5 - Math.max(...f.h) });
        }
      }
    }
    beam = [...next.values()].sort((p, q) => q.v - p.v).slice(0, BEAM).map((s) => s.b);
  }
  return 0;
}

function toRows(b) {
  const rows = [];
  for (let y = 1; y < H; y++) {
    let s = '';
    for (let x = 0; x < W; x++) s += b[y * W + x] < 0 ? '.' : String.fromCharCode(65 + b[y * W + x]);
    rows.push(s);
  }
  // 上の空いている段は書かない
  while (rows.length && rows[0] === '......') rows.shift();
  return rows;
}

const out = {};
for (const n of [3, 4, 5]) {
  out[n] = [];
  let tries = 0;
  while (out[n].length < PER) {
    tries++;
    const b = makeBoard(n);
    if (hasGroup4(b)) continue;
    if (colorCounts(b, n).some((c) => c < 2)) continue;
    const d = solvable(b, n);
    if (!d || d < 3) continue; // すぐ終わるのはつまらない
    out[n].push({ rows: toRows(b), min: d });
    console.log(`${n}しゅるい #${out[n].length}  ${Sim.features(b).count}こ  最短${d}手  (試行 ${tries})`);
  }
}

let js = `// ぜんけしアタック「はいち あり」で最初に置いておくぷよ（tools/make_presets.mjs で作成）
// ぷよの種類（3〜5）ごとに複数あって、毎回ランダムに1つ選ぶ。
// A〜E が色（遊ぶたびに色の割り当てと左右の向きはランダム）、. は空き。下の段がフィールドのいちばん下。
// どれも4つ以上つながっている所はなく（置いたとたんに消えない）、全消しできることを確認ずみ。
// min は「ペアの色を自由に選べたとき」の最短手数（めやす）
window.ALLCLEAR_PRESETS = {\n`;
for (const n of [3, 4, 5]) {
  js += `  ${n}: [\n`;
  for (const p of out[n]) js += `    { min: ${p.min}, rows: [${p.rows.map((r) => `'${r}'`).join(', ')}] },\n`;
  js += `  ],\n`;
}
js += '};\n';
const path = fileURLToPath(new URL('../js/presets.js', import.meta.url));
writeFileSync(path, js);
console.log('書き出し:', path);
