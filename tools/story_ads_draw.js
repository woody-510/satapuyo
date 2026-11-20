// インスタのストーリー広告の絵（1080x1920）。tools/make_story_ads.mjs がブラウザの中で動かす
//   上 250px（アカウント名）と下 340px（広告の「詳しくはこちら」ボタン）には大事な文字を置かない
window.drawStoryAds = async function () {
  await Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 5000))]);
  const CFG = window.GAME_CONFIG;
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = () => ok(i); i.src = src; });
  const faces = await Promise.all(CFG.faces.map((f) => load(f.src)));
  const logo = await load(CFG.images.logo);
  const field = await load('ads/src/cap_field.png');
  const versus = await load('ads/src/cap_versus.png');

  const W = 1080, H = 1920;
  const FONT = "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', sans-serif";
  const INK = '#3a2350', SOFT = '#7a5c96', PINK = '#ff4d6d', GOLD = '#ffb703';

  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return [c, c.getContext('2d')];
  };
  const font = (g, size, weight = 900) => (g.font = `${weight} ${size}px ${FONT}`);
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function fitSize(g, text, size, maxW, weight = 900) {
    font(g, size, weight);
    const w = g.measureText(text).width;
    return w > maxW ? Math.floor((size * maxW) / w) : size;
  }
  // ふちどり文字
  function title(g, text, x, y, size, fill, maxW = W - 120, stroke = INK) {
    const s = fitSize(g, text, size, maxW);
    font(g, s);
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.lineWidth = s * 0.2;
    g.strokeStyle = stroke;
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }
  function text(g, str, x, y, size, color, align = 'center', maxW = W - 120, weight = 800) {
    font(g, fitSize(g, str, size, maxW, weight), weight);
    g.textAlign = align;
    g.fillStyle = color;
    g.fillText(str, x, y);
  }
  function face(g, img, cx, cy, r, ring) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r + Math.max(5, r * 0.1), 0, Math.PI * 2);
    g.fillStyle = ring;
    g.fill();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    if (img && img.naturalWidth) {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
  }
  // ゲーム画面の写真（白いふち・かげ・すこし かたむける）
  function photo(g, img, cx, cy, w, angle = 0) {
    const h = (w * img.naturalHeight) / img.naturalWidth;
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;
    rr(g, -w / 2 - 12, -h / 2 - 12, w + 24, h + 24, 34);
    g.fillStyle = '#fff';
    g.fill();
    g.shadowColor = 'transparent';
    rr(g, -w / 2, -h / 2, w, h, 24);
    g.clip();
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
    return h;
  }
  function pill(g, label, cx, cy, h, bg, color, maxW = W - 160) {
    const s = fitSize(g, label, h * 0.48, maxW - h);
    font(g, s);
    const w = Math.min(maxW, g.measureText(label).width + h * 1.1);
    rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.stroke();
    g.textAlign = 'center';
    g.fillStyle = color;
    g.fillText(label, cx, cy + s * 0.36);
    return w;
  }
  // 吹き出し（まるいバッジ）
  function burst(g, lines, cx, cy, r, bg, angle) {
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, rad = i % 2 ? r : r * 1.14;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = '#fff';
    g.stroke();
    lines.forEach((l, i) => title(g, l, 0, (i - (lines.length - 1) / 2) * r * 0.5 + r * 0.16, r * 0.4, '#fff', r * 1.6));
    g.restore();
  }
  function background(g, seed = 1) {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#ff8fb8');
    bg.addColorStop(0.5, '#a66bff');
    bg.addColorStop(1, '#4d8bff');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = ((i + seed) * 211) % W, y = ((i + seed) * 337) % H, r = 20 + (((i + seed) * 53) % 80);
      g.globalAlpha = 0.16;
      g.fillStyle = CFG.ringColors[i % CFG.ringColors.length];
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // 画面のはしを おちてくる顔（かざり）
  function fallingFaces(g, spots) {
    spots.forEach(([x, y, r, fi], i) => face(g, faces[fi % faces.length], x, y, r, CFG.ringColors[i % CFG.ringColors.length]));
  }
  function card(g, x, y, w, h) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.2)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 10;
    rr(g, x, y, w, h, 34);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fill();
    g.restore();
  }
  const logoAt = (g, cx, y, w) => {
    if (logo.naturalWidth) g.drawImage(logo, cx - w / 2, y, w, (w * logo.naturalHeight) / logo.naturalWidth);
  };

  // 白いカードに アイコン・見出し・説明
  function infoCard(g, x, y, w, h, icon, head, body, color) {
    card(g, x, y, w, h);
    const r = Math.min(h * 0.32, 46);
    g.beginPath();
    g.arc(x + r + 22, y + h / 2, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    font(g, r * 1.05);
    g.textAlign = 'center';
    g.fillText(icon, x + r + 22, y + h / 2 + r * 0.38);
    const tx = x + r * 2 + 44, tw = w - (tx - x) - 20;
    text(g, head, tx, y + h * 0.43, Math.min(44, h * 0.32), INK, 'left', tw, 900);
    text(g, body, tx, y + h * 0.78, Math.min(28, h * 0.21), SOFT, 'left', tw, 800);
  }
  // 小さいタグ
  function tag(g, label, x, y, h, color) {
    font(g, h * 0.56);
    const w = g.measureText(label).width + h * 0.8;
    rr(g, x, y, w, h, h / 2);
    g.fillStyle = color;
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText(label, x + w / 2, y + h * 0.72);
    return w;
  }
  // 大きい数字のタイル
  function numTile(g, x, y, w, h, num, label, color) {
    rr(g, x, y, w, h, 28);
    g.fillStyle = color;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.stroke();
    title(g, num, x + w / 2, y + h * 0.56, h * 0.42, '#fff', w - 20);
    text(g, label, x + w / 2, y + h * 0.86, h * 0.17, '#fff', 'center', w - 16, 900);
  }

  const out = {};
  const COLORS = ['#ff4d6d', '#2fbf6f', '#4d8bff', '#ffb703', '#a66bff', '#ff8a3d'];

  // ---------- 1まいめ：つかみ ----------
  {
    const [c, g] = canvas();
    background(g, 1);
    pill(g, '★ ブラウザで すぐ あそべる パズルゲーム ★', W / 2, 205, 70, GOLD, INK, W - 140);
    logoAt(g, W / 2, 250, 500);
    title(g, 'さたろうの 顔が', W / 2, 520, 84, '#fff');
    title(g, 'おちてくる！', W / 2, 640, 122, PINK);
    pill(g, 'ぷよぷよ風 おちもの パズル', W / 2, 712, 76, '#fff', INK);
    // 左：ゲーム画面　右：ポイント4つ
    photo(g, field, 222, 1070, 280, -0.03);
    burst(g, ['3れんさ', 'ちゅう！'], 330, 800, 70, PINK, 0.18);
    const points = [
      ['😆', '顔が ぷよに！', '16にんの さたろうが おちてくる', COLORS[0]],
      ['4️⃣', '4つで きえる', 'おなじ顔（わくの色）を 4つ以上', COLORS[1]],
      ['💥', 'れんさで ドカン', '8れんさで 約5まんてん！', COLORS[2]],
      ['🎮', '5つの モード', 'とことん・CPU たいせん など', COLORS[4]],
    ];
    points.forEach(([icon, head, body, col], i) => infoCard(g, 410, 790 + i * 146, 610, 132, icon, head, body, col));
    // 数字
    const nums = [['16にん', 'さたろう'], ['5つ', 'モード'], ['26こ', 'じっせき'], ['100い', 'ぜんこく ランキング']];
    nums.forEach(([n, l], i) => numTile(g, 60 + i * 245, 1385, 225, 160, n, l, COLORS[[3, 0, 1, 2][i]]));
    const chips = ['むりょう', 'とうろく なし', 'スマホ・PC'];
    chips.forEach((l, i) => pill(g, l, 200 + i * 340, 1610, 76, ['#2fbf6f', '#4d8bff', '#ff8a3d'][i], '#fff', 320));
    text(g, '♪ オリジナル BGM ＆ さたろう本人の ボイス つき', W / 2, 1712, 36, '#fff', 'center', W - 120, 900);
    out.story1_tsukami = c.toDataURL('image/png');
  }

  // ---------- 2まいめ：モードと おたのしみ ----------
  {
    const [c, g] = canvas();
    background(g, 7);
    title(g, '5つの モードで あそべる！', W / 2, 300, 78, '#fff');
    const modes = [
      ['♾️', 'とことんモード', 'つみあがるまで ずっと。25手ごとに スピードアップ', ['100まん点で エンディング', '10れんさ＝約10まん点'], COLORS[0]],
      ['⏱️', 'タイムアタック', `${CFG.timeAttackSeconds}びょうで どこまで スコアを かせげるか`, ['みじかい じかんで サクッと', 'ハイスコア きそう'], COLORS[1]],
      ['✨', 'ぜんけしアタック', 'ぷよを ぜんぶ けすまでの タイムを きそう', ['はいち 36パターン', 'ぷよ 3〜5しゅるい'], COLORS[5]],
      ['⚔️', 'CPU たいせん', 'れんさで おじゃまぷよを おくりあう たいせん', ['よわい・ふつう・つよい', 'ぷよぷよ通 ルール'], COLORS[4]],
      ['🥋', 'くみて', 'CPU と かちぬき戦。かつほど あいてが つよくなる', ['おわりなし', 'なんにん ぬけるか'], COLORS[2]],
    ];
    modes.forEach(([icon, name, desc, tags, color], i) => {
      const y = 345 + i * 186, h = 172;
      card(g, 60, y, W - 120, h);
      g.beginPath();
      g.arc(140, y + 66, 50, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      font(g, 50);
      g.textAlign = 'center';
      g.fillText(icon, 140, y + 84);
      text(g, name, 210, y + 60, 46, INK, 'left', W - 300, 900);
      text(g, desc, 210, y + 104, 28, SOFT, 'left', W - 300, 800);
      let tx = 210;
      tags.forEach((t) => (tx += tag(g, t, tx, y + 122, 38, color) + 10));
    });
    title(g, 'ほかにも いろいろ', W / 2, 1335, 58, GOLD);
    const extras = [
      ['🏆', 'ぜんこく ランキング', '100いまで じどうで のる'],
      ['🎖️', 'じっせき 26こ', '7れんさ・10にんぬき など'],
      ['📖', 'さたろう ずかん', '16にんの キャラと けした数'],
      ['📸', 'きろくを シェア', 'ストーリー画像も つくれる'],
      ['🎵', 'オリジナル BGM', 'タイトル・ゲーム中・エンディング'],
      ['🔄', 'データ ひきつぎ', 'きしゅへんこう しても OK'],
    ];
    extras.forEach(([icon, name, desc], i) => {
      const x = 60 + (i % 2) * 490, y = 1368 + Math.floor(i / 2) * 118;
      card(g, x, y, 470, 106);
      font(g, 46);
      g.textAlign = 'center';
      g.fillText(icon, x + 52, y + 70);
      text(g, name, x + 98, y + 46, 32, INK, 'left', 360, 900);
      text(g, desc, x + 98, y + 86, 23, SOFT, 'left', 360, 800);
    });
    out.story2_mode = c.toDataURL('image/png');
  }

  // ---------- 3まいめ：さたろう ずかん（16にん） ----------
  {
    const [c, g] = canvas();
    background(g, 4);
    title(g, 'おちてくるのは この16にん！', W / 2, 300, 72, '#fff');
    text(g, 'ぜんいん さたろう。キャラ設定つき', W / 2, 352, 36, '#fff', 'center', W - 120, 900);
    const cols = 4, gap = 14, cw = (W - 80 - gap * (cols - 1)) / cols, ch = 300;
    CFG.faces.slice(0, 16).forEach((f, i) => {
      const x = 40 + (i % cols) * (cw + gap), y = 385 + Math.floor(i / cols) * (ch + gap);
      card(g, x, y, cw, ch);
      face(g, faces[i], x + cw / 2, y + 96, 72, COLORS[i % COLORS.length]);
      text(g, f.name, x + cw / 2, y + 214, 28, INK, 'center', cw - 16, 900);
      text(g, f.role || '', x + cw / 2, y + 258, 24, SOFT, 'center', cw - 16, 800);
    });
    pill(g, 'エンディングでは 16にんから ひとこと…！', W / 2, 1700, 78, GOLD, INK, W - 100);
    out.story3_zukan = c.toDataURL('image/png');
  }

  // ---------- 4まいめ：対戦 ＋ リンク ----------
  function cta(adVersion) {
    const [c, g] = canvas();
    background(g, 13);
    title(g, 'CPU と たいせん！', W / 2, 290, 80, '#fff');
    photo(g, versus, W / 2, 640, 740, 0.015);
    burst(g, ['おじゃま', 'ぷよ！'], 905, 790, 92, PINK, 0.2);
    // あそびかた 3ステップ
    const steps = [['1', 'おなじ顔を', '4つ そろえる'], ['2', 'れんさで', 'おじゃまを おくる'], ['3', 'さきに つみあがったら', 'まけ！']];
    steps.forEach(([n, a, b], i) => {
      const x = 60 + i * 330, y = 1010;
      card(g, x, y, 300, 200);
      g.beginPath();
      g.arc(x + 150, y + 48, 34, 0, Math.PI * 2);
      g.fillStyle = COLORS[i];
      g.fill();
      title(g, n, x + 150, y + 64, 44, '#fff', 60);
      text(g, a, x + 150, y + 128, 30, INK, 'center', 280, 900);
      text(g, b, x + 150, y + 172, 30, INK, 'center', 280, 900);
    });
    let tx = 70;
    [['よわい', COLORS[1]], ['ふつう', COLORS[3]], ['つよい', COLORS[0]], ['くみて（かちぬき）', COLORS[2]]].forEach(([l, col]) => (tx += tag(g, l, tx, 1238, 56, col) + 14));
    title(g, 'いますぐ あそぼう！', W / 2, 1405, 100, PINK);
    text(g, 'むりょう ・ とうろく なし ・ アプリ いらない', W / 2, 1470, 38, '#fff', 'center', W - 140, 900);
    if (adVersion) {
      title(g, '▼ 下の ボタンから すぐ あそべる ▼', W / 2, 1550, 48, GOLD, W - 120);
    } else {
      // この下（だいたい y=1570〜1760）は あけておく。インスタの「リンク」スタンプを あとで はる
      title(g, '▼ リンクから すぐ あそべる ▼', W / 2, 1550, 48, GOLD, W - 120);
    }
    return c.toDataURL('image/png');
  }
  out.story4_link = cta(false);
  out.story4_ad = cta(true);
  return out;
};
