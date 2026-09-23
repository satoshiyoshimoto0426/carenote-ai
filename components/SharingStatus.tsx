"use client";

import { OrganizationSwitcher, useOrganization } from "@clerk/nextjs";
import { IconAlert } from "@/components/ui/icons";
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
 * 見た目の方針:
 *   2026-09-16: 常時見えるべきは「効いている / 効いていない」の1点だけなので、点と短い言葉に縮め、
 *   詳しい説明は効いていないときだけ出す（そのときこそ読む必要がある）。
 *   2026-09-23（A案「作業台」）: 左のメニューとスマホの本文先頭にあった2か所の表示をやめ、
 *   **上の帯の右側**（どの幅でも出る）1か所に集めた。説明は帯の中に収まらないので、
 *   効いていないときだけ帯のすぐ下に**畳まずに出す細い帯**（variant "strip"）に分けた。
 *   3つの状態は変えない ── 灰「共有状態を確認中」／緑「事業所で共有中」＋事業所の名前／黄「自分の登録分のみ」。
 *
 * variant:
 *   - "bar": 上の帯の右側。点・言葉・（共有中なら）事業所の名前・Clerk の事業所の切り替え（その場で選べる）。
 *   - "strip": 上の帯のすぐ下。効いていないと分かったときだけ、注意の文を role="status" で出す。
 *     読み込み中・共有中は何も描かない（場所も取らない）。
 *
 * 接続先:
 *   - components/shell/TopBar.tsx が両方を描く（app/(dashboard)/layout.tsx の外枠に入っているので、
 *     ページの側で消すことはできない）。
 *   - サーバ側の実際の絞り込みは lib/db/clients.ts の scopeExpr。
 *   - テスト: components/SharingStatus.test.tsx（3つの状態・注意の帯・切り替えの有無・
 *     文字を隠す指定が切り替えのボタンの中だけに効き、押すと開く一覧の行を消さないか）。
 */
export default function SharingStatus({ variant }: { variant: "bar" | "strip" }) {
  const { organization, isLoaded } = useOrganization();
  const shared = Boolean(organization);

  if (variant === "strip") {
    // 読み込み中は「効いていない」と決めつけない（切り替えの途中でも isLoaded が false に戻る）
    if (!isLoaded || shared) return null;
    return (
      <div role="status" className="sharing-strip">
        <IconAlert size={15} className="sharing-strip-icon" />
        {/* 文と文の間に空白を入れない（日本語では不要）。SharingStatus.test.tsx が全文で確かめる */}
        <p>
          ほかの職員が登録した利用者の名前は<strong>置き換わりません</strong>
          。複数人で使うときは、右上の事業所の切り替えから選んでください。
        </p>
      </div>
    );
  }

  // 切り替え中は isLoaded が false に戻る。場所を確保したまま状態だけ変える
  const tone = !isLoaded ? "var(--faint)" : shared ? "var(--green)" : "var(--amber)";

  return (
    <div className="sharing-bar">
      <span aria-hidden="true" className="sharing-dot" style={{ background: tone }} />
      <span className="sharing-label">
        {!isLoaded ? "共有状態を確認中" : shared ? "事業所で共有中" : "自分の登録分のみ"}
      </span>
      {isLoaded && shared && organization?.name ? (
        <span className="sharing-org" title={organization.name}>
          {organization.name}
        </span>
      ) : null}
      <OrganizationSwitcher
        hidePersonal={false}
        afterSelectOrganizationUrl="/clients"
        afterSelectPersonalUrl="/clients"
        appearance={{
          ...clerkAppearance,
          elements: {
            ...clerkAppearance.elements,
            // 押す場所はスマホでも 44px（min-h-11 / min-w-11）。
            // max-md:[&_.cl-userPreviewTextContainer]:sr-only = 個人のアカウントを選んでいるときの
            // ボタンの中の名前を、スマホでは読み上げにだけ残す（帯からはみ出さないように）。
            // **このボタンの子孫だけ**に効かせる ── Clerk は押すと開く一覧の「個人のアカウント」の行にも
            // 同じ名前（userPreviewTextContainer__personalWorkspace）を使うので、その名前に書くと
            // スマホで一覧の行の文字まで消える（旧指定・A3 の検証 2026-09-23）。
            // ボタンの中で userPreview を使うのは個人のアカウントの表示だけ（事業所は organizationPreview）。
            // __personalWorkspace 付きのクラス名を狙わないのは、Tailwind では _ が空白の意味になるため
            organizationSwitcherTrigger:
              "min-h-11 min-w-11 justify-center rounded-[8px] px-1.5 hover:bg-[var(--active)] max-md:[&_.cl-userPreviewTextContainer]:sr-only",
            // 事業所の名前は左の文字（sharing-org）で見せるので、切り替えのボタンの中では
            // 読み上げにだけ残す（帯の中で同じ名前が2回並ばないように）。事業所の印（画像）と矢印は残す。
            // 名前の後ろの organizationSwitcherTrigger はボタンの中だけの名前（一覧の行は
            // organizationSwitcherActiveOrganization / organizationSwitcherListedOrganization）なので、一覧には効かない
            organizationPreviewTextContainer__organizationSwitcherTrigger: "sr-only",
          },
        }}
      />
    </div>
  );
}
