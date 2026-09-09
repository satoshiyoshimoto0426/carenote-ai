/**
 * 予定をカレンダーへ渡す部品（第4段・docs/specs/call-pipeline.md）。純粋ロジック（テスト対象）。
 *
 * なぜ「リンクと .ics」なのか:
 *   吉本さん決定 D2＝職員は個人の Google アカウント。Calendar API を使う外部向けアプリは Google の審査が要り、
 *   審査前の「テスト」状態では 7 日でログインが切れる（公式ドキュメントで確認・2026-09-09）。
 *   そこで API を使わず、①Google カレンダーの「予定を作る」画面を内容入りで開くリンク ②標準形式 .ics ファイル
 *   の2本にした。どちらも**職員が保存ボタンを押して初めて登録される**（確定は常に人・SPEC §12）。
 *   ①のURL形式は Google の公式ドキュメントに無く広く使われている形式、②は RFC 5545 の標準。①が壊れたら②で代替できる。
 *
 * 個人情報:
 *   渡す予定は記号版の下書き（A様）から作り、さらに maskPatterns を通す（番号・住所が混ざっても札に変わる）。
 */
import { maskPatterns } from "@/lib/privacy/patterns";
import { createPiiVault } from "@/lib/privacy/vault";
import type { Appointment } from "@/types/supportLog";

const DEFAULT_MINUTES = 60;
const JST_OFFSET = "+09:00";

/** 日本時間の日付＋時刻を UTC の YYYYMMDDTHHMMSSZ にする */
function toUtcStamp(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00${JST_OFFSET}`);
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const d = new Date(`${date}T${time}:00${JST_OFFSET}`);
  d.setMinutes(d.getMinutes() + minutes);
  // 日本時間に戻して分解
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const iso = jst.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 番号・住所が混ざっていても札に変える（記号版から作る前提だが二重の安全網） */
function clean(s: string): string {
  return maskPatterns(s.normalize("NFKC"), createPiiVault()).text.trim();
}

export interface CalendarPayload {
  title: string;
  /** Google の dates パラメータ／.ics の DTSTART・DTEND に使う */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
}

/** 予定を、カレンダーへ渡せる形に整える（日付が壊れていれば null） */
export function toCalendarPayload(a: Appointment): CalendarPayload | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return null;
  const title = clean(a.title) || "予定";
  const location = clean(a.location);
  const description = [
    clean(a.note),
    a.confidence === "要確認" ? "※日時は要確認（AIの推定を含む）" : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!/^\d{2}:\d{2}$/.test(a.startTime)) {
    return {
      title,
      start: a.date.replace(/-/g, ""),
      end: nextDay(a.date).replace(/-/g, ""),
      allDay: true,
      location,
      description,
    };
  }
  const end = /^\d{2}:\d{2}$/.test(a.endTime)
    ? { date: a.date, time: a.endTime }
    : addMinutes(a.date, a.startTime, DEFAULT_MINUTES);
  return {
    title,
    start: toUtcStamp(a.date, a.startTime),
    end: toUtcStamp(end.date, end.time),
    allDay: false,
    location,
    description,
  };
}

/** Google カレンダーの「予定を作る」画面を内容入りで開くリンク */
export function googleCalendarUrl(p: CalendarPayload): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: p.title,
    dates: `${p.start}/${p.end}`,
  });
  if (p.location) params.set("location", p.location);
  if (p.description) params.set("details", p.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** 標準形式 .ics（RFC 5545）。Google・iPhone・Outlook で開ける */
export function buildIcs(p: CalendarPayload, uid: string): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const dt = p.allDay
    ? [`DTSTART;VALUE=DATE:${p.start}`, `DTEND;VALUE=DATE:${p.end}`]
    : [`DTSTART:${p.start}`, `DTEND:${p.end}`];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareNote AI//JA",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    ...dt,
    `SUMMARY:${esc(p.title)}`,
    p.location ? `LOCATION:${esc(p.location)}` : "",
    p.description ? `DESCRIPTION:${esc(p.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.join("\r\n")}\r\n`;
}
