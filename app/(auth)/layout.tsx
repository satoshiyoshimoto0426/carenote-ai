export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #020617 0%, #0f172a 40%, #1e1b4b 100%)" }}
    >
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black text-white"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        >
          C
        </div>
        <div>
          <div
            className="text-lg font-black"
            style={{
              background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CareNote AI
          </div>
          <div className="text-xs text-slate-500 tracking-widest">ケアプラン自動評価システム</div>
        </div>
      </div>
      {children}
    </div>
  );
}
