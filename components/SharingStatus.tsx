"use client";

import { OrganizationSwitcher, useOrganization } from "@clerk/nextjs";

/**
 * 「いま名簿が事業所で共有されているか」を常に見えるようにする表示（独立審査 2026-09-13 critical）。
 *
 * なぜ必要か:
 *   黒塗りは名簿にある名前しか消せない。名簿が事業所ぶんになるのは、Clerk が
 *   **アクティブな組織**（いま選んでいる事業所）を返しているときだけで、組織に「所属」して
 *   いるだけでは足りない。ところが、それが効いているかどうかを職員が知る手段がまったく無く、
 *   マニュアルだけが「組織に所属していれば共有されます」と書いていた。
 *   共有が効いていないまま複数人で使うと、同僚が登録した利用者の実名がそのまま AI へ出る。
 *
 * ここでやること:
 *   ① いまの状態（有効／自分の登録分のみ）を常時表示する
 *   ② 事業所を選べていないなら、その場で選べるようにする（OrganizationSwitcher）
 *
 * 接続先: components/Sidebar.tsx（PC の左メニュー下部）と app/(dashboard)/layout.tsx（スマホの上部）。
 * サーバ側の実際の絞り込みは lib/db/clients.ts の scopeExpr。
 */
export default function SharingStatus() {
  const { organization, isLoaded } = useOrganization();

  if (!isLoaded) return null;

  const shared = Boolean(organization);
  return (
    <div className="px-4 py-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block rounded-full"
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            background: shared ? "#15604D" : "#B45309",
          }}
        />
        <span className="text-[11px] font-medium text-[var(--ink)]">
          {shared ? "名簿を事業所で共有中" : "名簿は自分の登録分のみ"}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--faint)]">
        {shared ? (
          <>
            {organization?.name} のみなさんが登録した利用者の名前が置き換わります。
            ただし事業所を作る前に登録した利用者は、管理者が移行するまで含まれません。
          </>
        ) : (
          <>
            ほかの職員が登録した利用者の名前は<strong>置き換わりません</strong>
            （実名のままAIへ送られます）。複数人で使うときは、下から事業所を選んでください。
          </>
        )}
      </p>
      <div className="mt-2">
        <OrganizationSwitcher
          hidePersonal={false}
          appearance={{ elements: { rootBox: "w-full", organizationSwitcherTrigger: "w-full" } }}
        />
      </div>
    </div>
  );
}
