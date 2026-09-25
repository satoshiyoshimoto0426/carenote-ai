/**
 * 点検の履歴（evaluations 表の file_name 列）に保存する名前。職員が選んだ元のファイル名は使わない。
 *
 * なぜ固定の名前か: PDF の名前には利用者の実名が入ることがある（例「山田太郎_ケアプラン.pdf」）。以前は元の名前を
 *   そのまま保存し、点検の履歴（app/(dashboard)/dashboard/page.tsx）に表示していた（Issue #10・2026-09-25 修正）。
 *   点検の経路は名簿を読まないので名前の記号化が効かない。置き換えではなく「保存しない」を選んだ。
 * なぜサーバーで決めるか: 画面（app/(dashboard)/evaluate/page.tsx）はもう送らないが、古い画面や別の送り手が送っても
 *   サーバーは受け取った名前を読まない（app/api/evaluate/route.ts）。
 * 何と繋がるか: lib/db.ts saveEvaluation・tests/api/evaluate.route.test.ts（実名入りの名前が保存・AI・ログに出ないことを固定）。
 *   修正前に保存された行には元の名前が残り、履歴の画面にも出る。列を外すか・保存済みの名前を消すかは
 *   吉本さんの判断（docs/TASK-LEDGER.md「決めること」6 の②・T-UI-15）。
 */
export const EVALUATION_STORED_FILE_NAME = "資料";
