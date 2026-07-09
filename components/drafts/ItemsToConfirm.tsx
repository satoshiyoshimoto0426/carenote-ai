import { IconAlert } from "@/components/ui/icons";

/** AIが判断できなかった「要確認事項」を amber 帯で強調表示する（人間の確認が必須） */
export default function ItemsToConfirm({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[12px] border border-[var(--amber)] bg-[var(--amber-soft)] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#7A5B1E]">
        <IconAlert size={16} className="shrink-0" />
        要確認事項（人が確認）
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item} className="text-xs leading-relaxed text-[var(--ink)]">
            ・{item}
          </div>
        ))}
      </div>
    </div>
  );
}
