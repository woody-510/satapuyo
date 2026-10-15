// =====================================================================
//  さたぷよ 設定ファイル
//  画像・音・タイトルなどはここを書き換えれば差し替えられる。
//  画像のサイズはバラバラでもOK（ゲーム側で中央を正方形に切り抜いて丸く表示する）。
// =====================================================================
window.GAME_CONFIG = {
  title: 'さたぷよ',

  // 落ちてくるぷよの顔。好きなだけ追加・削除してOK（最低3つ）。
  faces: [
    { src: 'assets/puyo/face01.jpg', name: 'まぶしさたろう' },
    { src: 'assets/puyo/face02.jpg', name: 'ピースさたろう' },
    { src: 'assets/puyo/face03.jpg', name: 'しんかんせんさたろう' },
    { src: 'assets/puyo/face04.jpg', name: 'ぐるぐるさたろう' },
    { src: 'assets/puyo/face05.jpg', name: 'ゆびさたろう' },
    { src: 'assets/puyo/face06.jpg', name: 'めがねさたろう' },
    { src: 'assets/puyo/face07.jpg', name: 'ボサボサさたろう' },
    { src: 'assets/puyo/face08.jpg', name: 'サングラスさたろう' },
    { src: 'assets/puyo/face09.jpg', name: 'ゆびさしさたろう' },
    { src: 'assets/puyo/face10.jpg', name: 'そつアルさたろう' },
    { src: 'assets/puyo/face11.jpg', name: 'にっこりさたろう' },
    { src: 'assets/puyo/face12.jpg', name: 'べろさたろう' },
    { src: 'assets/puyo/face13.jpg', name: 'むにさたろう' },
    { src: 'assets/puyo/face14.jpg', name: 'ブレさたろう' },
    { src: 'assets/puyo/face15.jpg', name: 'キメさたろう' },
    { src: 'assets/puyo/face16.jpg', name: 'ねそべりさたろう' },
  ],

  // ぷよの種類ごとの枠の色（顔が似てても見分けられるように）
  ringColors: ['#ff4d6d', '#2fd47a', '#4d9bff', '#ffc93f', '#b06bff'],

  // ロゴとフィールドの背景（同じファイル名で上書きすれば差し替わる）
  images: {
    logo: 'assets/ui/logo.png',          // 透過PNG 推奨 1000x340
    fieldBg: 'assets/bg/field.png',      // フィールド(6x12) 384x768
  },

  // 画面ごとの背景。何枚でもOKで、ゆっくり動きながら順番に切りかわる。
  // サイズはバラバラでも画面いっぱいに合わせる（推奨 1280x720）。
  backgrounds: {
    title: ['assets/bg/title.jpg', 'assets/bg/bg1.jpg', 'assets/bg/bg2.jpg'],
    menu: ['assets/bg/menu.jpg', 'assets/bg/bg3.jpg', 'assets/bg/bg4.jpg'],
    game: ['assets/bg/game.jpg', 'assets/bg/bg1.jpg', 'assets/bg/bg2.jpg', 'assets/bg/bg3.jpg', 'assets/bg/bg4.jpg'],
  },
  backgroundSeconds: 12, // 1枚あたりの表示時間

  // 音ファイル。null のままだと内蔵のピコピコ音が鳴る。
  // BGM は tools/music/make_bgm.mjs で Woody Class のプラグインから作ったもの（loopStart〜loopEnd をつなぎ目なしでくり返す）。
  // 自分の曲に差し替えるときは bgmGame: 'assets/sound/my_song.mp3' のように書けばファイル全体をループ。
  sounds: {
    bgmTitle: { src: 'assets/sound/bgm_title.mp3', loopStart: 0.1, loopEnd: 25.7 }, // タイトル：テーマソング
    bgmMenu: { src: 'assets/sound/bgm_menu.mp3', loopStart: 0.1, loopEnd: 48.1 },   // メニュー：落ちついた曲
    bgmGame: { src: 'assets/sound/bgm_game.mp3', loopStart: 0.1, loopEnd: 48.1 },   // ゲーム中：激しめの曲
    move: null,
    rotate: null,
    land: null,
    pop: null,      // 連鎖のたびに少しずつ音程が上がる（内蔵音のみ）
    allClear: null,
    gameOver: null,
    select: null,
    decide: null,
  },

  // タイムアタックの制限時間（秒）
  timeAttackSeconds: 120,

  // メニューの「おんがく」画面に出す、BGM を作ったプラグインとリンク
  credits: {
    lead: 'BGM は 3 曲とも、Woody Class の VST プラグインの音だけで作りました。',
    plugins: [
      {
        name: 'Woody Tsuzumi Beats',
        role: 'ドラム',
        desc: '40 ジャンルのグルーヴが入ったビートシーケンサー。タイトルはアニソンの速い 8 ビート、メニューはローファイ、ゲーム中は邦ロック・アニソン・メタルのツーバス。',
        url: 'https://woodyclass.booth.pm/items/8975757',
      },
      {
        name: 'Woody Wasei Chords',
        role: 'コード進行',
        desc: '定番進行 113 項目から選べるコード進行シンセ。カノン進行・王道進行・テンション付き 2516・マイナー版 Axis などのボイシングをそのまま使用。',
        url: 'https://woodyclass.booth.pm/items/8913254',
      },
      {
        name: 'Woody Katachi Synth',
        role: '音色（無料）',
        desc: '波形の違いを見て聴いて学べるシンセ。チップチューン矩形リード、8bit ベース、ローファイ、プラック、Supersaw、Reese Bass などのプリセットで、和音・ベース・メロディを鳴らしています。',
        url: 'https://woodyclass.booth.pm/items/8914910',
      },
      {
        name: 'Woody Giongo EQ',
        role: '仕上げの EQ',
        desc: '言葉とオノマトペで操作する EQ。曲ごとに「明るいポップ」「ローファイ」「EDM」、ドラムに「ポップ」「メタル」のプリセットで仕上げています。',
        url: 'https://woodyclass.booth.pm/items/8919240',
      },
    ],
    links: [
      { label: 'YouTube（Woody Class）', sub: 'プラグインの使い方や作曲のコツを動画で紹介中', url: 'https://www.youtube.com/@WoodyClass', kind: 'youtube' },
      { label: 'BOOTH ショップ', sub: 'Woody Class のプラグイン一覧', url: 'https://woodyclass.booth.pm/', kind: 'booth' },
    ],
  },
};
