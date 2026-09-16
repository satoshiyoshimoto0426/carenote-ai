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

export default function AppointmentsPanel({ appointments, secondaryClass }: Props) {
  const items = appointments
    .map((a, i) => ({ a, p: toCalendarPayload(a), i }))
    .filter((x) => x.p !== null);
  if (items.length === 0) return null;

  return (
    <section className="rounded-[10px] border border-[var(--line)] bg-[var(--card)] p-4">
      <h3 className="mb-1 text-sm font-medium">
        メモから拾った予定（<span className="tnum">{items.length}</span>件）
      </h3>
      <p className="mb-3 text-xs text-[var(--muted)]">
        カレンダーには記号（A様）と用件だけを入れます。ボタンを押すと作成画面が開くので、内容を見て保存してください。
      </p>
      <ul className="space-y-2">
        {items.map(({ a, p, i }) => {
          if (!p) return null;
          const when = p.allDay
            ? `${a.date}（終日）`
            : `${a.date} ${a.startTime}${a.endTime ? `〜${a.endTime}` : ""}`;
          const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(p, `carenote-${a.date}-${i}`))}`;
          return (
            <li
              key={`${a.date}-${a.startTime}-${a.title}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-[var(--paper)] px-3 py-2"
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
