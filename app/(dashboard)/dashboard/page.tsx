import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="max-w-2xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-100 mb-1">ダッシュボード</h1>
        <p className="text-slate-400 text-sm">評価履歴はログイン機能追加後に利用可能になります</p>
      </div>

      {/* Coming Soon card */}
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid #334155",
        }}
      >
        <div className="text-5xl mb-4">📊</div>
        <div className="text-slate-200 font-bold text-base mb-2">評価履歴（Coming Soon）</div>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Phase 2でClerk認証 + Supabaseを追加すると<br />
          過去の評価履歴・スコア推移グラフが表示されます
        </p>
        <Link
          href="/evaluate"
          className="inline-block px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        >
          🔍 評価を開始する
        </Link>
      </div>
    </div>
  );
}
