import { describe, expect, it } from "vitest";
import type { NameCandidate } from "./candidates";
import {
  buildHighlights,
  COLLAPSE_CHARS,
  CONTEXT_CHARS,
  candidateContexts,
  EXCERPT_CHARS,
  excerpt,
  fieldOfCandidate,
  type PreviewHighlights,
  redWordReasons,
} from "./previewNav";

/**
 * 最後の関門（人が赤い言葉を見る）が、長い文章でも形だけにならないことを固定する。
 * 1〜2万字の会議の文字起こしを1つの塊で出すと誰も読まない ── 仕組みは残り安全だけが消える。
 */

const cand = (word: string): NameCandidate => ({ word, reason: "敬称の前" });

const ORDER = ["clientInfo", "meetingNotes", "supportNotes"];

describe("赤い言葉の組み立て: buildHighlights", () => {
  it("候補が無ければ本文をそのまま1つの塊で返す", () => {
    const h = buildHighlights(ORDER, { meetingNotes: "本人から電話。" }, {});
    expect(h.total).toBe(0);
    expect(h.byField.meetingNotes.parts).toEqual([
      { text: "本人から電話。", start: 0, candidateNo: null },
    ]);
  });

  it("同じ言葉が3回出れば、3つの番号が付く（種類で数えると残り2か所を見落とす）", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "佐々木さんと佐々木さん、そして佐々木さん。" },
      { meetingNotes: [cand("佐々木")] },
    );
    expect(h.total).toBe(3);
    expect(h.byField.meetingNotes.candidateNumbers).toEqual([1, 2, 3]);
  });

  it("番号は欄をまたいで通しで振る（画面全体で1から）", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "宮本さん。", supportNotes: "田中さんと宮本さん。" },
      { meetingNotes: [cand("宮本")], supportNotes: [cand("田中"), cand("宮本")] },
    );
    expect(h.total).toBe(3);
    expect(h.byField.meetingNotes.candidateNumbers).toEqual([1]);
    expect(h.byField.supportNotes.candidateNumbers).toEqual([2, 3]);
  });

  it("長い言葉から先に区切る（「田中」が「田中商店」を食い破らない）", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "田中商店に連絡。" },
      { meetingNotes: [cand("田中"), cand("田中商店")] },
    );
    const marked = h.byField.meetingNotes.parts.filter((p) => p.candidateNo !== null);
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe("田中商店");
  });

  it("切り分けても本文は1文字も失われない", () => {
    const text = "宮本さんと佐々木さんが来所。次回は9月20日。";
    const h = buildHighlights(
      ORDER,
      { meetingNotes: text },
      { meetingNotes: [cand("宮本"), cand("佐々木")] },
    );
    expect(h.byField.meetingNotes.parts.map((p) => p.text).join("")).toBe(text);
  });

  it("空欄と空白だけの欄は出さない", () => {
    const h = buildHighlights(ORDER, { meetingNotes: "", supportNotes: "   \n " }, {});
    expect(Object.keys(h.byField)).toEqual([]);
  });

  it("欄の並びは fieldOrder に従う（画面と番号の順番を一致させる）", () => {
    const h = buildHighlights(
      ORDER,
      { supportNotes: "田中さん。", clientInfo: "宮本さん。" },
      { supportNotes: [cand("田中")], clientInfo: [cand("宮本")] },
    );
    expect(Object.keys(h.byField)).toEqual(["clientInfo", "supportNotes"]);
    expect(h.byField.clientInfo.candidateNumbers).toEqual([1]);
    expect(h.byField.supportNotes.candidateNumbers).toEqual([2]);
  });

  it("長い欄には畳む印と文字数が付く", () => {
    const long = "あ".repeat(COLLAPSE_CHARS + 1);
    const h = buildHighlights(ORDER, { meetingNotes: long, supportNotes: "短いメモ" }, {});
    expect(h.byField.meetingNotes.long).toBe(true);
    expect(h.byField.meetingNotes.length).toBe(COLLAPSE_CHARS + 1);
    expect(h.byField.supportNotes.long).toBe(false);
  });

  it("正規表現に使われる記号が候補でも壊れない", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "A+B（株）に連絡。" },
      { meetingNotes: [cand("A+B（株）")] },
    );
    expect(h.total).toBe(1);
    expect(h.byField.meetingNotes.parts.some((p) => p.text === "A+B（株）")).toBe(true);
  });

  it("開始位置は本文の並びどおりで、重ならない（React の key に使うため）", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "宮本さんと佐々木さんが来所。" },
      { meetingNotes: [cand("宮本"), cand("佐々木")] },
    );
    const parts = h.byField.meetingNotes.parts;
    const starts = parts.map((p) => p.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].start).toBe(parts[i - 1].start + parts[i - 1].text.length);
    }
  });
});

