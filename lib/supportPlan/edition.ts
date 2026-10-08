/**
 * 就労A型の個別支援計画書を単独で公開する版（エディション）かどうかを決める、ビルド時の環境の印。
 *
 * なぜあるか: 2026-10-03 吉本さんの決定②「今の CareNote AI のメニューには足さず、単独で出す」。
 *   同じプログラムを、印 NEXT_PUBLIC_SUPPORT_PLAN_A を付けて**別の URL**に公開する。
 *   試行（2026-10-04〜）は同じ Vercel プロジェクトの別のデプロイ（`vercel deploy --prod --skip-domain -b …`）で、
 *   ログイン・DB・AI の鍵は CareNote 本番と共用（decisions-log 2026-10-04）。
 *   印が無い今の本番（carenote-ai.vercel.app）では、計画書の画面は 404 のまま・CareNote の画面は今までどおり。
 * 印の値は3つ（それ以外 ── 未設定・"ON"・"true"・空白つきなどの打ち間違い ── はすべて off）:
 *   - "on"（前の名前 "standalone" も同じ意味）… 計画書の画面だけの版。ログインは CareNote と同じ Clerk が要る
 *   - "open" … 上と同じ画面を**ログインなし**で使える試行版（2026-10-05 吉本さんの決定「営業の際に手間」・decisions-log）。
 *     ログインしていない人に開くのは計画書の画面と、それが使う3つの道（/api/preview・/api/generate の
 *     documentType "supportPlanA"・/api/transcribe）だけ。AI の回数は lib/supportPlan/guestAccess.ts が1日30回までに絞る。
 * 印が on / open の版でしていること（docs/specs/support-plan-a/README.md「公開の仕方」）:
 *   - app/support-plan-a/page.tsx … 計画書の画面を開ける（off なら notFound）
 *   - app/page.tsx … 「/」を計画書の画面へ送る
 *   - app/(dashboard)/layout.tsx … CareNote の画面（利用者・つくる・点検・使い方）に入ったら計画書の画面へ送る
 *   - middleware.ts … open のときだけ、上の画面と3つの道をログインなしで通す（それ以外は今までどおりログインが要る）
 * NEXT_PUBLIC_ の値は Next.js がビルドの時に埋め込む。process.env.NEXT_PUBLIC_SUPPORT_PLAN_A と字のまま書くこと
 *   （分解・別名にすると埋め込まれず、ブラウザ側で常に off になる）。
 */

/** 計画書の画面の道（URL）。振り分けの行き先と、画面の置き場所 app/support-plan-a/ はこれに合わせる */
export const SUPPORT_PLAN_A_PATH = "/support-plan-a";

/** 印の読み方: off＝今の CareNote／login＝計画書だけ・ログインあり／open＝計画書だけ・ログインなし */
export type SupportPlanAMode = "off" | "login" | "open";

/**
 * 印の値（文字）を読み、どの版かを返す。迷ったら off（今の CareNote のまま）に倒す。
 * 引数を省くと、ビルド時に埋め込まれた NEXT_PUBLIC_SUPPORT_PLAN_A を読む（試験では値を渡すか vi.stubEnv で変える）。
 */
export function supportPlanAMode(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): SupportPlanAMode {
  if (value === "open") return "open";
  if (value === "on" || value === "standalone") return "login";
  return "off";
}

/** 計画書を単独で公開する版（ログインの有無は問わない）なら true */
export function isSupportPlanAEdition(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): boolean {
  return supportPlanAMode(value) !== "off";
}

/** ログインなしで使える試行版（印 "open"）なら true。middleware.ts と3つの道が見る */
export function isSupportPlanAOpen(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): boolean {
  return supportPlanAMode(value) === "open";
}

/**
 * CareNote 本番の名前（Vercel の本番の別名）。この名前では、印が open でもログインなしの道を開かない。
 * 下の「開いてよい名前」の決まりにも当たらないが、二重の歯止めとして名指しでも閉じる（独立審査 2026-10-08 中3）。
 */
