/**
 * 面談の進め方と「話に出たか」の目安（就労A型の個別支援計画書の章ごと）。純粋な関数。
 *
 * なぜあるか: 決定①（2026-10-03）で原案は面談を終えてから1回で作る。作ってから「この章が空だった」と分かっても
 *   面談はもう終わっている。面談の最中に、まだ聞いていない話題が見えるようにする。
 * 決まり: 判定はパソコンの中だけ（文字起こしを外へ送らない）。言葉が出たかを見るだけの目安で、
 *   「十分に聞けたか」は判定しない（画面でもそう書く）。
 * 何と繋がるか: 画面＝components/supportPlan/SupportPlanAWorkbench.tsx。章の名前の正本＝lib/supportPlan/format.ts。
 */

export interface InterviewTopic {
  id: string;
  /** 様式の章（例「2. 意向」） */
  chapter: string;
  /** 話題の名前 */
  label: string;
  /** 聞き方の例（サビ管が読み上げてよい言い回し） */
  ask: string;
  /** この言葉のどれかが文字起こしにあれば「出た」とみなす */
  words: readonly string[];
  /** true なら、画面の基本情報の欄に入れたことでも「出た」とみなす（1章は名簿の代わりの入力欄から書くため） */
  fromInput?: boolean;
}

/** 様式の章の順（1 → 8）。画面はこの順に並べる */
export const INTERVIEW_TOPICS: readonly InterviewTopic[] = [
  {
    id: "basic",
    chapter: "1. 基本情報",
    label: "基本情報（手帳・勤務の条件など）",
    ask: "手帳の等級や、今の勤務の日数・時間に変わりはありませんか。（分かっていれば左の基本情報の欄へ）",
    words: ["手帳", "等級", "勤務日数", "勤務時間", "時給", "賃金", "年齢", "通所"],
    fromInput: true,
  },
  {
    id: "work-wish",
    chapter: "2. 意向",
    label: "仕事についての希望",
    ask: "これからどんな仕事をしてみたいですか。続けたいこと・やってみたいことは。",
    words: [
      "仕事",
      "作業",
      "働き",
      "働く",
      "やりたい",
      "やってみたい",
      "続けたい",
      "一般就労",
      "就職",
    ],
  },
  {
    id: "life-wish",
    chapter: "2. 意向",
    label: "暮らしについての希望",
    ask: "家での過ごし方や、休みの日のこと。困っていること・こうなりたいことは。",
    words: [
      "生活",
      "暮らし",
      "家で",
      "休み",
      "一人暮らし",
      "グループホーム",
      "睡眠",
      "寝",
      "買い物",
      "料理",
    ],
  },
  {
    id: "family",
    chapter: "2. 意向",
    label: "家族の考え（同席したとき）",
    ask: "ご家族として、本人にどうなってほしいですか。",
    words: ["家族", "母", "父", "親", "兄", "姉", "弟", "妹", "夫", "妻"],
  },
  {
    id: "work-side",
    chapter: "3-1. 課題",
    label: "作業面（得意・苦手・手順）",
    ask: "今の作業で得意なこと、難しいと感じること、ミスが出やすい場面は。",
    words: ["得意", "苦手", "手順", "ミス", "集中", "速さ", "丁寧", "覚え", "指示"],
  },
  {
    id: "social-side",
    chapter: "3-2. 課題",
    label: "心理・社会参加面（人との関わり）",
    ask: "職場の人との関わりで、気になること・助かっていることは。",
    words: [
      "人間関係",
      "話しかけ",
      "相談",
      "緊張",
      "不安",
      "気持ち",
      "声をかけ",
      "コミュニケーション",
      "苦手な人",
    ],
  },
  {
    id: "health-side",
    chapter: "3-3. 課題",
    label: "健康面（体調・通院・服薬）",
    ask: "体調の波や通院・お薬のこと。疲れやすい時間帯は。",
    words: ["体調", "通院", "服薬", "薬", "病院", "疲れ", "睡眠", "頭痛", "主治医", "休憩"],
  },
  {
    id: "goal",
    chapter: "5・6. 目標",
    label: "目標（半年後・1〜3年後）",
    ask: "半年後にできるようになっていたいことは。1〜3年後はどうなっていたいですか。",
    words: ["目標", "半年", "1年", "一年", "将来", "できるように", "なりたい", "めざ", "目指"],
  },
  {
    id: "care",
    chapter: "7. 配慮",
    label: "配慮してほしいこと（勤務・作業・環境）",
    ask: "働きやすくするために、配慮してほしいこと（音・席・休憩・伝え方など）は。",
    words: ["配慮", "音", "席", "休憩", "伝え方", "メモ", "写真", "イヤーマフ", "静か"],
  },
  {
    id: "liaison",
    chapter: "8. 連携",
    label: "関係機関（相談支援・医療・家族）",
    ask: "相談支援専門員さんや主治医、ご家族との連携で、伝えておくことは。",
    words: [
      "相談支援",
      "相談員",
      "主治医",
      "病院",
      "医師",
      "ケースワーカー",
      "支援センター",
      "連絡",
    ],
  },
];

export interface TopicCoverage {
  topic: InterviewTopic;
  /** 言葉が出たか（目安） */
  heard: boolean;
}

/**
 * 文字起こしの中で、話題ごとに言葉が出たかを返す（空白・改行の違いは無視）。
 * basicEntered: 画面の基本情報の欄に入れたか（lib/supportPlan/standalone.ts の hasBasicInput）。
 *   true なら「1. 基本情報」を出たことにする（1章は面談の話より入力欄の値を優先して書くため）。
 */
export function topicCoverage(transcript: string, basicEntered = false): TopicCoverage[] {
  const text = transcript.replace(/\s+/g, "");
  return INTERVIEW_TOPICS.map((topic) => ({
    topic,
    heard: (topic.fromInput === true && basicEntered) || topic.words.some((w) => text.includes(w)),
  }));
}
