import FaqAccordion from "@/components/manual/FaqAccordion";
import {
  IconAlert,
  IconCheck,
  IconDownload,
  IconInfo,
  IconPlayCircle,
  IconPrinter,
} from "@/components/ui/icons";
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
  // 3種の別は色系統で保つ: info=中立（地と罫線だけ）／warn=注意（amber）／tip=こつ（green）
  info: {
    bg: "var(--surface-2)",
    border: "var(--line)",
    fg: "var(--muted)",
    label: "知っておくこと",
  },
  warn: {
    bg: "var(--amber-soft)",
    border: "var(--amber-line)",
    fg: "var(--amber)",
    label: "気をつけること",
  },
  tip: {
    bg: "var(--green-soft)",
    border: "var(--green-line)",
    fg: "var(--green)",
    label: "こつ",
  },
};

export default function GuidePage() {
  return (
    <div className="app-page">
      <PageHeader
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
            className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <IconPrinter size={16} />
            印刷用のページを開く
          </a>
          <a
            href="/manual/CareNote-AI-操作マニュアル.pdf"
            download
            className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--green-deep)]"
          >
            <IconDownload size={16} />
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
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--ink)] transition-colors hover:border-[var(--green-line)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
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
    // 上に貼りつく帯（どの幅でも出る）の裏に章の見出しが隠れないよう、帯の実際の高さぶん下に止める
    // （globals.css の .shell-anchor。旧: スマホだけ固定の 76px）
    <section id={chapter.id} className="shell-anchor mb-10">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-lg text-[var(--faint)]">{chapter.no}</span>
        <h2 className="text-[20px] font-bold leading-snug text-[var(--ink)]">{chapter.title}</h2>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">{chapter.lead}</p>

      <VideoBlock chapter={chapter} />

      <Card className="mb-4 p-5">
        <SectionTitle as="h3">手順</SectionTitle>
        <ol className="mt-3 space-y-3">
          {chapter.steps.map((step, i) => (
            <li key={step.text} className="flex gap-3 text-sm leading-relaxed">
              <span
                className="tnum mt-0.5 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--green-soft)] text-[11px] font-semibold text-[var(--green)]"
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
        <SectionTitle as="h3">動画で見る（約{video.minutes}分）</SectionTitle>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: 字幕は動画に焼き込み済み。track タグを足すと二重に重なる（理由は下のコメント） */}
      <video
        controls
        preload="metadata"
        className="w-full rounded-[8px] border border-[var(--line)] bg-black"
      >
        <source src={video.src} type="video/mp4" />
        {/*
          字幕はここで track タグを足さない。動画そのものに**焼き込み済み**なので、
          ブラウザ側でも出すと同じ文が二重に重なる（2026-09-16 に実際そうなった）。
          焼き込みにしている理由は、ファイルを配っても字幕が付いてくるため
          （パソコンの標準プレーヤーは、横に置いた .vtt を読まないことがある）。
          外部プレーヤー用の字幕ファイルは、動画と同じ場所に chN.vtt として置いてある。
        */}
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
      className="flex gap-2.5 rounded-[10px] border p-4 text-sm leading-relaxed"
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
