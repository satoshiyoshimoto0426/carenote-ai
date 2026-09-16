"use client";

import { OrganizationSwitcher, useOrganization } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerkAppearance";

/**
 * 「いま名簿が事業所で共有されているか」を常に見えるようにする表示（独立審査 2026-09-13 critical）。
 *
 * なぜ必要か:
 *   黒塗りは名簿にある名前しか消せない。名簿が事業所ぶんになるのは、Clerk が
 *   **アクティブな組織**（いま選んでいる事業所）を返しているときだけで、組織に「所属」して
 *   いるだけでは足りない。それが効いているかを職員が知る手段が無いまま、マニュアルだけが
 *   「所属していれば共有されます」と書いていた。効いていない状態で複数人が使うと、
 *   同僚が登録した実名がそのまま AI へ出る。
 *
 * 見た目の方針（2026-09-16 作り直し）:
 *   初版は 11px の灰色文字が5行並ぶ塊で、**読まれない情報**になっていた。
 *   常時見えるべきは「効いている / 効いていない」の1点だけなので、色つきのチップに縮めた。
 *   詳しい説明は効いていないときだけ出す（そのときこそ読む必要がある）。
 *
 * 接続先:
 *   - components/Sidebar.tsx（PC の左メニュー下部）= variant "full"
 *   - app/(dashboard)/layout.tsx（スマホの本文先頭）= variant "compact"
 *     左メニューは 768px 未満で消えるので、スマホにも必ず出す。
 *   サーバ側の実際の絞り込みは lib/db/clients.ts の scopeExpr。
 */
export default function SharingStatus({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { organization, isLoaded } = useOrganization();
  const shared = Boolean(organization);
  const compact = variant === "compact";

  // 切り替え中は isLoaded が false に戻る。場所を確保したまま状態だけ変える
  const tone = !isLoaded
    ? { bg: "var(--surface-2)", line: "var(--line)", dot: "var(--faint)" }
    : shared
      ? { bg: "var(--green-soft)", line: "var(--green-line)", dot: "var(--green)" }
      : { bg: "var(--amber-soft)", line: "var(--amber-line)", dot: "var(--amber)" };

  return (
    <div className={compact ? "" : "px-3 pb-3 pt-1"}>
      <div
        className="rounded-[9px] px-3 py-2.5"
        style={{ background: tone.bg, border: `1px solid ${tone.line}` }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block flex-shrink-0 rounded-full"
            style={{ width: 7, height: 7, background: tone.dot }}
          />
          <span className="text-[12px] font-bold text-[var(--ink)]">
            {!isLoaded ? "共有状態を確認中" : shared ? "事業所で共有中" : "自分の登録分のみ"}
          </span>
        </div>

        {isLoaded && shared && (
          <p className="mt-1 pl-[15px] text-[11.5px] leading-snug text-[var(--muted)]">
            {organization?.name}
          </p>
        )}

        {isLoaded && !shared && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
            ほかの職員が登録した利用者の名前は<strong>置き換わりません</strong>。
            複数人で使うときは、下から事業所を選んでください。
          </p>
        )}

        <div className="mt-2">
          <OrganizationSwitcher
            hidePersonal={false}
            afterSelectOrganizationUrl="/clients"
            afterSelectPersonalUrl="/clients"
            appearance={{
              ...clerkAppearance,
              elements: {
                ...clerkAppearance.elements,
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-between px-2 py-1 rounded-[7px] hover:bg-[var(--card)]",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
