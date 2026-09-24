import { IconAlert } from "@/components/ui/icons";

/**
 * AIが判断できなかった「要確認事項」を注意の黄色（amber）の帯で強調表示する（人間の確認が必須）。
 * 使う所: つくる（app/(dashboard)/create/page.tsx）の結果。A案（R1・2026-09-24）で角を丸めた箱をやめ、
 * 細い線で囲んだ帯にした（左だけ太い線で飾る形にはしない）。文字は以前のまま。
 */
export default function ItemsToConfirm({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6 border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[13.5px] font-bold text-[var(--amber)]">
        <IconAlert size={16} className="shrink-0" />
        要確認事項（人が確認）
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item} className="text-[13px] leading-[1.8] text-[var(--ink)]">
            ・{item}
          </div>
        ))}
      </div>
    </div>
  );
}
