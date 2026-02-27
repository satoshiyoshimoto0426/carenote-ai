"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";

const NAV = [
  { href: "/dashboard", label: "ダッシュボード", icon: "📊" },
  { href: "/evaluate",  label: "評価する",       icon: "🔍" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)",
        borderRight: "1px solid #334155",
        width: "100%",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: "1px solid #334155" }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-black text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        >
          C
        </div>
        <div className="min-w-0">
          <div
            className="text-base font-black leading-tight"
            style={{
              background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CareNote AI
          </div>
          <div className="text-xs text-slate-500 truncate">ケアプラン自動評価</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? "rgba(59,130,246,0.15)" : "transparent",
                color: active ? "#60a5fa" : "#94a3b8",
                border: active
                  ? "1px solid rgba(59,130,246,0.3)"
                  : "1px solid transparent",
              }}
            >
              <span className="text-lg">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ borderTop: "1px solid #334155" }}
      >
        <UserButton
          appearance={{
            elements: { avatarBox: "w-8 h-8" },
          }}
        />
        <div className="min-w-0">
          <div className="text-xs text-slate-300 font-medium truncate">
            {user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? ""}
          </div>
          <div className="text-xs text-slate-600 truncate">
            {user?.emailAddresses[0]?.emailAddress ?? ""}
          </div>
        </div>
      </div>
    </aside>
  );
}
