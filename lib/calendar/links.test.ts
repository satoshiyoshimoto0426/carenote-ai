import { describe, expect, it } from "vitest";
import type { Appointment } from "@/types/supportLog";
import { buildIcs, googleCalendarUrl, toCalendarPayload } from "./links";

const base: Appointment = {
  title: "A様 自宅で面談",
  date: "2026-09-12",
  startTime: "14:00",
  endTime: "",
  location: "自宅",
  note: "長女同席",
  confidence: "確定",
};

describe("カレンダー用の整形: toCalendarPayload", () => {
  it("日本時間 14:00 を UTC 05:00 に直し、終了が無ければ60分後にする", () => {
    const p = toCalendarPayload(base);
    expect(p).not.toBeNull();
    expect(p?.start).toBe("20260912T050000Z");
    expect(p?.end).toBe("20260912T060000Z");
    expect(p?.allDay).toBe(false);
  });

  it("時刻が無ければ終日（翌日まで）にする", () => {
    const p = toCalendarPayload({ ...base, startTime: "" });
    expect(p?.allDay).toBe(true);
    expect(p?.start).toBe("20260912");
    expect(p?.end).toBe("20260913");
  });

  it("日付が壊れていれば null、要確認なら説明に注記が入る", () => {
    expect(toCalendarPayload({ ...base, date: "来週" })).toBeNull();
    const p = toCalendarPayload({ ...base, confidence: "要確認" });
    expect(p?.description).toContain("要確認");
  });

  it("番号や住所が混ざっていても札に変える（二重の安全網）", () => {
    const p = toCalendarPayload({
      ...base,
      note: "折り返し 090-1234-5678",
      location: "大阪府大阪市北区梅田1-2-3",
    });
    expect(p?.description).not.toContain("1234");
    expect(p?.description).toContain("〔電話番号1〕");
    expect(p?.location).toBe("〔住所1〕");
  });
});

/** テスト用: 整形結果が null なら失敗させる（非nullアサーションを使わない） */
function payloadOf(a: Appointment) {
  const p = toCalendarPayload(a);
  if (!p) throw new Error("payload が null");
  return p;
}

describe("リンクと .ics", () => {
  it("Google カレンダーのリンクに件名・日時・場所が入る", () => {
    const url = googleCalendarUrl(payloadOf(base));
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260912T050000Z%2F20260912T060000Z");
    expect(decodeURIComponent(url)).toContain("text=A様+自宅で面談");
  });

  it(".ics が標準の骨格を持ち、改行と区切りを正しく逃がす", () => {
    const ics = buildIcs(payloadOf({ ...base, note: "持ち物: 保険証, 印鑑" }), "uid-1");
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20260912T050000Z");
    expect(ics).toContain("SUMMARY:A様 自宅で面談");
    expect(ics).toContain("DESCRIPTION:持ち物: 保険証\\, 印鑑");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
