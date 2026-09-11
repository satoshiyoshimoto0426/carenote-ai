// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import adapter from "./kaipoke.js";

/**
 * DOM 経路のテスト（独立審査 2026-09-11 D9/D10/D33）。
 * 「消さない」保証（既存文章のある欄には書かない・追記は退避して戻せる）と、
 * カイポケ（JSF）の隠し欄同期に必要な keyup を含むイベント発火を、jsdom の最小フォームで固定する。
 * 実機（カイポケ本番画面）での確認は別途（KAIPOKE-TRANSCRIPTION-SPEC.md）。
 */

// jsdom はレイアウトを持たないため offsetParent が常に null。アダプタの「見えている欄」判定を通すために親要素を返す
Object.defineProperty(HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get() {
    return (this as HTMLElement).parentElement;
  },
});

// jsdom に無い scrollIntoView（ハイライト時に呼ぶ）を空実装にする
Element.prototype.scrollIntoView = () => {};

function form(html: string) {
  document.body.innerHTML = `<form>${html}</form>`;
}
function ta(name: string): HTMLTextAreaElement {
  const el = document.getElementsByName(name)[0];
  if (!(el instanceof HTMLTextAreaElement)) throw new Error(`textarea ${name} が無い`);
  return el;
}

const SHEET = {
  fields: [
    {
      page: 10,
      formName: "form:summarySubject",
      label: "まとめ",
      text: "新しい文章",
      isInferred: false,
    },
  ],
};

describe("writeField: 値を入れて input / change / keyup を発火し、禁止文字を直す", () => {
  it("3種のイベントが順に飛び、波ダッシュは全角チルダになる", () => {
    form('<textarea name="form:summarySubject"></textarea>');
    const el = ta("form:summarySubject");
    const seen: string[] = [];
    for (const t of ["input", "change", "keyup"]) el.addEventListener(t, () => seen.push(t));
    adapter.writeField(el, "週2〜3回");
    expect(el.value).toBe("週2～3回");
    expect(seen).toEqual(["input", "change", "keyup"]);
  });
});

describe("injectKaipokeSheet: 既存の文章がある欄には書かない（消さない）", () => {
  it("空の欄には書き、文章が入っている欄は caution で飛ばす", () => {
    form('<textarea name="form:summarySubject"></textarea>');
    const r1 = adapter.inject("kaipokeAssessment", SHEET, { page: 10 });
    expect(r1.filled).toBe(1);
    expect(ta("form:summarySubject").value).toBe("新しい文章");

    form('<textarea name="form:summarySubject">過去の記録</textarea>');
    const r2 = adapter.inject("kaipokeAssessment", SHEET, { page: 10 });
    expect(r2.filled).toBe(0);
    expect(r2.results[0].status).toBe("caution");
    expect(ta("form:summarySubject").value).toBe("過去の記録");
  });

  it("ページ指定が無ければ何も書かない", () => {
    form('<textarea name="form:summarySubject"></textarea>');
    const r = adapter.inject("kaipokeAssessment", SHEET, {});
    expect(r.filled).toBe(0);
    expect(ta("form:summarySubject").value).toBe("");
  });
});

describe("追記モード: previewAppend（書かない）→ applyAppend（退避して足す）→ undoAppend（戻す）", () => {
  beforeEach(() => {
    form('<textarea name="form:consultationSubjectPersonHimself">2026-08-01 初回面談。</textarea>');
  });

  it("前後を見せるだけでは欄が変わらない", () => {
    const p = adapter.previewAppend("assessment", "mainComplaints", "2026-09-10 電話: 夜間不安。");
    expect(p.status).toBe("ok");
    expect(p.before).toBe("2026-08-01 初回面談。");
    expect(p.after).toBe("2026-08-01 初回面談。\n2026-09-10 電話: 夜間不安。");
    expect(ta("form:consultationSubjectPersonHimself").value).toBe("2026-08-01 初回面談。");
  });

  it("追記は末尾に足し、元に戻すと追記前の文章に戻る（既存を消さない）", () => {
    const a = adapter.applyAppend("assessment", "mainComplaints", "2026-09-10 電話: 夜間不安。");
    expect(a.status).toBe("filled");
    expect(ta("form:consultationSubjectPersonHimself").value).toBe(
      "2026-08-01 初回面談。\n2026-09-10 電話: 夜間不安。",
    );
    const u = adapter.undoAppend("assessment", "mainComplaints");
    expect(u.status).toBe("restored");
    expect(ta("form:consultationSubjectPersonHimself").value).toBe("2026-08-01 初回面談。");
    // 退避は1回限り
    expect(adapter.undoAppend("assessment", "mainComplaints").status).toBe("none");
  });

  it("同じ文が既にあれば二重に足さない・欄が無ければ書かない", () => {
    expect(adapter.applyAppend("assessment", "mainComplaints", "初回面談").status).toBe(
      "duplicate",
    );
    expect(adapter.applyAppend("assessment", "lifeHistory", "x").status).toBe("not_found");
    expect(adapter.applyAppend("assessment", "nope", "x").status).toBe("unknown_field");
  });
});

describe("isReloginRequired: 再ログイン画面の検知", () => {
  it("「再度ユーザー認証が必要」が見えていれば true、無ければ false", () => {
    form('<textarea name="form:summarySubject"></textarea>');
    expect(adapter.isReloginRequired()).toBe(false);
    document.body.innerHTML =
      "<div><p>セッションが切れました。再度ユーザー認証が必要です。</p></div>";
    expect(adapter.isReloginRequired()).toBe(true);
  });
});
