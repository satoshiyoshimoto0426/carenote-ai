"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SharingStatus from "@/components/SharingStatus";
import {
  IconFileText,
  IconHelpCircle,
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
  { href: "/guide", label: "使い方", icon: IconHelpCircle },
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
        background: "var(--surface-2)",
        borderRight: "1px solid var(--line)",
        width: "100%",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <div className="text-[17px] font-bold leading-tight tracking-[0.04em] text-[var(--ink)]">
          CareNote
        </div>
        <div className="mt-1 text-[11px] tracking-[0.12em] text-[var(--faint)]">ケア記録支援</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13.5px] leading-none transition-colors ${
                active
                  ? "bg-[var(--card)] font-bold text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)]"
                  : "text-[var(--muted)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon
                className={`flex-shrink-0 ${active ? "text-[var(--green)]" : "text-[var(--faint)]"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* 名簿の共有範囲（黒塗りが事業所ぶんで効いているか）を常に見せる */}
      <SharingStatus />

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
          <div className="truncate text-[12.5px] font-bold text-[var(--ink)]">
            {user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? ""}
          </div>
          <div className="truncate text-[11px] leading-snug text-[var(--faint)]">
            {user?.emailAddresses[0]?.emailAddress ?? ""}
          </div>
        </div>
      </div>
    </aside>
  );
}
