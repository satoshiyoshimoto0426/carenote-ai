import FaqAccordion from "@/components/manual/FaqAccordion";
import { IconAlert, IconCheck, IconInfo, IconPlayCircle, IconPrinter } from "@/components/ui/icons";
import { Card, PageHeader, SectionTitle } from "@/components/ui/primitives";
import {
  MANUAL_CHAPTERS,
  MANUAL_META,
  MANUAL_PROMISES,
  type ManualCallout,
  type ManualChapter,
} from "@/lib/manual/content";

/**
 * アプリ内の「使い方」ページ（docs/ROADMAP.md 第4版 P-MANUAL）。
 *
 * なぜ存在するか:
 *   パソコンが苦手な職員が、画面を離れずに手順を確かめられるようにする。本文は
 *   lib/manual/content.ts が唯一の正本で、印刷・PDF配布用の1枚もの（/manual/index.html）と
 *   動画の台本（docs/MANUAL-VIDEO-SPEC.md）も同じ本文から作る。
 *
 * 描画はサーバー側で行い、開閉の要る「よくある質問」だけを components/manual/FaqAccordion.tsx
 * （"use client"）に切り出している（CLAUDE.md「"use client" は最小限」）。
 *
 * 表示の3形態:
 *   - HTML（この画面）… 章ごとの手順・注意・よくある質問
 *   - PDF・印刷（上部のボタン）… 別タブで1枚ものを開き、印刷または PDF として保存
 *   - 動画（章ごと）… 実際の画面操作を録画したもの。未収録の章は「準備中」と正直に出す
 */

const CALLOUT_STYLE: Record<
  ManualCallout["kind"],
  { bg: string; border: string; fg: string; label: string }
> = {
  info: { bg: "#F4F7FA", border: "#D5E0E9", fg: "#27506B", label: "知っておくこと" },
  warn: { bg: "#FDF4F1", border: "#F0D3C9", fg: "#8A3A22", label: "気をつけること" },
  tip: { bg: "var(--green-soft)", border: "var(--green-line)", fg: "#15604D", label: "こつ" },
};

export default function GuidePage() {
  return (
    <div className="max-w-[860px]">
      <PageHeader
        kicker="Guide"
        title="使い方"
        description="はじめての方は ① から順に読んでください。各章の動画は、実際の画面を録画したものです。"
      />

      <ToolbarCard />
      <PromisesCard />
      <TableOfContents />

      {MANUAL_CHAPTERS.map((ch) => (
        <ChapterBlock key={ch.id} chapter={ch} />
      ))}

      <p className="mt-10 mb-2 text-center text-xs text-[var(--faint)]">
        {MANUAL_META.title} {MANUAL_META.version} ／
        画面が変わったときは、この使い方も同時に直します。
      </p>
    </div>
  );
}

/** 印刷・PDF配布用の1枚ものへの導線 */
function ToolbarCard() {
  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <SectionTitle>紙で配る・PDFで保存する</SectionTitle>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            同じ内容を1枚のページにまとめたものを別のタブで開きます。そこから印刷したり、PDF
            ファイルとして保存・配布できます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/manual/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#E0DBD2] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            <IconPrinter size={16} />
            印刷用のページを開く
          </a>
          <a
            href="/manual/CareNote-AI-操作マニュアル.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F4A3B]"
          >
            <IconPrinter size={16} />
            PDFをダウンロード
          </a>
        </div>
      </div>
    </Card>
  );
}

