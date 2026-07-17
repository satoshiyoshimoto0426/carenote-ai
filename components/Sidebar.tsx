"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconFileText,
  IconHome,
  IconLayers,
  type IconProps,
  IconSearch,
  IconUsers,
} from "@/components/ui/icons";

/**
 * Primary navigation entries. Icons are the shared line-icon set
 * (components/ui/icons.tsx) — emoji are banned in UI by design system v0.
 */
const NAV: { href: string; label: string; icon: (props: IconProps) => React.JSX.Element }[] = [
  { href: "/dashboard", label: "ダッシュボード", icon: IconHome },
  { href: "/clients", label: "利用者", icon: IconUsers },
  { href: "/create", label: "作成する", icon: IconFileText },
  { href: "/rescue", label: "救済モード", icon: IconLayers },
  { href: "/evaluate", label: "評価する", icon: IconSearch },
];

/**
 * App sidebar (md+ only; the mobile top bar lives in app/(dashboard)/layout.tsx).
 * Warm off-white surface with hairline right border, mincho logo, and a
 * Clerk UserButton block pinned to the bottom.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        background: "#FCFBF9",
        borderRight: "1px solid var(--line)",
        width: "100%",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <div
          className="text-lg leading-tight text-[var(--ink)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          CareNote
        </div>
        <div className="mt-0.5 text-[11px] tracking-[0.12em] text-[var(--faint)]">ケア記録支援</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[#EEF4F1] font-semibold text-[#15604D]"
                  : "text-[#6B6862] hover:bg-[#F2F0EA] hover:text-[var(--ink)]"
              }`}
            >
              <Icon className="flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ borderTop: "1px solid var(--line-soft)" }}
      >
        <UserButton
          appearance={{
            elements: { avatarBox: "w-8 h-8" },
          }}
        />
        <div className="min-w-0">
          <div className="text-xs font-medium text-[var(--ink)] truncate">
            {user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? ""}
          </div>
          <div className="text-xs text-[var(--faint)] truncate">
            {user?.emailAddresses[0]?.emailAddress ?? ""}
          </div>
        </div>
      </div>
    </aside>
  );
}
