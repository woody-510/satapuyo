// ぜんけしアタック「はいち あり」で最初に置いておくぷよ（tools/make_presets.mjs で作成）
// ぷよの種類（3〜5）ごとに複数あって、毎回ランダムに1つ選ぶ。
// A〜E が色（遊ぶたびに色の割り当てと左右の向きはランダム）、. は空き。下の段がフィールドのいちばん下。
// どれも4つ以上つながっている所はなく（置いたとたんに消えない）、全消しできることを確認ずみ。
// min は「ペアの色を自由に選べたとき」の最短手数（めやす）
window.ALLCLEAR_PRESETS = {
  3: [
    { min: 5, rows: ['.....A', '.....C', '.....C', '...ABA', '.BCBAC', '.AAACC'] },
    { min: 6, rows: ['A....A', 'BCABAB', 'CBAABC'] },
    { min: 5, rows: ['B.....', 'C.B...', 'ACABAA', 'BACBBC'] },
    { min: 6, rows: ['A....C', 'C..B.B', 'ABCCCA'] },
    { min: 5, rows: ['.B..B.', 'CA.ABA', 'ACBCCA'] },
    { min: 5, rows: ['.....A', '.....C', '.BA.CB', 'BAACBC'] },
    { min: 3, rows: ['.C.AC.', 'CB.CC.', 'BBABBC'] },
    { min: 3, rows: ['.BA...', '.BBA.B', 'ACCC.C'] },
    { min: 4, rows: ['....A.', '..BAC.', 'CBBCBC'] },
    { min: 4, rows: ['..B.A.', '.ACACB', 'AACACA'] },
    { min: 4, rows: ['A..C.C', 'C.CBBB', 'ABCAAA'] },
    { min: 4, rows: ['..B.A.', 'AAA.BB', 'BCBCAA'] },
  ],
  4: [
    { min: 5, rows: ['CB...D', 'DAA.DB', 'CBBAAD'] },
    { min: 8, rows: ['.....B', '.BACAC', 'BABDCD', 'DABDBC'] },
    { min: 5, rows: ['.C....', '.A....', '.B....', '.C.A..', '.CAAD.', 'AACBAD'] },
    { min: 5, rows: ['....A.', '....B.', '....B.', '..C.B.', 'C.BBAD', 'AADABB'] },
    { min: 3, rows: ['B.AB..', 'ACCCDA', 'BDADAA'] },
    { min: 5, rows: ['.DB.C.', 'BACACC', 'BAADAA'] },
    { min: 5, rows: ['B.DCDB', 'CDACDB', 'BBBADA'] },
    { min: 6, rows: ['CA....', 'ADD..A', 'DACCBB'] },
    { min: 7, rows: ['..D...', 'AABADA', 'DCBCCB'] },
    { min: 8, rows: ['B.....', 'DAD.C.', 'CBC.BC', 'BDBACC'] },
    { min: 6, rows: ['.C....', 'ADA.B.', 'AABDAC', 'BBCCCA'] },
    { min: 5, rows: ['.B....', '.A.D..', '.BADAC', 'ADDCCB'] },
  ],
  5: [
    { min: 8, rows: ['.C....', '.E....', '.A....', 'DBEBD.', 'AAABDB', 'BCCDBA'] },
    { min: 10, rows: ['CE.C..', 'DB.AEB', 'AECBDE'] },
    { min: 11, rows: ['.....D', '....AB', 'C.DEDA', 'D.BAAC', 'EAADEE'] },
    { min: 9, rows: ['....E.', 'C.ABDD', 'ABEABE', 'CCCDDC'] },
    { min: 7, rows: ['C.....', 'E....D', 'E.CDAA', 'CBDBCB'] },
    { min: 12, rows: ['D.....', 'A...EC', 'C..CBC', 'CDEADE', 'EBCCEC'] },
    { min: 8, rows: ['.....A', '....CE', '...ACC', 'ADCCED', 'BDAEBD'] },
    { min: 8, rows: ['....B.', '....D.', '.C.BBA', '.BDBCC', 'CECAED'] },
    { min: 6, rows: ['B.....', 'C.....', 'ACAEC.', 'BDDAE.', 'CCBDEE'] },
    { min: 10, rows: ['....D.', 'C...E.', 'A.DAED', 'BDCDEA', 'BBCECB'] },
    { min: 8, rows: ['....A.', 'C...B.', 'D...E.', 'BDE.BB', 'ADABCE'] },
    { min: 8, rows: ['.E....', '.A..EE', 'AC.DDB', 'DEDCBE'] },
  ],
};
