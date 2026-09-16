/**
 * ログイン・新規登録の外枠。
 *
 * なぜ作り直したか（2026-09-16・吉本さん指摘）:
 *   旧版は「紺色の地に紫→青のグラデーション＋グラデーション文字のロゴ」だった。
 *   これは生成AIが作るUIで最も多い型で、しかもアプリ本体が明るい配色なので
 *   **最初に見る画面だけ配色が違う**という一番まずい状態になっていた。
 *   ここはアプリ本体と同じトークン（app/globals.css）だけで組み、装飾を足さない。
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--paper)" }}
    >
      <div className="mb-7 text-center">
        <div className="text-[19px] font-bold tracking-[0.04em]" style={{ color: "var(--ink)" }}>
          CareNote
        </div>
        <div className="mt-0.5 text-[11px] tracking-[0.1em]" style={{ color: "var(--faint)" }}>
          ケア記録支援
        </div>
      </div>
      {children}
      <p
        className="mt-7 max-w-[34rem] text-center text-[11.5px] leading-relaxed"
        style={{ color: "var(--faint)" }}
      >
        事業所から渡されたアカウントでログインしてください。
        アカウントをお持ちでない場合は、事業所の管理者にお問い合わせください。
      </p>
    </div>
  );
}
