/**
 * 章ごとの撮影手順。「何をして、どの場面を撮るか」だけをデータで書く。
 *
 * なぜデータにするか:
 *   章ごとに専用スクリプトを書くと、同じログイン処理や待ち時間の調整が7か所に散る。
 *   台本（docs/MANUAL-VIDEO-SPEC.md）は場面番号で管理されているので、手順も
 *   「場面番号 → やること」の並びで持つ方が、撮り直しの範囲を絞りやすい。
 *
 * 手順に使える命令（tools/shoot-run.mjs が解釈する）:
 *   { go: "/clients" }                  … その画面を開く
 *   { click: "新規" }                   … その文字のボタン・リンクを押す
 *   { fill: "#c-name", value: "山田 花子" } … 入力する
 *   { wait: 1200 }                      … ミリ秒待つ
 *   { shoot: 5 }                        … 場面5として撮る
 *   { openClient: "A様" }               … 一覧からその利用者の画面を開く
 *   { skip: 13, why: "理由" }           … 撮れない場面として記録に残す
 *   { optional: [...] }                 … 中で失敗しても止めずに次へ進む
 *
 * ⚠ 収録用アカウント専用。実在の利用者が入った環境では実行しない。
 */

/** 面談メモの例文。実在しない人物の、ありふれた相談内容にする。 */
const MEMO =
  "長女より電話。本人の入浴が週1回に減っている。夜間にトイレへ起きる回数が増え、" +
  "ふらついて転びかけたことがあるとのこと。デイサービスの回数を増やせないか相談したいと希望。";

/** 名簿に無い名前を混ぜたメモ。確認画面で赤く示されることを見せるために使う。 */
const LEAK_MEMO =
  "担当の佐々木さんと、他事業所の宮本ケアマネに相談した。" +
  "本人の入浴が週1回に減っており、夜間の転倒が心配との連絡があった。";

const PERSONA = {
  clientInfo: "85歳 女性 要介護2 独居。長女が週1回訪問。",
  personality: "人づきあいが好きで、近所の方とよく話す。頼まれごとを断れない。",
  lifeHistory: "長く農業に従事。夫と死別後は一人暮らし。",
  medical: "高血圧、変形性膝関節症。月1回かかりつけ医を受診。",
  physicalCognitive: "屋内は伝い歩き。物忘れは年齢相応。",
  familyHousing: "長女が車で30分の距離に在住。木造2階建て、寝室は1階。",
  currentServices: "通所介護を週1回、訪問介護を週2回。",
  intentions: "できるだけ今の家で暮らし続けたい。",
};

