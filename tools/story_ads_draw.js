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
  const URL_TEXT = CFG.share.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

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

  const out = {};

  // ---------- 1まいめ：つかみ ----------
  {
    const [c, g] = canvas();
    background(g, 1);
    fallingFaces(g, [[110, 470, 70, 0], [960, 420, 80, 3], [90, 1010, 62, 5], [990, 930, 66, 8], [110, 1370, 70, 10], [985, 1080, 46, 13]]);
    logoAt(g, W / 2, 250, 600);
    title(g, 'さたろうの 顔が', W / 2, 590, 92, '#fff');
    title(g, 'おちてくる！', W / 2, 725, 134, PINK);
    pill(g, 'ぷよぷよ風 おちもの パズル', W / 2, 805, 84, '#fff', INK);
    photo(g, field, W / 2, 1150, 300, -0.04);
    burst(g, ['れんさで', 'ドカン！'], 220, 1080, 118, PINK, -0.15);
    burst(g, ['顔は', '16にん'], 868, 1260, 112, GOLD, 0.14);
    // 下：3つの ポイント
    const chips = ['むりょう', 'とうろく なし', 'スマホ・PC'];
    chips.forEach((l, i) => pill(g, l, 200 + i * 340, 1530, 82, ['#2fbf6f', '#4d8bff', '#ff8a3d'][i], '#fff', 320));
    out.story1_tsukami = c.toDataURL('image/png');
  }

  // ---------- 2まいめ：モードと おたのしみ（情報もりもり） ----------
  {
    const [c, g] = canvas();
    background(g, 7);
    title(g, '5つの モードで あそべる！', W / 2, 330, 80, '#fff');
    const modes = [
      ['♾️', 'とことんモード', 'つみあがるまで ずっと。100まんてんで…？', '#ff4d6d'],
      ['⏱️', 'タイムアタック', `${CFG.timeAttackSeconds}びょうで スコアかせぎ`, '#2fbf6f'],
      ['✨', 'ぜんけしアタック', 'ぜんぶ けすまでの タイムを きそう', '#ff8a3d'],
      ['⚔️', 'CPU たいせん', 'おじゃまぷよで しょうぶ（3だんかい）', '#a66bff'],
      ['🥋', 'くみて', 'かちぬき戦。かつほど あいてが つよくなる', '#4d8bff'],
    ];
    modes.forEach(([icon, name, desc, color], i) => {
      const y = 380 + i * 158;
      card(g, 70, y, W - 140, 140);
      g.beginPath();
      g.arc(160, y + 70, 50, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      font(g, 50);
      g.textAlign = 'center';
      g.fillText(icon, 160, y + 88);
      text(g, name, 240, y + 66, 50, INK, 'left', W - 340, 900);
      text(g, desc, 240, y + 112, 32, SOFT, 'left', W - 340, 800);
    });
    title(g, 'ほかにも いろいろ', W / 2, 1230, 60, GOLD);
    const extras = [
      ['🏆', 'ぜんこく ランキング', '100いまで のる'],
      ['🎖️', 'じっせき', '26この トロフィー'],
      ['📖', 'さたろう ずかん', '16にんの 顔と キャラ'],
      ['📸', 'きろくを シェア', 'ストーリー画像も つくれる'],
    ];
    extras.forEach(([icon, name, desc], i) => {
      const x = 70 + (i % 2) * 480, y = 1262 + Math.floor(i / 2) * 160;
      card(g, x, y, 460, 146);
      font(g, 54);
      g.textAlign = 'center';
      g.fillText(icon, x + 66, y + 92);
      text(g, name, x + 120, y + 64, 36, INK, 'left', 320, 900);
      text(g, desc, x + 120, y + 108, 26, SOFT, 'left', 320, 800);
    });
    out.story2_mode = c.toDataURL('image/png');
  }

  // ---------- 3まいめ：対戦 ＋ リンク ----------
  function cta(adVersion) {
    const [c, g] = canvas();
    background(g, 13);
    title(g, 'CPU と たいせんも できる！', W / 2, 330, 78, '#fff');
    photo(g, versus, W / 2, 750, 880, 0.02);
    burst(g, ['おじゃま', 'ぷよ！'], 880, 880, 100, PINK, 0.2);
    title(g, 'いますぐ あそぼう！', W / 2, 1255, 104, PINK);
    pill(g, '🔗 ' + URL_TEXT, W / 2, 1345, 96, '#fff', INK, W - 120);
    text(g, 'むりょう ・ とうろく なし ・ アプリ いらない', W / 2, 1450, 40, '#fff', 'center', W - 140, 900);
    if (adVersion) {
      title(g, '▼ 下の ボタンから すぐ あそべる ▼', W / 2, 1545, 46, GOLD, W - 120);
    } else {
      // この下に インスタの「リンク」スタンプを はる（なにも かかない）
      title(g, '▼ リンクから すぐ あそべる ▼', W / 2, 1530, 50, GOLD, W - 120);
    }
    return c.toDataURL('image/png');
  }
  out.story3_link = cta(false);
  out.story3_ad = cta(true);
  return out;
};
