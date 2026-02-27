import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareNote AI — ケアプラン自動評価システム",
  description: "ケアマネジャーが作成したケアプラン書類をAIが8カテゴリ27点満点で自動評価します",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