export const PRODUCTION_HOSTS: readonly string[] = [
  "carenote-ai.vercel.app",
  "carenote-ai-satoshiyoshimoto0426s-projects.vercel.app",
  "carenote-ai-git-main-satoshiyoshimoto0426s-projects.vercel.app",
];

/**
 * ログインなしの道を開いてよい名前（許す名前だけを開く ── 独立審査 2026-10-08 再審査 小1:
 * 「本番の名前を除く」形だと、知らない別名・末尾の点つきの名前などで開いてしまう余地が残る）。
 * - 試行版は `vercel deploy --prod --skip-domain` の、デプロイごとの URL（carenote-<英数字8〜12字>-satoshiyoshimoto0426s-projects.vercel.app）で使う。
 *   本番の別名（carenote-ai…）は「carenote-」の後が英数字だけではないので当たらない。末尾の点つきなど形の違う名前も当たらない（閉じる側）。
 * - 手元での動作確認（localhost・127.0.0.1）。
 * 試行版に覚えやすい別名を付けるときは、ここに名指しで足す（足さなければログインが要るまま＝止まる側）。
 */
const PILOT_DEPLOYMENT_HOST =
  /^carenote-[a-z0-9]{8,12}-satoshiyoshimoto0426s-projects\.vercel\.app$/;
const LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

/**
 * ログインなしの道を、この名前（hostname）で開いてよいか。印が open で、本番の名前ではなく、開いてよい名前のときだけ true。
 * 使う所: middleware.ts（道の開け閉め）・3つの道（app/api/{preview,generate,transcribe}/route.ts）のゲストの受け付け・
 * 画面の外枠（app/support-plan-a/layout.tsx の「試行版（ログインなし）」の注意）。
 */
export function isOpenPilotAt(
  hostname: string,
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): boolean {
  if (!isSupportPlanAOpen(value)) return false;
  const host = hostname.toLowerCase();
  if (PRODUCTION_HOSTS.includes(host)) return false;
  return PILOT_DEPLOYMENT_HOST.test(host) || LOCAL_HOSTS.includes(host);
}

/** 試行版のビルドだと名乗る目印（DEPLOY.md の枠が `-b SUPPORT_PLAN_A_PILOT_BUILD=1` で付ける） */
export const PILOT_BUILD_MARKER = "SUPPORT_PLAN_A_PILOT_BUILD";

/**
 * ビルドの歯止め（next.config.ts が呼ぶ）: 計画書の印があるのに、試行版のビルドの目印（PILOT_BUILD_MARKER=1）が無いか、
 * GitHub からのビルド（VERCEL_GIT_COMMIT_SHA がある）なら、止める理由の文を返す。
 * なぜ: 印を Vercel のプロジェクト設定の環境の値に入れてしまうと、次の main への push で本番が計画書だけの版になる（中3）。
 *   目印で見るのは、VERCEL_GIT_COMMIT_SHA が Vercel の設定（System Environment Variables を渡すか）しだいで来ないことがあり、
 *   それに頼ると黙って効かなくなるため（独立審査 2026-10-08 再審査 中4）。目印が無ければ止まる＝止める側に倒れる。
 * 手元で印つきのビルドを試すときも、目印を付ける（SUPPORT_PLAN_A_PILOT_BUILD=1）。
 */
export function pilotFlagBuildError(env: Record<string, string | undefined>): string | null {
  const flag = env.NEXT_PUBLIC_SUPPORT_PLAN_A;
  if (!isSupportPlanAEdition(flag)) return null;
  if (env[PILOT_BUILD_MARKER] === "1" && !env.VERCEL_GIT_COMMIT_SHA) return null;
  return `計画書の印 NEXT_PUBLIC_SUPPORT_PLAN_A=${flag} が、試行版の出し方（docs/specs/support-plan-a/DEPLOY.md の枠・目印 ${PILOT_BUILD_MARKER}=1 つき）ではないビルドに入っています。本番が計画書だけの版になるのを防ぐため、ビルドを止めました。Vercel のプロジェクト設定の環境の値に印が入っていれば消してください。`;
}
