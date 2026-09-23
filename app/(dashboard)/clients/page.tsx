import NewClientForm from "@/components/clients/NewClientForm";

/**
 * 利用者の画面の右の区画（/clients）。一覧の表と上の帯は app/(dashboard)/clients/layout.tsx
 * （components/clients/ClientsLayout.tsx）にあり、ここは右の幅 440px の区画の中身だけを決める。
 *
 * - いつも: 案内「左の一覧から利用者を選ぶと、書類と関係者名簿がここに出ます」。
 *   **開いただけでは誰も選ばない**（関係者名簿の実名は、行を押したあとにだけ出す ── 吉本さん決定 2026-09-23）。
 * - /clients?new=1（上の帯の「新しい利用者」）: 登録の欄（components/clients/NewClientForm.tsx）。
 *
 * searchParams は Next.js 16 ではページへ Promise で渡る（型の決まり: .next/types の PageProps）。
 * 見出し「利用者」と「この画面の使い方」（/guide#ch2）は上の帯にある（以前の PageHeader は外した）。
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  const { new: newParam } = await searchParams;
  if (newParam === "1") return <NewClientForm />;
  return (
    <p className="px-7 py-7 text-[13px] leading-relaxed text-[var(--muted)]">
      左の一覧から利用者を選ぶと、書類と関係者名簿がここに出ます
    </p>
  );
}
