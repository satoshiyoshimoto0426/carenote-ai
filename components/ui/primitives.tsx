import Link from "next/link";
import type { ReactNode } from "react";
import { IconHelpCircle } from "./icons";

/**
 * CareNote AI layout/form primitives (design system v0).
 *
 * Why: keeps the paper-editorial look (tokens in app/globals.css) consistent
 * across dashboard pages without a component library. Pages compose these
 * plus the class-name constants below instead of restyling raw elements.
 */

/**
 * Shared form-control base: white field, warm border, generous padding.
 * The green focus ring comes from the global focus-visible rule in globals.css.
 */
export const inputClass =
  "w-full rounded-[10px] border border-[#E0DBD2] bg-white px-4 py-3 text-sm " +
  "text-[var(--ink)] placeholder:text-[var(--faint)]";

/** Textarea variant of inputClass — same field styling plus readable line height. */
export const textareaClass = `${inputClass} leading-relaxed`;

/** Primary action button: solid deep green, white text. */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--green)] px-5 py-2.5 " +
  "text-sm font-semibold text-white transition-colors hover:bg-[#0F4A3B] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary action button: white with warm border, ink text. */
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-[#E0DBD2] " +
  "bg-white px-5 py-2.5 text-sm font-medium text-[var(--ink)] transition-colors " +
  "hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Page heading block: small tracked kicker above a mincho (serif) title.
 * Every dashboard page opens with this so the hierarchy reads the same everywhere.
 *
 * helpAnchor: 使い方ページの章アンカー（例 "ch3"）。渡すと見出しの右に
 * 「この画面の使い方」リンクが出て /guide#ch3 へ飛ぶ（迷った職員がその場で手順を open できる）。
 */
export function PageHeader({
  kicker,
  title,
  description,
  helpAnchor,
}: {
  kicker: string;
  title: string;
  description?: string;
  helpAnchor?: string;
}) {
  return (
    <header className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">{kicker}</p>
          <h1
            className="mt-1.5 text-[26px] font-medium leading-snug text-[var(--ink)]"
            style={{ fontFamily: "var(--serif)" }}
          >
            {title}
          </h1>
        </div>
        {helpAnchor ? (
          <Link
            href={`/guide#${helpAnchor}`}
            className="mt-1 inline-flex flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--green-line)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
          >
            <IconHelpCircle size={14} />
            この画面の使い方
          </Link>
        ) : null}
      </div>
      {description ? <p className="mt-2 text-sm text-[var(--muted)]">{description}</p> : null}
    </header>
  );
}

/**
 * White surface card with hairline border and the one approved soft shadow.
 * Deliberately no default padding — callers pass p-5/p-6 via className so
 * Tailwind class conflicts never occur.
 */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_3px_rgba(28,27,25,0.06)] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/**
 * Mincho section heading (15px) — separates groups inside a page or card.
 * `as` で見出しレベルを選べる。既定 h2。章見出し（h2）の中に置く小見出しは h3 を渡して、
 * 読み上げソフトの見出しジャンプが平坦にならないようにする（検品 2026-09-12）。
 */
export function SectionTitle({
  className,
  children,
  as: Tag = "h2",
}: {
  className?: string;
  children: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      className={`text-[15px] font-medium text-[var(--ink)] ${className ?? ""}`}
      style={{ fontFamily: "var(--serif)" }}
    >
      {children}
    </Tag>
  );
}

/**
 * Label-above-input wrapper: 12px muted label wired via htmlFor, optional hint
 * below. Guarantees every form control on these screens gets an accessible label.
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-[var(--faint)]">{hint}</p> : null}
    </div>
  );
}
