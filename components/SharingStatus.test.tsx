import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SharingStatus from "./SharingStatus";

/**
 * 名簿の共有状態の表示（components/SharingStatus.tsx）を固定する。
 *
 * なぜ必要か（独立審査 2026-09-13 critical）:
 *   黒塗りが事業所ぶんで効くのは、Clerk で事業所を「選んでいる」ときだけ。効いていないのに画面が
 *   普通に見えると、同僚が登録した実名がそのまま AI へ出る。A案で表示を上の帯へ移したとき、
 *   アートボードには「事業所で共有中」の緑しか描かれていなかった。灰（確認中）・黄（自分の登録分のみ）
 *   と、効いていないときの注意、その場で選べる切り替えのどれが消えても、ここで赤くなる。
 *
 * Clerk は偽物に差し替える。useOrganization が返す状態を3通りに変え、OrganizationSwitcher は
 * 受け取った設定を data 属性に書き出すだけの代役にする（描かれたこと・行き先・押す場所の大きさを見る）。
 */

const clerk = vi.hoisted(() => ({
  state: { isLoaded: true, organization: null as { name: string } | null },
  /** 最後に描いた OrganizationSwitcher が受け取った appearance.elements（見た目の指定の全部） */
  elements: {} as Record<string, string>,
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => clerk.state,
  OrganizationSwitcher: (props: {
    hidePersonal?: boolean;
    afterSelectOrganizationUrl?: string;
    afterSelectPersonalUrl?: string;
    appearance?: { elements?: Record<string, string> };
  }) => {
    clerk.elements = props.appearance?.elements ?? {};
    return createElement("div", {
      "data-org-switcher": "",
      "data-hide-personal": String(props.hidePersonal),
      "data-after-org": props.afterSelectOrganizationUrl,
      "data-after-personal": props.afterSelectPersonalUrl,
      "data-trigger": props.appearance?.elements?.organizationSwitcherTrigger ?? "",
    });
  },
}));

function draw(variant: "bar" | "strip"): string {
  return renderToStaticMarkup(createElement(SharingStatus, { variant }));
}

/** 3つの状態。name は共有中のときの事業所の名前。 */
const STATES = {
  loading: { isLoaded: false, organization: null },
  shared: { isLoaded: true, organization: { name: "テスト事業所" } },
  notShared: { isLoaded: true, organization: null },
} as const;

type StateName = keyof typeof STATES;

function setState(name: StateName) {
  clerk.state = { ...STATES[name] };
}

beforeEach(() => setState("notShared"));

describe("SharingStatus variant bar（上の帯の右側）", () => {
  it.each([
    ["loading", "共有状態を確認中"],
    ["shared", "事業所で共有中"],
    ["notShared", "自分の登録分のみ"],
  ] as const)("%s のときは「%s」だけを出す（ほかの2つの言葉は出さない）", (state, label) => {
    setState(state);
    const html = draw("bar");
    expect(html).toContain(label);
    for (const other of ["共有状態を確認中", "事業所で共有中", "自分の登録分のみ"]) {
      if (other !== label) expect(html).not.toContain(other);
    }
  });

  it("共有中は事業所の名前を出す（どの事業所と共有しているかを確かめられる）", () => {
    setState("shared");
    expect(draw("bar")).toContain("テスト事業所");
  });

  it("点の色で3つの状態を見分けられる（灰・緑・黄）", () => {
    const dot = (state: StateName) => {
      setState(state);
      return /class="sharing-dot" style="background:([^"]+)"/.exec(draw("bar"))?.[1];
    };
    expect(dot("loading")).toBe("var(--faint)");
    expect(dot("shared")).toBe("var(--green)");
    expect(dot("notShared")).toBe("var(--amber)");
  });

  it.each(
    Object.keys(STATES) as StateName[],
  )("%s のときも事業所の切り替えが出ていて、選んだら利用者の画面へ戻る", (state) => {
    setState(state);
    const html = draw("bar");
    expect(html).toContain("data-org-switcher");
    // 個人のアカウントも選べる（事業所を外したことに気づけるように）
    expect(html).toContain('data-hide-personal="false"');
    expect(html).toContain('data-after-org="/clients"');
    expect(html).toContain('data-after-personal="/clients"');
  });

  it("切り替えのボタンはスマホでも押せる大きさ（44px = min-h-11 / min-w-11）", () => {
    const trigger = /data-trigger="([^"]*)"/.exec(draw("bar"))?.[1] ?? "";
    expect(trigger.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
  });

  /**
   * 文字を隠す指定（sr-only など）は、切り替えの**ボタンの中だけ**に効かせる。
   * Clerk の要素の名前の後ろの `__○○` は、使う場所ごとの名前だが、ボタンと押すと開く一覧で同じ名前を
   * 使うものがある（`__personalWorkspace` は一覧の「個人のアカウント」の行にも使われる）。
   * そこに隠す指定を書くと、スマホで一覧の行の文字が消え、共有していない注意が案内する先の道具が
   * 印と矢印だけになる（A3 の検証 2026-09-23 で見つかった旧指定）。ボタンだけに付く名前は
   * `organizationSwitcherTrigger` で始まるもの（ボタンそのもの・中の矢印）と、`__organizationSwitcherTrigger`
   * で終わるもの（ボタンの中の事業所の表示）だけ（@clerk/shared の型 OrganizationPreviewId）。
   */
  it("文字を隠す指定は、切り替えのボタンの中だけに効く（押すと開く一覧の行の文字は消さない）", () => {
    draw("bar");
    const hides = (classes: string) =>
      classes.split(/\s+/).some((c) => /(^|:)(sr-only|hidden|invisible)$/.test(c));
    const outsideTrigger = Object.entries(clerk.elements)
      .filter(([, classes]) => hides(classes))
      .map(([key]) => key)
      .filter(
        (key) =>
          !key.startsWith("organizationSwitcherTrigger") &&
          !key.endsWith("__organizationSwitcherTrigger"),
      );
    expect(outsideTrigger).toEqual([]);
  });

  it("スマホでは、ボタンの中の個人のアカウントの名前だけを読み上げに残す（帯からはみ出さない）", () => {
    draw("bar");
    expect(clerk.elements.organizationSwitcherTrigger.split(/\s+/)).toContain(
      "max-md:[&_.cl-userPreviewTextContainer]:sr-only",
    );
  });

  it("帯の中には注意の文を出さない（注意は帯の下の strip が出す）", () => {
    setState("notShared");
    expect(draw("bar")).not.toContain("置き換わりません");
  });
});

describe("SharingStatus variant strip（共有していないときだけ帯の下に出る注意）", () => {
  it("共有していないときは、注意を role=status で畳まずに出す", () => {
    setState("notShared");
    const html = draw("strip");
    expect(html).toContain('role="status"');
    // 意味は旧表示と同じ。切り替えの場所だけ上の帯の右側に変えた（旧: 左メニューの中で「下から」）
    expect(html).toContain(
      "ほかの職員が登録した利用者の名前は<strong>置き換わりません</strong>。複数人で使うときは、右上の事業所の切り替えから選んでください。",
    );
    expect(html).not.toContain("下から");
  });

  it.each(["loading", "shared"] as const)("%s のときは何も描かない（場所も取らない）", (state) => {
    setState(state);
    expect(draw("strip")).toBe("");
  });
});
