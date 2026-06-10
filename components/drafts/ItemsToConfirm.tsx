/** AIが判断できなかった「要確認事項」を強調表示する（人間の確認が必須） */
export default function ItemsToConfirm({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "linear-gradient(135deg, rgba(127,29,29,0.13), #1e293b)",
        border: "1px solid rgba(239,68,68,0.27)",
      }}
    >
      <div className="text-red-300 font-bold text-sm mb-2">🔎 要確認事項（人が確認）</div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item} className="text-slate-200 text-xs leading-relaxed">
            ・{item}
          </div>
        ))}
      </div>
    </div>
  );
}
