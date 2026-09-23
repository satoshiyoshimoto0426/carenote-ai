import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

/**
 * すべての画面を要求ごとに描く（静的に書き出さない）。
 * なぜ: Clerk のログイン状態と事業所の選択によって中身が変わる画面しかないため。
 */
export const dynamic = "force-dynamic";

/**
 * タブの題名と説明文。製品は「点検（評価）」だけの道具から「ケア記録の下書き支援」へ
 * 再定義済み（SPEC.md）なので、題名もそれに合わせる（旧: ケアプラン自動評価システム）。
 */
export const metadata: Metadata = {
  title: "CareNote AI — ケア記録の下書き支援",
  description:
    "ケアマネジャーのメモや会議の記録から、アセスメント・ケアプラン・担当者会議の要点・支援経過・モニタリングの下書きをAIが作り、職員が確かめて仕上げます。ケアプランの点検（採点）もできます。",
};

/** Google Fonts の読み込み先（書体の正本は app/globals.css の --sans / --mono）。 */
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap";

/**
 * すべての画面の外枠（Clerk の認証文脈・日本語・書体）。
 *
 * 書体は next/font ではなく <link> で読む。なぜ: next/font/google はビルド時に Google から
 * 書体を取りに行くので、ビルド（CI を含む）が外部との通信に左右される。<link> ならブラウザが表示時に読む。
 * 読み込む書体（IBM Plex Sans JP 400/500/700・IBM Plex Mono 400/500）は globals.css の
 * --sans / --mono の先頭と一致させる ── ずれは app/globals.test.ts が止める。
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="ja">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={FONTS_HREF} rel="stylesheet" />
        </head>
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
