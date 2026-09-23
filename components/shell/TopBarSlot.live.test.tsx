// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TopBar, { SHELL_HEAD_HEIGHT_VAR } from "./TopBar";
import TopBarSlot, { TopBarSlotProvider } from "./TopBarSlot";

/**
 * 上の帯の差し込み（components/shell/TopBarSlot.tsx）と、帯の高さの書き込みを**実際に動かして**確かめる。
 *
 * なぜ必要か:
 *   差し込みは画面に描かれた後に始まる（createPortal）ので、サーバーで描いた HTML のテスト
 *   （TopBar.test.tsx）では見えない。ページが差し込んだら項目の名前が消えて中身が帯に入り、
 *   外したら名前に戻ること ── そしてその間も共有状態が消えないことを、ここで動かして見る。
 *   帯の高さ（--shell-head-h）は「前へ／次へ」の帯（.presend-nav）が帯の裏に潜らないための値で、
 *   注意の帯が出ると高くなる。測った値が書かれ、変われば書き直され、外すと消えることも見る。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const env = vi.hoisted(() => ({
  org: { isLoaded: true, organization: null as { name: string } | null },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/clients",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => env.org,
  OrganizationSwitcher: () => createElement("div", { "data-org-switcher": "" }),
}));

/** 偽の ResizeObserver。見張っている要素と、大きさが変わったときに呼ぶ関数を覚える。 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

/** 上の帯のまとまり（.shell-head）の高さとして返す値。jsdom は配置をしないので自分で決める。 */
let headHeight = 0;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  env.org = { isLoaded: true, organization: null };
  headHeight = 97;
  FakeResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = this.classList.contains("shell-head") ? headHeight : 0;
    return { height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0 } as DOMRect;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(SHELL_HEAD_HEIGHT_VAR);
});

/** layout.tsx と同じ並び（差し込み口を共有する Provider の中に、上の帯と本文）で描く。 */
function Shell({ slot }: { slot: ReactNode }) {
  return createElement(
    TopBarSlotProvider,
    null,
    createElement(TopBar),
    createElement("main", null, slot, createElement("p", null, "本文")),
  );
}

function render(slot: ReactNode) {
  act(() => {
    if (!root) root = createRoot(container);
    root.render(createElement(Shell, { slot }));
  });
}

const q = (selector: string) => container.querySelector(selector);

describe("TopBarSlot（ページが上の帯の左に差し込む）", () => {
  it("差し込みが無いときは項目の名前を出し、共有状態も出す", () => {
    render(null);
    expect(q(".topbar-section")?.textContent).toBe("利用者");
    expect(q(".sharing-bar")?.textContent).toContain("自分の登録分のみ");
    expect(q("[data-org-switcher]")).not.toBeNull();
  });

  it("ページが差し込むと中身が帯の左に入り、項目の名前は消え、本文には残らない", () => {
    render(createElement(TopBarSlot, null, createElement("h1", null, "利用者 8")));
    const slot = q(".topbar-slot");
    expect(slot?.querySelector("h1")?.textContent).toBe("利用者 8");
    expect(q(".topbar-section")).toBeNull();
    expect(q("main h1")).toBeNull();
    // 差し込んでいる間も、共有状態と注意は外枠に出たまま
    expect(q(".sharing-bar")?.textContent).toContain("自分の登録分のみ");
    expect(q('[role="status"].sharing-strip')?.textContent).toContain("置き換わりません");
  });

  it("差し込みを外すと、項目の名前に戻る", () => {
    render(createElement(TopBarSlot, null, createElement("h1", null, "利用者 8")));
    render(null);
    expect(q(".topbar-slot")?.childElementCount).toBe(0);
    expect(q(".topbar-section")?.textContent).toBe("利用者");
  });

  it("Provider の外で使っても壊れない（何も描かない）", () => {
    act(() => {
      root = createRoot(container);
      root.render(createElement(TopBarSlot, null, createElement("h1", null, "迷子")));
    });
    expect(container.textContent).toBe("");
  });
});

describe("帯の高さ（--shell-head-h）", () => {
  const written = () => document.documentElement.style.getPropertyValue(SHELL_HEAD_HEIGHT_VAR);

  it("帯＋注意の帯の高さを測って書き、変わったら書き直し、外したら消す", () => {
    render(null);
    expect(written()).toBe("97px");

    const [observer] = FakeResizeObserver.instances;
    expect(observer.observed[0]?.classList.contains("shell-head")).toBe(true);

    // 事業所を選んで注意の帯が消えた → 帯だけの高さに書き直す
    headHeight = 52;
    act(() => observer.callback());
    expect(written()).toBe("52px");

    act(() => root?.unmount());
    root = null;
    expect(observer.disconnected).toBe(true);
    expect(written()).toBe("");
  });

  it("測れない（高さ 0）ときは書かない（CSS の控え --topbar-h が使われる）", () => {
    headHeight = 0;
    render(null);
    expect(written()).toBe("");
  });
});
