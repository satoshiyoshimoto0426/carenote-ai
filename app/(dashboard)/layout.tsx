import Sidebar from "@/components/Sidebar";
import { IconHome, IconSearch } from "@/components/ui/icons";

/**
 * Dashboard shell (design system v0): paper background, fixed 220px sidebar on
 * md+, white top bar with hairline border on mobile. Wraps every signed-in page
 * under app/(dashboard)/.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen"
      style={{
        background: "var(--paper)",
        fontFamily: "var(--sans)",
        color: "var(--ink)",
      }}
    >
      {/* Sidebar — hidden on mobile, visible md+ */}
      <div className="hidden md:flex md:w-[220px] md:flex-col md:fixed md:inset-y-0">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 fixed top-0 left-0 right-0 z-20"
        style={{
          background: "#FCFBF9",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="min-w-0">
          <div
            className="text-base leading-tight text-[var(--ink)]"
            style={{ fontFamily: "var(--serif)" }}
          >
            CareNote
          </div>
          <div className="text-[10px] tracking-[0.12em] text-[var(--faint)]">ケア記録支援</div>
        </div>
        <MobileNav />
      </div>

      {/* Main content */}
      <div className="flex-1 md:ml-[220px] flex flex-col">
        <main className="flex-1 px-4 md:px-8 py-6 mt-14 md:mt-0">{children}</main>
        <footer className="text-center py-4 pb-6">
          <p className="text-xs text-[var(--faint)]">CareNote — Powered by Claude API</p>
        </footer>
      </div>
    </div>
  );
}

// Minimal mobile bottom nav
function MobileNav() {
  return (
    <nav className="flex gap-1">
      <a
        href="/dashboard"
        aria-label="ダッシュボード"
        className="flex items-center justify-center rounded-[9px] p-2 text-[var(--muted)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
      >
        <IconHome size={18} />
      </a>
      <a
        href="/evaluate"
        aria-label="評価する"
        className="flex items-center justify-center rounded-[9px] p-2 text-[var(--muted)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
      >
        <IconSearch size={18} />
      </a>
    </nav>
  );
}
