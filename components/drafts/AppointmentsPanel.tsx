"use client";

/**
 * 下書きから拾った予定を、職員が自分のカレンダーへ入れる（第4段）。
 * 「Googleカレンダーに追加」は内容入りの作成画面を開くだけで、保存は職員が押す。
 * 予定は記号版（A様）から作り、実名は渡さない。
 */
import { buildIcs, googleCalendarUrl, toCalendarPayload } from "@/lib/calendar/links";
import type { Appointment } from "@/types/supportLog";

interface Props {
  appointments: Appointment[];
  secondaryClass: string;
}

/**
 * メモから拾った予定の一覧と、カレンダーへ入れるリンク（Googleカレンダー・.ics）。予定が無ければ何も出さない。
 * 使う所: つくる（支援経過の結果）。記号版の result から作る（実名で表示中でも実名は渡さない）。
 * A案（R1・2026-09-24）: 角を丸めた箱をやめ、下に 1px の線を引いた区切りと行にした。文字は以前のまま。
 */
export default function AppointmentsPanel({ appointments, secondaryClass }: Props) {
  const items = appointments
    .map((a, i) => ({ a, p: toCalendarPayload(a), i }))
    .filter((x) => x.p !== null);
  if (items.length === 0) return null;

  return (
    <section className="draft-section">
      <h3 className="section-label mb-1">
        メモから拾った予定（<span className="tnum">{items.length}</span>件）
      </h3>
      <p className="mb-2 text-xs leading-[1.8] text-[var(--muted)]">
        カレンダーには記号（A様）と用件だけを入れます。ボタンを押すと作成画面が開くので、内容を見て保存してください。
      </p>
      <ul>
        {items.map(({ a, p, i }) => {
          if (!p) return null;
          const when = p.allDay
            ? `${a.date}（終日）`
            : `${a.date} ${a.startTime}${a.endTime ? `〜${a.endTime}` : ""}`;
          const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(p, `carenote-${a.date}-${i}`))}`;
          return (
            <li
              key={`${a.date}-${a.startTime}-${a.title}`}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line-faint)] py-2.5"
            >
              <div className="text-sm">
                <span className="font-medium">{p.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">{when}</span>
                {a.location && (
                  <span className="ml-2 text-xs text-[var(--muted)]">＠{p.location}</span>
                )}
                {a.confidence === "要確認" && (
                  <span className="ml-2 text-xs font-medium text-[var(--clay)]">日時は要確認</span>
                )}
              </div>
              <div className="flex gap-2">
                <a
                  href={googleCalendarUrl(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${secondaryClass} text-xs`}
                >
                  Googleカレンダーに追加
                </a>
                <a
                  href={ics}
                  download={`予定-${a.date}.ics`}
                  className={`${secondaryClass} text-xs`}
                >
                  .ics
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
