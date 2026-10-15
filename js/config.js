// =====================================================================
//  さたぷよ 設定ファイル
//  画像・音・タイトルなどはここを書き換えれば差し替えられる。
//  画像のサイズはバラバラでもOK（ゲーム側で中央を正方形に切り抜いて丸く表示する）。
// =====================================================================
window.GAME_CONFIG = {
  title: 'さたぷよ',

  // 落ちてくるぷよの顔。好きなだけ追加・削除してOK（最低3つ）。
  // role と comment はエンディングの CAST に出る（キャラ設定と、本人のひとこと）
  faces: [
    { src: 'assets/puyo/face01.jpg', name: 'まぶしさたろう', role: '遠くを見る男', comment: '100万点？　まぶしすぎて引くわ。その時間で何ができたか、遠くを見て考えてみな。' },
    { src: 'assets/puyo/face02.jpg', name: 'ピースさたろう', role: '平和主義者', comment: '平和主義のおれをここまで消しまくるとか、お前のほうがよっぽど戦争してんじゃん。' },
    { src: 'assets/puyo/face03.jpg', name: 'しんかんせんさたろう', role: '旅好き', comment: '新幹線より速く消すのやめろ。こっちは景色見てたんだけど。' },
    { src: 'assets/puyo/face04.jpg', name: 'ぐるぐるさたろう', role: '照れ屋（自称）', comment: 'このぐるぐる、照れじゃねーから。お前が回しすぎて目が回ってんの。責任とれよ。' },
    { src: 'assets/puyo/face05.jpg', name: 'ゆびさたろう', role: '反抗期', comment: 'この指の意味？　言わなくてもわかるだろ。100万点おめでとう、ヒマ人。' },
    { src: 'assets/puyo/face06.jpg', name: 'めがねさたろう', role: '画質担当', comment: 'おれだけ画質ガビガビなの、スマホのせいだと思ってる？　扱いのせいだよ。' },
    { src: 'assets/puyo/face07.jpg', name: 'ボサボサさたろう', role: '寝起き', comment: '寝起きで出演させられたおれより、お前の生活のほうがボサボサだろ。早く寝ろ。' },
    { src: 'assets/puyo/face08.jpg', name: 'サングラスさたろう', role: '夜のドライバー', comment: '夜にグラサンなのは、お前の100万点がまぶしすぎるから。……うそ。目ぇ合わせたくないだけ。' },
    { src: 'assets/puyo/face09.jpg', name: 'ゆびさしさたろう', role: '指名する人', comment: 'そう、お前。消すのうますぎ。ほめてねーよ。' },
    { src: 'assets/puyo/face10.jpg', name: 'そつアルさたろう', role: '優等生（過去形）', comment: '卒アルのこの笑顔、まさか将来ぷよにされるとは思ってねーからな。返せ、おれの青春。' },
    { src: 'assets/puyo/face11.jpg', name: 'にっこりさたろう', role: 'ポジティブ', comment: '笑ってるように見える？　笑うしかねーんだよ、この状況。' },
    { src: 'assets/puyo/face12.jpg', name: 'べろさたろう', role: '負けず嫌い', comment: 'べー。悔しくねーし。……次は絶対、お前のほうを消してやるからな。' },
    { src: 'assets/puyo/face13.jpg', name: 'むにさたろう', role: '無口', comment: '……（言いたいことは山ほどある。でも口がこの形だから、察しろ）' },
    { src: 'assets/puyo/face14.jpg', name: 'ブレさたろう', role: 'スピードスター', comment: '写真ブレてんのは、おれが速すぎるから。……お前に消されるのは、もっと速かったけどな。' },
    { src: 'assets/puyo/face15.jpg', name: 'キメさたろう', role: 'ナルシスト', comment: 'キメ顔のまま消されるのが一番キツいんだよ。でもキメ顔はやめねーから。' },
    { src: 'assets/puyo/face16.jpg', name: 'ねそべりさたろう', role: '省エネ', comment: '100万点おつかれ。おれは寝てただけ。……で、どっちが勝ち組？' },
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
    bgmEnding: { src: 'assets/sound/bgm_ending.mp3', loop: false },                 // エンディング：J-POP（1回だけ）
    move: null,
    rotate: null,
    land: null,
    pop: null,      // 連鎖のたびに少しずつ音程が上がる（内蔵音のみ）
    allClear: null,
    gameOver: null,
    select: null,
    decide: null,
  },

  // ゲーム中のボイス（null にすると鳴らない）。元のファイルは voice フォルダ
  voices: {
    start: 'assets/voice/start.mp3', // ゲーム開始（my f）
    chain: 'assets/voice/chain.mp3', // 連鎖が終わったとき（again）
    cutin: 'assets/voice/cutin.mp3', // ゲーム中にたまにカットイン（with y）
    end: 'assets/voice/end.mp3', //     ゲーム終了（are you）
  },
  voiceChainMin: 2, // 何れんさ以上で連鎖のボイスを鳴らすか
  voiceCutinSeconds: [25, 50], // カットインの間隔（この秒数のあいだでランダム）

  // タイムアタックの制限時間（秒）
  timeAttackSeconds: 120,

  // エンディング：とことんモードで minScore 点以上とってゲームオーバーになると流れる（一度見たらメニューから見返せる）
  // CAST には上の faces の name・role・comment が順に出る
  ending: {
    minScore: 1000000,
    seconds: 215, // 曲を読めなかったときの長さ（秒）
    staff: [
      { role: '企画・制作', names: ['Woody'] },
      { role: '主演', names: ['さたろう'] },
      { role: 'ボイス', names: ['さたろう（本人）'] },
      { role: '音楽', names: ['Woody Class'] },
      { role: 'ドラム', names: ['Woody Tsuzumi Beats'] },
      { role: 'コード進行', names: ['Woody Wasei Chords'] },
      { role: '音色', names: ['Woody Katachi Synth'] },
      { role: '仕上げの EQ', names: ['Woody Giongo EQ'] },
      { role: 'エンディングテーマ', names: ['テーマ7（J-POP）'] },
    ],
    thanks: [{ role: 'Special Thanks', names: ['遊んでくれたあなた'] }],
    // さいごに主演からひとこと（face は faces の何番目か。1 から）
    lastWords: { face: 11, text: '100万点おめでとう。\n……そんなに、おれの顔消すの楽しかった？\nまた来いよ。', by: 'さたろう' },
    finale: 'THANK YOU FOR PLAYING',
    endVoice: 'chain', // 最後に鳴らすボイス（voices の名前。again）
    endVoiceAt: -3.2, // ボイスを鳴らす時刻（曲のファイルの終わりから何秒ずらすか。曲の最後の音が消えた直後）
    tail: 1.5, // 曲のファイルが終わってから暗くなるまでの秒数
    banner: '100万点おめでとう！', // 背景の飛行機が引っぱる旗
  },

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
