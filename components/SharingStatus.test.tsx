import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attrOf, elementsOf, isReachable, textOf } from "@/tests/helpers/markup";
import SharingStatus from "./SharingStatus";

/**
 * 名簿の共有状態の表示（components/SharingStatus.tsx）を、**いまの見え方のまま**固定する。
 *
 * なぜ必要か（2026-09-23 作り直し計画 F0b）:
 *   黒塗りは名簿にある名前しか消せない。名簿が事業所ぶんになるのは、Clerk が
 *   「いま選んでいる事業所」を返しているときだけ。効いていないのに職員が気づかないと、
 *   同僚が登録した実名がそのまま AI へ出る。その唯一の知らせがこの表示で、
 *   これまで検査が1つも無かった。作業台（A案）で上の帯へ移す前に、3つの状態と
 *   「効いていないときの注意書き」「その場で切り替えられること」を縛っておく。
 *   切り替えは、部品が隠されずに出ていることまで見る（包む要素を hidden や aria-hidden にしたら落ちる）。
 *
 * Clerk そのものは動かさない。useOrganization が返す値と、切り替えの部品を偽物にする。
 */

/** useOrganization の偽物が返す値（テストごとに差し替える）。 */
const clerk = vi.hoisted(() => ({
  org: { isLoaded: false, organization: null } as {
    isLoaded: boolean;
    organization: { name: string } | null;
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => clerk.org,
  /** 本物の代わりに、描かれたことだけが分かる印を出す */
  OrganizationSwitcher: (): ReactNode => <div data-testid="org-switcher" />,
}));

afterEach(() => {
  clerk.org = { isLoaded: false, organization: null };
});

const ORG_NAME = "まなびケアプランセンター";

/** 状態を決めて描き、見るところ（見出し・点の色・注意書き・切り替え）を取り出す。 */
function view(variant: "full" | "compact", org: typeof clerk.org) {
  clerk.org = org;
  const html = renderToStaticMarkup(<SharingStatus variant={variant} />);
  const els = elementsOf(html);
  const spans = els.filter((el) => el.tagName === "span");
  // 色の点は読み上げない飾り（aria-hidden）、見出しはその次の文字
  const dot = spans.find((el) => attrOf(el, "aria-hidden") === "true");
  const label = spans.find((el) => attrOf(el, "aria-hidden") !== "true");
  return {
    // 「出していない」の確かめ用。textOf は隠した要素の文字を数えないので、隠して出した文字も拾える
    // 描いた HTML 全体で見る（2026-09-23 検収）
    html,
    text: els.length > 0 ? textOf(els[0]) : "",
    label: label ? textOf(label) : "",
    dotStyle: dot ? (attrOf(dot, "style") ?? "") : "",
    warning: els.filter((el) => el.tagName === "p" && textOf(el).includes("置き換わりません")),
    // 切り替えは「隠されずに出ている」ものだけ数える。elementsOf は隠した要素も返すので、
    // 以前は包む div を class="hidden"／aria-hidden="true" にしても緑だった（2026-09-24 検収）
    switchers: els.filter((el) => attrOf(el, "data-testid") === "org-switcher" && isReachable(el)),
  };
}

describe.each(["full", "compact"] as const)("名簿の共有状態（%s）", (variant) => {
  it("読み込み中は「共有状態を確認中」（灰色）。事業所名も注意書きもまだ出さない", () => {
    const v = view(variant, { isLoaded: false, organization: { name: ORG_NAME } });
    expect(v.label).toBe("共有状態を確認中");
    expect(v.dotStyle).toContain("background:var(--faint)");
    expect(v.warning).toHaveLength(0);
    // 隠した要素や属性に入れて出しても落ちるよう、画面の文字ではなく HTML 全体で見る
    expect(v.html).not.toContain(ORG_NAME);
    expect(v.html).not.toContain("置き換わりません");
  });

  it("事業所を選んでいれば「事業所で共有中」（緑）と事業所名。注意書きは出さない", () => {
    const v = view(variant, { isLoaded: true, organization: { name: ORG_NAME } });
    expect(v.label).toBe("事業所で共有中");
    expect(v.dotStyle).toContain("background:var(--green)");
    expect(v.text).toContain(ORG_NAME);
    expect(v.warning).toHaveLength(0);
    expect(v.html).not.toContain("置き換わりません");
    expect(v.switchers).toHaveLength(1);
  });

  it("事業所を選んでいなければ「自分の登録分のみ」（琥珀）、注意書き、その場で選べる切り替え", () => {
    const v = view(variant, { isLoaded: true, organization: null });
    expect(v.label).toBe("自分の登録分のみ");
    expect(v.dotStyle).toContain("background:var(--amber)");
    expect(v.warning).toHaveLength(1);
    expect(textOf(v.warning[0])).toContain("ほかの職員が登録した利用者の名前は置き換わりません");
    expect(v.switchers).toHaveLength(1);
  });
});
