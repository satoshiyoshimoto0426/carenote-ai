import type { ReactNode } from "react";

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
 */
export function PageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">{kicker}</p>
      <h1
        className="mt-1.5 text-[26px] font-medium leading-snug text-[var(--ink)]"
        style={{ fontFamily: "var(--serif)" }}
      >
        {title}
      </h1>
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

/** Mincho section heading (15px) — separates groups inside a page or card. */
export function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2
      className={`text-[15px] font-medium text-[var(--ink)] ${className ?? ""}`}
      style={{ fontFamily: "var(--serif)" }}
    >
      {children}
    </h2>
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
