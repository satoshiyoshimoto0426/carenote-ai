import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findNameCandidates } from "@/lib/privacy/candidates";
import { COLLAPSE_CHARS } from "@/lib/privacy/previewNav";
import PreSendPreview, { type PreviewData } from "./PreSendPreview";

/**
 * 「送る前に見る」画面の**既定の見た目**を固定する。
 *
 * なぜ必要か（2026-09-17 の独立審査 critical）:
 *   長い欄を「先頭400字だけ」に畳んだ結果、**赤い言葉が1つも画面に出ない**状態になっていた。
 *   仕様書には「実装済」と書かれ、純粋ロジックのテストも緑で、CI も緑 ── それでも
 *   最後の関門から警告が消えていた。画面そのものを検査しない限り、この壊れ方は見つからない。
 *
 * 押したあとの動き（次へ・全文を開く）はブラウザでしか確かめられないが、
 * **最初に目に入るもの**はここで固定できる。壊れて一番怖いのはそこ。
 */

/** 実際の検出器を通して、本物に近い候補を作る。 */
function view(fields: Record<string, string>): string {
  const candidates: PreviewData["candidates"] = {};
  for (const [key, text] of Object.entries(fields)) {
    const found = findNameCandidates(text);
    if (found.length > 0) candidates[key] = found;
  }
  return renderToStaticMarkup(
    <PreSendPreview
      data={{ fields, findings: { names: 0, patterns: [] }, candidates }}
      loading={false}
      onBack={() => {}}
      onConfirm={() => {}}
      primaryClass="p"
      secondaryClass="s"
    />,
  );
}

const FILLER = "利用者の状態は落ち着いている。".repeat(250); // 3750字（畳む目安の3000字を超える地の文）

describe("送る前に見る画面の既定表示", () => {
  it("短い欄は本文がそのまま出て、赤い言葉に印が付く", () => {
    const html = view({ meetingNotes: "長女の佐藤さんより電話。" });
    expect(html).toContain("<mark");
    expect(html).toContain("佐藤");
    expect(html).not.toContain("全文を表示する");
  });

  it("長い欄でも、赤い言葉は1つ残らず印付きで出る（畳んでも警告は消さない）", () => {
    const text = `${FILLER}長女の佐藤さんより電話。${FILLER}担当の宮本さんが同席。`;
    expect(text.length).toBeGreaterThan(COLLAPSE_CHARS);
    const html = view({ meetingNotes: text });
    expect(html).toContain("全文を表示する");
    // 2か所とも印が付いている
    expect(html.match(/<mark/g)?.length).toBe(2);
    expect(html).toContain("佐藤");
    expect(html).toContain("宮本");
  });

  it("長い欄に赤い言葉が無ければ、先頭だけ出して畳む（読み飛ばしてよい地の文）", () => {
    const html = view({ meetingNotes: FILLER });
    expect(html).toContain("全文を表示する");
    expect(html).not.toContain("<mark");
  });

  it("赤い言葉の数は「出てくる回数」で数える（種類で数えると残りを見落とす）", () => {
    const html = view({ meetingNotes: "佐藤さんと佐藤さん、それに佐藤さん。" });
    expect(html).toContain("3</span>か所");
    expect(html.match(/<mark/g)?.length).toBe(3);
  });

  it("見出しの2行は緑の帯（presend-head）の中、赤い言葉があれば「前へ/次へ」は赤い枠の帯（presend-nav）に出る", () => {
    // 使い方（lib/manual/content.ts:135・429・433・477・1165）が「緑の帯」「その帯の中にある「置き換えたもの:」の行」
    // 「赤い枠」で画面を見分けさせている。色そのものは app/globals.test.ts が見る（R1 の検証 2026-09-24）。
    const html = view({ meetingNotes: "長女の佐藤さんより電話。" });
    const head = html.match(/<div class="presend-head">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(head).toContain("これがAIに送られる文章です。名前と番号は置き換え済みです。");
    expect(head).toContain("置き換えたものはありません");
    expect(html).toContain('<div class="presend-nav">');
  });

  it("赤い言葉が1つも無ければ、前へ/次への帯は出さない", () => {
    const html = view({ meetingNotes: "本人から電話。特変なし。" });
    expect(html).not.toContain("presend-nav");
    expect(html).not.toContain("<mark");
  });

  it("欄の見出しに文字数が出る（どれくらい長いかを先に知らせる）", () => {
    const html = view({ meetingNotes: "本人から電話。" });
    expect(html).toContain(">7字</span>");
  });

  it("「なぜ赤いか」が文字で読める（ふきだしだけだとタッチ端末に届かない）", () => {
    const html = view({ meetingNotes: `${FILLER}長女の佐藤さんより電話。` });
    expect(html).toContain("敬称の前");
  });
});
