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
  "w-full rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-sm " +
  "text-[var(--ink)] placeholder:text-[var(--faint)]";

/** Textarea variant of inputClass — same field styling plus readable line height. */
export const textareaClass = `${inputClass} leading-relaxed`;

/** Primary action button: solid deep green, white text. */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-[8px] bg-[var(--green)] px-4.5 py-2.5 " +
  "text-sm font-bold text-white transition-colors hover:bg-[var(--green-deep)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary action button: white with warm border, ink text. */
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-[8px] border border-[var(--line)] " +
  "bg-[var(--card)] px-4.5 py-2.5 text-sm font-medium text-[var(--muted)] transition-colors " +
  "hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 各ページの見出し。
 *
 * 2026-09-16 の作り直し: 旧版は日本語の見出しの上に "CREATE" のような**ラテン文字の
 * アイブロウ**を置き、見出しを明朝体で組んでいた。これは生成AIが作る画面の典型で、
 * 情報も足していない（"CREATE" は「帳票作成」の上に置いても何も説明しない）。
 * 見出し1本に整理し、書体は本文と同じゴシックの太字にした。
 *
 * helpAnchor: 使い方ページの章アンカー（例 "ch3"）。渡すと見出しの右に
 * 「この画面の使い方」リンクが出て /guide#ch3 へ飛ぶ（迷った職員がその場で手順を open できる）。
 */
export function PageHeader({
  title,
  description,
  helpAnchor,
}: {
  title: string;
  description?: string;
  helpAnchor?: string;
}) {
  return (
    <header className="mb-[var(--sp-4)]">
      {/*
        2026-09-16: 以前は justify-between で「使い方」リンクを見出しの反対側へ飛ばしていた。
        見出しが短いページでは画面の真ん中にぽつんと浮いて、意図した配置に見えなかった。
        見出しのすぐ隣に添える形に変える。
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[length:var(--t-title)] font-bold leading-[1.4] tracking-[0.01em] text-[var(--ink)]">
          {title}
        </h1>
        {helpAnchor ? (
          <Link
            href={`/guide#${helpAnchor}`}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-[7px] px-2 py-1 text-[12px] text-[var(--faint)] transition-colors hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
          >
            <IconHelpCircle size={13} />
            この画面の使い方
          </Link>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">{description}</p>
      ) : null}
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
      className={`rounded-[10px] border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(16,21,26,0.05)] ${className ?? ""}`}
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
      className={`text-[length:var(--t-section)] font-bold leading-[1.5] text-[var(--ink)] ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}

/**
 * 入力欄とそのラベル。ラベルは htmlFor で結び、補足があれば下に小さく添える。
 *
 * 2026-09-16: ラベルを 12px の薄いグレーから 13px の濃い太字へ。ラベルは「読み飛ばす
 * 装飾」ではなく「何を入れる欄か」を伝える本体なので、補足より強くする。
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
      <label
        htmlFor={htmlFor}
        className="mb-[var(--sp-1)] block text-[length:var(--t-label)] font-bold leading-[1.6] text-[var(--ink)]"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-[var(--sp-1)] text-[length:var(--t-meta)] leading-[1.7] text-[var(--faint)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
