import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen"
      style={{
        background: "linear-gradient(160deg, #020617 0%, #0f172a 40%, #1e1b4b 100%)",
        fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
        color: "#f1f5f9",
      }}
    >
      {/* Sidebar — hidden on mobile, visible md+ */}
      <div className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 fixed top-0 left-0 right-0 z-20"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          borderBottom: "1px solid #334155",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-black text-white"
            style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
          >
            C
          </div>
          <span
            className="text-base font-black"
            style={{
              background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CareNote AI
          </span>
        </div>
        <MobileNav />
      </div>

      {/* Main content */}
      <div className="flex-1 md:ml-56 flex flex-col">
        <main className="flex-1 px-4 md:px-8 py-6 mt-14 md:mt-0">{children}</main>
        <footer className="text-center py-4 pb-6">
          <p className="text-slate-700 text-xs">
            CareNote AI — Powered by Claude API | Phase 2
          </p>
        </footer>
      </div>
    </div>
  );
}

// Minimal mobile bottom nav
function MobileNav() {
  return (
    <nav className="flex gap-2">
      <a href="/dashboard" className="text-slate-400 text-sm px-2 py-1 rounded hover:text-slate-200">📊</a>
      <a href="/evaluate"  className="text-slate-400 text-sm px-2 py-1 rounded hover:text-slate-200">🔍</a>
    </nav>
  );
}
