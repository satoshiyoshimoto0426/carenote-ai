import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * 実 Claude API を呼ぶ統合テスト（課金あり・手動実行専用）。就労A型の個別支援計画書（原案）。
 * 実行: `npm run test:integration -- scripts/supportPlanAGeneration.itest.ts`
 * 出力: scripts/.output/supportPlanA.json（原案）と、一時フォルダの carenote-supportPlanA.html（様式どおりの印刷用。
 *   Chrome で開くと Paged.js がページを組む。PDF にするときは Chrome の印刷で「PDF に保存」）。
 *   HTML を scripts/.output に置かないのは、Biome が HTML の中の印刷用の CSS（string() など）を知らない関数として
 *   落とし、試験のあとで `npx biome check .` が赤くなるため（2026-10-03）。
 */
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

// 架空の面談の文字起こし（実在の個人情報は含まない。名前は記号のまま・話し言葉のまま）
const SAMPLE_INTERVIEW = `今日は次の半年の計画を一緒に考える面談です。K様、録音して文字にしますね。音声は残しません。いいですか。「はい、大丈夫です。」
最近お仕事はどうですか。「ラベル貼りは得意です。きれいに並ぶとうれしいです。」袋詰めのほうはどうですか。「袋詰めも慣れました。」ほかにやってみたい作業はありますか。「データ入力をもう少しやってみたいです。いつかは事務の仕事もしてみたい。」
作業をしていて困ることはありますか。「途中で声をかけられると、どこまでやったか分からなくなります。」なるほど。予定が急に変わったときはどうですか。「ちょっと不安になります。前の日に知っていると安心です。」入力は今どのくらい続けていますか。「1時間を超えると集中が切れてきます。50分くらいならいけます。」
お昼休みはどう過ごしていますか。「休憩室はにぎやかなので、一人で過ごしています。静かなほうが落ち着きます。」休みの日は。「イラストを描いています。いつか展示してみたいです。」困ったときに相談しにくいことはありますか。「自分から言うのは、ちょっと苦手です。書いたら伝えられるかも。」
生活のほうはどうですか。「一人暮らしに慣れてきました。料理は週末にまとめて作ります。」最近は眠れていますか。「朝起きるのがつらい日があって、遅刻してしまうことがあります。月に2、3回くらい。」病院は。「月に1回、心療内科に行っています。薬は寝る前に飲んでいます。」
1年後、どんなふうになっていたいですか。「入力を2時間くらい続けられるようになって、事務の補助の仕事に挑戦してみたいです。」半年の間に、まず何から取り組みましょうか。「1回の入力を60分まで延ばしたいです。あと、困ったことを言えるようにしたい。遅刻も減らしたいです。」
どんな手伝いがあると働きやすいですか。「声をかけるときはメモでくれると助かります。作業が変わるときは前の日にホワイトボードに書いてほしいです。」
相談支援専門員の方とは連絡を取っていますか。「はい、3か月に1回くらい会っています。」主治医の先生に、ここでの様子を伝えてもいいですか。「はい、いいです。」ご家族は今日は来られていませんね。「母は遠くに住んでいるので。」
勤務は今、週4回、月火木金の10時から3時ですね。「はい。」`;

describe("generateSupportPlanA 統合テスト（実API）", () => {
  it("面談の文字起こしから、様式の全章を持つ原案を作り、様式どおりの HTML にできる", async () => {
    const { generateSupportPlanA } = await import("@/lib/generation/supportPlanA");
    const { buildSupportPlanAView, TBD } = await import("@/lib/supportPlan/format");
    const { SAMPLE_META } = await import("@/lib/supportPlan/testFixtures");
    const { default: SupportPlanDocument } = await import(
      "@/components/supportPlan/SupportPlanDocument"
    );
    const { SUPPORT_PLAN_PRINT_CSS } = await import("@/components/supportPlan/printCss");

    const started = Date.now();
    const draft = await generateSupportPlanA({
      clientInfo:
        "利用者コード K-014／28歳・女性／発達障害（自閉スペクトラム症）／精神障害者保健福祉手帳 3級／雇用契約（A型）／2024年4月入所",
      interviewNotes: SAMPLE_INTERVIEW,
    });
    const seconds = Math.round((Date.now() - started) / 1000);

    const roster = { hourlyWage: "1,250円", monthlyWage: "約86,000円" };
    const view = buildSupportPlanAView(draft, SAMPLE_META, roster);
    const body = renderToStaticMarkup(createElement(SupportPlanDocument, { view }));
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>個別支援計画書（K-014）</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap">
<style>${SUPPORT_PLAN_PRINT_CSS}</style>
<script>window.PagedConfig = { auto: true, after: () => { document.documentElement.dataset.paged = "done"; } };</script>
<script src="https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.min.js"></script>
</head><body>${body}</body></html>`;

    const dir = resolve(process.cwd(), "scripts/.output");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "supportPlanA.json"),
      JSON.stringify({ seconds, draft }, null, 2),
      "utf-8",
    );
    const htmlPath = resolve(tmpdir(), "carenote-supportPlanA.html");
    writeFileSync(htmlPath, html, "utf-8");
    console.log(`saved: scripts/.output/supportPlanA.json と ${htmlPath}（${seconds}秒）`);

    // 話に出たことは埋まる
    expect(draft.intentions.work).toContain("「");
    expect(draft.needs.work.length).toBeGreaterThanOrEqual(1);
    expect(draft.needs.health.length).toBeGreaterThanOrEqual(1);
    expect(draft.shortTerms.length).toBeGreaterThanOrEqual(1);
    expect(draft.shortTerms.length).toBeLessThanOrEqual(3);
    expect(draft.longTerm.goal).toBeTruthy();
    expect(draft.liaison.counselor.status).toBe("あり");
    // 計画見直しの基準は計画の決めごとなので空にしない（2026-10-03 試行で空になったため規則に足した）
    expect(draft.reviewCriteria.trim()).toBeTruthy();
    // 家族は同席していない → 家族の意向は書かない（様式では要確認）
    expect(draft.intentions.family.trim()).toBe("");
    // 作り話をしない: 面談に無い人名や「工賃」を書かない
    const all = JSON.stringify(draft);
    expect(all).not.toContain("工賃");
    // 様式は全10章を持つ
    expect(html).toContain("10. 同意・署名");
    expect(view.basic.rows.flat()).toContain(TBD);
  });
});
