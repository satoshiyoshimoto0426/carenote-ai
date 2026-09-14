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
 *   共有が効いていないまま複数人で使うと、同僚が登録した実名がそのまま AI へ出る。
 *
 * 接続先:
 *   - `components/Sidebar.tsx`（PC の左メニュー下部）= variant "full"
 *   - `app/(dashboard)/layout.tsx`（スマホの本文先頭）= variant "compact"
 *     左メニューは 768px 未満で消えるので、スマホにも必ず出す（配布文書がそう書いている）。
 *   サーバ側の実際の絞り込みは `lib/db/clients.ts` の scopeExpr。
 *
 * 言い切らないこと:
 *   事業所を選べていても「その事業所に同僚が入っているか」までは画面からは分からない。
 *   職員が自分用の組織を作ってしまうと「共有中」と出るのに誰とも共有されない ── だから
 *   文言は「この事業所に入っている職員のあいだで」と範囲を限定し、確認先を書く。
 */
export default function SharingStatus({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { organization, isLoaded } = useOrganization();

  // 切り替えの最中は isLoaded が false に戻る。何も出さないと「一番見たい瞬間に消える」ので、
  // 読み込み中であることを出したまま場所を確保する。
  const shared = Boolean(organization);
  const compact = variant === "compact";

  return (
    <div
      className={compact ? "" : "px-4 py-3"}
      style={compact ? undefined : { borderTop: "1px solid var(--line-soft)" }}
    >
      <div
        className={compact ? "flex items-center gap-2 rounded-[10px] px-3 py-2" : ""}
        style={
          compact
            ? {
                background: shared ? "#EEF4F1" : "#FEF6EC",
                border: `1px solid ${shared ? "#CFE0D8" : "#F0D9B5"}`,
              }
            : undefined
        }
      >
        <span
          aria-hidden="true"
          className="inline-block rounded-full"
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            background: !isLoaded ? "#9CA3AF" : shared ? "#15604D" : "#B45309",
          }}
        />
        <span className={`${compact ? "text-xs" : "text-[11px]"} font-medium text-[var(--ink)]`}>
          {!isLoaded
            ? "名簿の共有状態を確認しています…"
            : shared
              ? "名簿を事業所で共有中"
              : "名簿は自分の登録分のみ"}
        </span>
      </div>

      {isLoaded && (
        <p
          className={`mt-1 ${compact ? "px-3 text-[11px]" : "text-[11px]"} leading-relaxed text-[var(--faint)]`}
        >
          {shared ? (
            <>
              {organization?.name}{" "}
              に入っている職員のあいだで、登録した利用者の名前が置き換わります。
              事業所を作る前に登録した利用者は、管理者が移行するまで含まれません。
              同僚がこの事業所に入っているかは管理者にご確認ください。
            </>
          ) : (
            <>
              ほかの職員が登録した利用者の名前は<strong>置き換わりません</strong>
              （実名のままAIへ送られます）。複数人で使うときは、下から事業所を選んでください。
            </>
          )}
        </p>
      )}

      <div className={`mt-2 ${compact ? "px-3 pb-2" : ""}`}>
        <OrganizationSwitcher
          hidePersonal={false}
          afterSelectOrganizationUrl="/clients"
          afterSelectPersonalUrl="/clients"
          appearance={{ elements: { rootBox: "w-full", organizationSwitcherTrigger: "w-full" } }}
        />
      </div>
    </div>
  );
}
