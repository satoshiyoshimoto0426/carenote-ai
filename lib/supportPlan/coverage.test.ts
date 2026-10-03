import { describe, expect, it } from "vitest";
import { INTERVIEW_TOPICS, topicCoverage } from "./coverage";

/** 面談の「話に出たか」の目安。端末の中だけで言葉を探す純粋な関数。 */

describe("話に出たかの目安", () => {
  it("空の文字起こしでは、どの話題も出ていない", () => {
    expect(topicCoverage("").every((c) => !c.heard)).toBe(true);
  });

  it("言葉が出た話題だけに印が付く（話題の順は様式の章の順のまま）", () => {
    const got = topicCoverage("仕事は検品を続けたいです。体調は朝が悪くて、通院は月1回。");
    expect(got.map((c) => c.topic.id)).toEqual(INTERVIEW_TOPICS.map((t) => t.id));
    const heard = got.filter((c) => c.heard).map((c) => c.topic.id);
    expect(heard).toContain("work-wish");
    expect(heard).toContain("health-side");
    expect(heard).not.toContain("liaison");
  });

  it("文字起こしの途中の改行・空白で言葉が割れても見つける", () => {
    const got = topicCoverage("相談\n支援の方とも話しています");
    expect(got.find((c) => c.topic.id === "liaison")?.heard).toBe(true);
  });

  it("どの話題にも、聞き方の例と探す言葉がある", () => {
    for (const t of INTERVIEW_TOPICS) {
      expect(t.ask.length).toBeGreaterThan(0);
      expect(t.words.length).toBeGreaterThan(0);
    }
  });
});
