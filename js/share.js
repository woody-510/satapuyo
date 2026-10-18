// スコアのシェア：SNS ごとの投稿リンク・コピー用の文章・きろくの画像（1200x630）を作る
const Share = (() => {
  const CFG = window.GAME_CONFIG;
  const S = CFG.share || {};
  const url = () => S.url || location.origin + location.pathname;
  const tags = () => S.hashtags || ['さたぷよ'];
  const tagText = () => tags().map((t) => '#' + t).join(' ');

  // 投稿する文章：きろく + ひとこと宣伝 + ハッシュタグ + URL（画面で書きかえてもOK）
  const fullText = (line) => [line, S.catch, tagText(), url()].filter(Boolean).join('\n');

  // SNS ごとの投稿画面のリンク（Facebook は文章を入れられないので URL だけ）
  function links(text) {
    const e = encodeURIComponent;
    return {
      x: `https://twitter.com/intent/tweet?text=${e(text)}`,
      line: `https://line.me/R/share?text=${e(text)}`,
      threads: `https://www.threads.net/intent/post?text=${e(text)}`,
      bsky: `https://bsky.app/intent/compose?text=${e(text)}`,
      fb: `https://www.facebook.com/sharer/sharer.php?u=${e(url())}`,
    };
  }

  // ---------------- きろくの画像 ----------------
  const W = 1200, H = 630;
  const FONT = "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif";

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function faceCircle(g, img, cx, cy, r, ring) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r + 10, 0, Math.PI * 2);
    g.fillStyle = ring;
    g.fill();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#fff';
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (img && img.naturalWidth) {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
  }

  // 太い白ふちの文字
  function outlined(g, text, x, y, size, fill, align = 'left') {
    g.font = `900 ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.lineWidth = size * 0.18;
    g.strokeStyle = '#3a2350';
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }

  // 横はばに入るように文字を小さくする
  function fitSize(g, text, size, maxW) {
    g.font = `900 ${size}px ${FONT}`;
    const w = g.measureText(text).width;
    return w > maxW ? Math.floor((size * maxW) / w) : size;
  }

  // r: { mode: 'とことんモード', big: '123,456', unit: 'てん', sub: 'さいだい 7れんさ', face: Image, faces: [Image], logo: Image }
  function card(r) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    // 背景
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#ff8fb8');
    bg.addColorStop(0.5, '#a66bff');
    bg.addColorStop(1, '#4d8bff');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 水玉
    const colors = CFG.ringColors;
    for (let i = 0; i < 22; i++) {
      const x = (i * 211) % W, y = (i * 137) % H, rr = 18 + ((i * 53) % 60);
      g.globalAlpha = 0.18;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // 白いパネル
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.25)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 12;
    roundRect(g, 40, 40, W - 80, H - 80, 48);
    g.fillStyle = 'rgba(255,255,255,0.93)';
    g.fill();
    g.restore();
    // 左：顔
    faceCircle(g, r.face, 270, 290, 165, '#ffb703');
    (r.faces || []).slice(0, 4).forEach((img, i) => faceCircle(g, img, 120 + i * 100, 525, 38, colors[i % colors.length]));
    // 右：ロゴ・モード・記録
    const left = 500, maxW = W - left - 80;
    if (r.logo && r.logo.naturalWidth) {
      const lw = 360, lh = (lw * r.logo.naturalHeight) / r.logo.naturalWidth;
      g.drawImage(r.logo, left, 70, lw, lh);
    } else {
      outlined(g, CFG.title, left, 160, 96, '#ff4d6d');
    }
    g.font = `800 ${fitSize(g, r.mode, 40, maxW)}px ${FONT}`;
    g.textAlign = 'left';
    g.fillStyle = '#7a5c96';
    g.fillText(r.mode, left, 250);
    // 大きい数字＋単位が横はばに入るように、まとめて小さくする
    g.font = `900 140px ${FONT}`;
    const bw140 = g.measureText(r.big).width;
    g.font = `800 50px ${FONT}`;
    const uw140 = r.unit ? 14 + g.measureText(r.unit).width : 0;
    const bigSize = Math.floor(140 * Math.min(1, maxW / (bw140 + uw140)));
    outlined(g, r.big, left, 400, bigSize, '#ff4d6d');
    if (r.unit) {
      g.font = `900 ${bigSize}px ${FONT}`;
      const bw = g.measureText(r.big).width;
      g.font = `800 ${Math.round(bigSize * 0.36)}px ${FONT}`;
      g.fillStyle = '#7a5c96';
      g.fillText(r.unit, left + bw + 14, 400);
    }
    if (r.sub) {
      g.font = `800 ${fitSize(g, r.sub, 38, maxW)}px ${FONT}`;
      g.fillStyle = '#3a2350';
      g.fillText(r.sub, left, 465);
    }
    // 下：URL
    roundRect(g, left - 6, 500, maxW + 12, 70, 35);
    g.fillStyle = '#ff4d6d';
    g.fill();
    g.font = `900 ${fitSize(g, '▶ ' + url().replace(/^https?:\/\//, '').replace(/\/$/, '') + ' で あそべる！', 36, maxW - 30)}px ${FONT}`;
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.fillText('▶ ' + url().replace(/^https?:\/\//, '').replace(/\/$/, '') + ' で あそべる！', left + maxW / 2, 547);
    return c;
  }

  return { url, links, fullText, card };
})();
