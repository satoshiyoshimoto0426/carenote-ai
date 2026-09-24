import ClientPane from "@/components/clients/ClientPane";

/**
 * 利用者の詳細（/clients/{id}）。一覧の表の右の区画の中身（A案「作業台」・2026-09-24 A6 ＝ 計画 U3b）。
 *
 * 表と上の帯は app/(dashboard)/clients/layout.tsx（components/clients/ClientsLayout.tsx）にあり、ここは右の区画だけ。
 * 中身（頭・書類・関係者名簿・残した文字起こし）は components/clients/ClientPane.tsx。
 * ?doc={書類の id} は、その書類の承認の操作と中身をこの区画のまま開く（区画を 640px に広げるのは ClientsLayout）。
 *
 * params・searchParams は Next.js 16 ではページへ Promise で渡る（型の決まり: .next/types の PageProps）。
 * key に利用者の id を渡す: 別の利用者の行を押したとき、前の方の記号や書類が一瞬でも残らないよう、区画の状態を作り直す。
 * 同じ利用者のまま ?doc= だけが変わったときは作り直さない（一覧を読み直さずに書類を開き閉じする）。
 */
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string | string[] }>;
}) {
  const { id } = await params;
  const { doc } = await searchParams;
  return <ClientPane key={id} clientId={id} docId={typeof doc === "string" && doc ? doc : null} />;
}