export const PLANS = {
  ch1: [
    { go: "/sign-in" },
    { wait: 1500 },
    { shoot: 1 },
    { login: true },
    { go: "/dashboard" },
    { shoot: 2 },
    { go: "/clients" },
    { shoot: 3 },
    {
      optional: [
        { click: "新規" },
        { wait: 1200 },
        { fill: "#c-name", value: "山田 花子" },
        { wait: 500 },
      ],
    },
    { shoot: 4 },
    { openClient: "A様" },
    { shoot: 5 },
    { go: "/create" },
    { wait: 1500 },
    { shoot: 6 },
    { optional: [{ fill: "textarea", value: MEMO }, { wait: 800 }] },
    { shoot: 7 },
    // ここから実際に AI を動かす（料金がかかる）
    { click: "の下書きを作る" },
    { wait: 12000 },
    { shoot: 8 },
    { shoot: 9 },
    { click: "この内容でAIに送る" },
    { wait: 3000 },
    { shoot: 10 },
    { waitFor: "実名で表示", timeout: 180000 },
    { wait: 2000 },
    { shoot: 11 },
    {
      optional: [
        { click: "カイポケの欄に合わせる" },
        { waitFor: "1枚目", timeout: 180000 },
        { wait: 1500 },
      ],
    },
    { shoot: 12 },
    { go: "/rescue" },
    { wait: 1500 },
    { shoot: 13 },
  ],

  ch2: [
    { go: "/sign-in" },
    { wait: 1500 },
    { shoot: 1 },
    { login: true },
    { go: "/dashboard" },
    { shoot: 2 },
    { shoot: 3 },
    { go: "/clients" },
    { shoot: 4 },
    { click: "新規" },
    { wait: 1200 },
    { shoot: 5 },
    { fill: "#c-name", value: "山田 花子" },
    { wait: 600 },
    { shoot: 6 },
    { fill: "#c-age", value: "85歳" },
    { fill: "#c-gender", value: "女性" },
    { fill: "#c-care-level", value: "要介護2" },
    { fill: "#c-household", value: "独居" },
    { wait: 600 },
    { shoot: 7 },
    { go: "/clients" },
    { shoot: 8 },
    { openClient: "A様" },
    { shoot: 9 },
    { shoot: 10 },
    { fill: 'input[list="relation-hints"]', value: "長女" },
    { fill: 'input[placeholder^="氏名"]', value: "山田 桜" },
    { wait: 800 },
    { shoot: 11 },
    { optional: [{ click: "登録" }, { wait: 4000 }] },
    { shoot: 12 },
    { optional: [{ click: "削除" }, { wait: 3000 }] },
    { shoot: 13 },
  ],

  ch3: [
    { login: true },
    { go: "/create" },
    { wait: 1800 },
    { shoot: 1 },
    { shoot: 2 },
    { optional: [{ click: "アセスメント" }, { wait: 900 }] },
    { shoot: 3 },
    { fill: "textarea", value: MEMO },
    { wait: 900 },
    { shoot: 4 },
    { shoot: 5 },
    // ここから実際に AI を動かす（料金がかかる・1回30〜60秒）
    { click: "の下書きを作る" },
    { wait: 12000 },
    { shoot: 6 },
    { shoot: 7 },
    { shoot: 8 },
    { shoot: 9 },
    { click: "この内容でAIに送る" },
    { wait: 3000 },
    { shoot: 10 },
    { waitFor: "実名で表示", timeout: 180000 },
    { wait: 2000 },
    { shoot: 11 },
    { optional: [{ click: "実名で表示" }, { wait: 1500 }] },
    { shoot: 12 },
    { optional: [{ click: "記号で表示" }, { wait: 1000 }] },
    {
      optional: [
        { click: "カイポケの欄に合わせる" },
        { waitFor: "1枚目", timeout: 180000 },
        { wait: 1500 },
      ],
    },
    { shoot: 13 },
    { shoot: 14 },
    { shoot: 15 },
  ],

  ch4: [
    { login: true },
    { skip: 1, why: "録音アプリ SecondBrain の画面。CareNote の外にある他社のアプリ" },
    { go: "/create" },
    { wait: 1800 },
    { shoot: 2 },
    { click: "支援経過（第5表）" },
    { wait: 1200 },
    { shoot: 3 },
    { fill: "textarea", value: MEMO },
    { wait: 800 },
    { shoot: 4 },
    { shoot: 5 },
    { shoot: 6 },
    // ここから実際に音声を渡して文字起こしを動かす（ダミー録音は MiniMax で作ったもの）
    { setFile: 'input[type="file"]', pathEnv: "SHOOT_DUMMY_CALL" },
    { wait: 2500 },
    { shoot: 7 },
    { waitFor: "録音の文字起こし", timeout: 300000 },
    { wait: 1500 },
    { shoot: 8 },
    { shoot: 9 },
    { click: "の下書きを作る" },
    { wait: 14000 },
    { shoot: 10 },
  ],

  ch5: [
    { skip: 1, why: "カイポケの画面。実在する他社システムで、撮影用の環境が要る" },
    { skip: 2, why: "同上" },
    { skip: 3, why: "同上" },
    { skip: 4, why: "同上" },
    { skip: 5, why: "同上" },
    { skip: 6, why: "同上" },
    { skip: 7, why: "同上" },
    { skip: 8, why: "同上" },
    { skip: 9, why: "同上" },
    { skip: 10, why: "同上" },
    { skip: 11, why: "同上" },
    { skip: 12, why: "同上" },
    { skip: 13, why: "同上" },
  ],

  ch6: [
    { login: true },
    { go: "/rescue" },
    { wait: 1800 },
    { shoot: 1 },
    { shoot: 2 },
    { optional: [{ fillAll: PERSONA }, { wait: 1000 }] },
    { shoot: 3 },
    { shoot: 4 },
    { skip: 5, why: "資料（PDF）の添付。OSのファイル選択ダイアログが開くため自動では撮れない" },
    { skip: 6, why: "資料の読み取り結果。実際のPDFが要る" },
    // ここから実際に AI を動かす（5帳票ぶんなので2〜5分かかる・料金がかかる）
    { clickIncludes: "書類一式を生成する" },
    { wait: 6000 },
    { shoot: 7 },
    { waitFor: "アセスメント", timeout: 420000 },
    { wait: 3000 },
    { shoot: 8 },
    { shoot: 9 },
    { optional: [{ selectClient: "A様" }, { wait: 1200 }] },
    { optional: [{ clickIncludes: "5帳票を保存" }, { wait: 8000 }] },
    { shoot: 10 },
    { go: "/clients" },
    { optional: [{ openClient: "A様" }] },
    { shoot: 11 },
    { shoot: 12 },
    { shoot: 13 },
  ],

  ch7: [
    { login: true },
    { go: "/create" },
    { wait: 1500 },
    { shoot: 1 },
    // 名簿に無い名前を書くと、確認画面で赤く示される（そこを撮る）
    { fill: "textarea", value: LEAK_MEMO },
    { wait: 900 },
    { click: "の下書きを作る" },
    { wait: 12000 },
    { shoot: 2 },
    { shoot: 3 },
    { skip: 4, why: "名簿が読めないエラー。障害を起こす必要がある" },
    { skip: 5, why: "AIの利用枠不足のエラー。障害を起こす必要がある" },
    { go: "/clients" },
    { shoot: 6 },
    { openClient: "A様" },
    { shoot: 7 },
    { go: "/guide" },
    { wait: 1500 },
    { shoot: 8 },
    { shoot: 9 },
    { go: "/guide#ch7" },
    { wait: 1200 },
    { shoot: 10 },
    { go: "/dashboard" },
    { shoot: 11 },
    { skip: 12, why: "拡張機能の設定画面。ブラウザの拡張管理画面" },
    { skip: 13, why: "画面に何も出ないとき。障害を起こす必要がある" },
    { go: "/guide" },
    { wait: 1200 },
    { shoot: 14 },
  ],
};

export { LEAK_MEMO, MEMO, PERSONA };