describe("畳む長さの決め方", () => {
  it("値そのものを固定する（自分の定数で自分を測ると、書き換えても落ちない）", () => {
    expect(COLLAPSE_CHARS).toBe(3000);
    expect(EXCERPT_CHARS).toBe(400);
    expect(CONTEXT_CHARS).toBe(40);
  });

  it("手で書いたメモは畳まれず、録音の文字起こしは必ず畳まれる長さになっている", () => {
    const handwritten = "長女より電話。本人の様子を確認した。".repeat(60); // 1000字ほど（手書きの上限想定）
    const transcript = "本人の希望を確認した。".repeat(800); // 8800字ほど（録音の文字起こし）
    expect(handwritten.length).toBeLessThan(COLLAPSE_CHARS);
    expect(transcript.length).toBeGreaterThan(COLLAPSE_CHARS);
  });
});

describe("畳んだときの先頭: excerpt", () => {
  it("短ければそのまま、長ければ切って … を付ける", () => {
    expect(excerpt("短い", 10)).toBe("短い");
    expect(excerpt("あ".repeat(20), 10)).toBe(`${"あ".repeat(10)}…`);
  });
});

describe("番号から欄を引く: fieldOfCandidate", () => {
  const h: PreviewHighlights = buildHighlights(
    ORDER,
    { meetingNotes: "宮本さん。", supportNotes: "田中さん。" },
    { meetingNotes: [cand("宮本")], supportNotes: [cand("田中")] },
  );

  it("その番号が入っている欄を返す（畳んだ欄を開くために使う）", () => {
    expect(fieldOfCandidate(h, 1)).toBe("meetingNotes");
    expect(fieldOfCandidate(h, 2)).toBe("supportNotes");
  });

  it("無い番号なら null", () => {
    expect(fieldOfCandidate(h, 99)).toBeNull();
  });
});

/**
 * 2026-09-17 の独立審査 critical:
 *   長い欄を「先頭400字だけ」に畳んだ結果、赤い言葉が1つも画面に出ない状態になっていた。
 *   畳んでいても赤い言葉は全部出す、を固定する。
 */
describe("赤い言葉とその前後: candidateContexts", () => {
  it("畳んでも赤い言葉は1つ残らず取り出せる（本文のどこにあっても）", () => {
    const filler = "あ".repeat(2000);
    const text = `${filler}宮本さんより連絡。${filler}佐々木さんが同席。`;
    const h = buildHighlights(
      ORDER,
      { meetingNotes: text },
      {
        meetingNotes: [cand("宮本"), cand("佐々木")],
      },
    );
    const contexts = candidateContexts(h.byField.meetingNotes);
    expect(contexts.map((c) => c.word)).toEqual(["宮本", "佐々木"]);
    expect(contexts.map((c) => c.candidateNo)).toEqual([1, 2]);
  });

  it("前後の文脈が付き、切れているところには … が入る", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: `${"あ".repeat(100)}宮本さんより連絡。` },
      {
        meetingNotes: [cand("宮本")],
      },
    );
    const [first] = candidateContexts(h.byField.meetingNotes, 10);
    expect(first.before.startsWith("…")).toBe(true);
    expect(first.word).toBe("宮本");
    expect(first.after).toContain("さんより");
  });

  it("文脈は本文の実際の並びから取る（前後がすり替わらない）", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "朝に宮本さん、夕に佐々木さん。" },
      {
        meetingNotes: [cand("宮本"), cand("佐々木")],
      },
    );
    const [a, b] = candidateContexts(h.byField.meetingNotes, 3);
    expect(a.before).toContain("朝に");
    expect(b.before).toContain("夕に");
  });

  it("赤い言葉が無ければ空（出すものが無い）", () => {
    const h = buildHighlights(ORDER, { meetingNotes: "本人から電話。" }, {});
    expect(candidateContexts(h.byField.meetingNotes)).toEqual([]);
  });
});

/**
 * 2026-09-23 の検収:
 *   開いた欄（3000字以下の欄と、全文を表示した欄）では、理由が <mark title> のふきだしにしか無く、
 *   タッチ端末の職員は「なぜ赤いか」を読めなかった。欄の下に文字で並べる一覧の作り方を固定する。
 */
describe("開いた欄の「なぜ赤いか」: redWordReasons", () => {
  it("言葉ごとに1行にまとめ、本文に出てくる順に理由と並べる（候補の並び順には従わない）", () => {
    const h = buildHighlights(
      ORDER,
      { meetingNotes: "佐々木さんとひまわり病院へ。帰りに佐々木さん。" },
      {
        meetingNotes: [
          { word: "ひまわり病院", reason: "施設名の可能性" },
          { word: "佐々木", reason: "敬称の前" },
        ],
      },
    );
    // 前提: 佐々木は2回出るので、赤い印（番号）は3つ
    expect(h.total).toBe(3);
    expect(redWordReasons(h.byField.meetingNotes)).toEqual([
      { word: "佐々木", reason: "敬称の前" },
      { word: "ひまわり病院", reason: "施設名の可能性" },
    ]);
  });

  it("赤い言葉が無ければ空（出すものが無い）", () => {
    const h = buildHighlights(ORDER, { meetingNotes: "本人から電話。" }, {});
    expect(redWordReasons(h.byField.meetingNotes)).toEqual([]);
  });
});