/** どの章にも共通する3つの約束 */
function PromisesCard() {
  return (
    <Card className="mb-5 p-5">
      <SectionTitle>この道具の3つの約束</SectionTitle>
      <ul className="mt-3 space-y-2.5">
        {MANUAL_PROMISES.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-[var(--ink)]">
            <span className="mt-0.5 flex-shrink-0 text-[var(--green)]">
              <IconCheck size={16} />
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TableOfContents() {
  return (
    <Card className="mb-8 p-5">
      <SectionTitle>目次</SectionTitle>
      <nav className="mt-3 flex flex-wrap gap-2">
        {MANUAL_CHAPTERS.map((ch) => (
          <a
            key={ch.id}
            href={`#${ch.id}`}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] transition-colors hover:border-[var(--green-line)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
          >
            <span className="text-[var(--faint)]">{ch.no}</span>
            {ch.short}
          </a>
        ))}
      </nav>
    </Card>
  );
}

function ChapterBlock({ chapter }: { chapter: ManualChapter }) {
  return (
    <section id={chapter.id} className="mb-10 scroll-mt-6">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-lg text-[var(--faint)]" style={{ fontFamily: "var(--serif)" }}>
          {chapter.no}
        </span>
        <h2
          className="text-[20px] font-medium leading-snug text-[var(--ink)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          {chapter.title}
        </h2>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">{chapter.lead}</p>

      <VideoBlock chapter={chapter} />

      <Card className="mb-4 p-5">
        <SectionTitle>手順</SectionTitle>
        <ol className="mt-3 space-y-3">
          {chapter.steps.map((step, i) => (
            <li key={step.text} className="flex gap-3 text-sm leading-relaxed">
              <span
                className="mt-0.5 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--green-soft)] text-[11px] font-semibold text-[var(--green)]"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="text-[var(--ink)]">
                {step.text}
                {step.uiLabel ? (
                  <span className="ml-2 inline-block rounded-[6px] border border-[var(--green-line)] bg-[var(--green-soft)] px-1.5 py-0.5 text-xs text-[var(--green)]">
                    {step.uiLabel}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {chapter.callouts.length > 0 ? (
        <div className="mb-4 space-y-2.5">
          {chapter.callouts.map((c) => (
            <CalloutBlock key={c.text} callout={c} />
          ))}
        </div>
      ) : null}

      {chapter.faq.length > 0 ? <FaqAccordion faq={chapter.faq} /> : null}
    </section>
  );
}

function VideoBlock({ chapter }: { chapter: ManualChapter }) {
  const { video } = chapter;
  if (video.status === "planned") {
    return (
      <Card className="mb-4 flex items-start gap-3 p-5">
        <span className="mt-0.5 flex-shrink-0 text-[var(--faint)]">
          <IconPlayCircle size={18} />
        </span>
        <div className="text-sm">
          <p className="font-medium text-[var(--ink)]">
            操作動画（約{video.minutes}分）は準備中です
          </p>
          <p className="mt-1 text-[var(--muted)]">
            この章の画面操作を録画した動画を用意しています。公開までは、下の手順と画面の文字を見ながら操作してください。
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="mb-4 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--green)]">
          <IconPlayCircle size={18} />
        </span>
        <SectionTitle>動画で見る（約{video.minutes}分）</SectionTitle>
      </div>
      <video
        controls
        preload="metadata"
        className="w-full rounded-[10px] border border-[var(--line)] bg-black"
      >
        <source src={video.src} type="video/mp4" />
        {/* 字幕は収録とセットで用意する（音を出せない場所でも読めるように・MANUAL-VIDEO-SPEC.md 収録手順6） */}
        <track
          kind="captions"
          srcLang="ja"
          label="日本語字幕"
          src={video.src.replace(/\.mp4$/, ".vtt")}
          default
        />
        お使いのブラウザは動画の再生に対応していません。下の手順をお読みください。
      </video>
      <p className="mt-2 text-xs text-[var(--faint)]">
        実際の画面を録画したものです。テスト用のデータを使って撮影しています。
      </p>
    </Card>
  );
}

function CalloutBlock({ callout }: { callout: ManualCallout }) {
  const s = CALLOUT_STYLE[callout.kind];
  const Icon = callout.kind === "warn" ? IconAlert : callout.kind === "tip" ? IconCheck : IconInfo;
  return (
    <div
      className="flex gap-2.5 rounded-[12px] border p-4 text-sm leading-relaxed"
      style={{ background: s.bg, borderColor: s.border, color: s.fg }}
    >
      <span className="mt-0.5 flex-shrink-0">
        <Icon size={16} />
      </span>
      <span>
        <span className="mr-1.5 font-semibold">{s.label}:</span>
        {callout.text}
      </span>
    </div>
  );
}
