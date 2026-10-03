# 就労A型の個別支援計画書（原案）── 単独の画面の仕様（段階2）

> 面談の文字起こしから、事業所の様式「個別支援計画書（就労継続支援A型事業所）」（10章立て）どおりの**原案**を作り、
> 印刷・PDF に保存する画面。原案はサービス管理責任者が確かめて仕上げる。
> 進み具合と次の一手の正本は [`../../TASK-LEDGER.md`](../../TASK-LEDGER.md) の T-SPA-01。コードの地図は
> [`../../CONTEXT-MAP.md`](../../CONTEXT-MAP.md)「就労A型 個別支援計画（単独の公開先）」。

## 1. 決まっていること（2026-10-03 吉本さん）

| | 決定 | 画面・コードでの形 |
|---|---|---|
| ① | 面談を終えてから AI に**1回だけ**送って原案を作る。話しながら途中の原案は作らない。送る前に人が文章を確かめる今の決まりを守る | 「面談を終える」→ 送る前の確認（`/api/preview`）→「この内容で AI に送る」→ `/api/generate` の1回。面談中の「話に出たかの目安」はパソコンの中だけで判定（AI を使わない） |
| ② | 今の CareNote AI のメニューには足さず、**単独で出す**。同じプログラムを、ビルド時の環境の印 `NEXT_PUBLIC_SUPPORT_PLAN_A=on` を付けて**別の URL** に公開する。印が無い今の本番（carenote-ai.vercel.app）では出さない（404） | 下の「4. 公開の仕方」 |
| ③ | カイポケへの流し込みは無し | 流し込み・カイポケの様式は作らない |
| ④ | 表紙と出典の注記は「面談の録音の文字起こし（{利用者コード} アセスメント面談）」をもとに作成、で OK | この画面で録音したときの書き方。録音せず文字起こしを貼り付けた・手で書いたときは「面談の記録（{利用者コード} アセスメント面談）」（録音していない物を録音と書かないため） |
| ⑤ | 保存・承認は次の段階（段階3）。段階2では保存しない | 文字起こし・原案は画面の中（メモリ）だけ。閉じる前にブラウザが確かめる。残すときは印刷・PDF |

同じ日の決定のうち、品質ルール（`lib/rules/supportPlanA.ts` v0.1）を実際のサービス管理責任者に見てもらうこと・
10/4 ごろの仲間内の試行は、台帳 T-SPA-01 にある（台帳の決定の番号は、この表と並びが違う）。

## 2. 画面の流れ（`/support-plan-a`）

1. **計画の情報**: 利用者コード（必須・英数字とハイフンだけ・20字まで。全角は半角に直す）、表紙の呼び名
   （空なら「利用者」＋コードの先頭の英字。例 K-014 → 利用者K）、計画番号（任意）、計画期間（既定: 来月1日〜6か月後の前日）、
   作成日（既定: 今日）、家族の同席。上に注意書き「氏名・受給者証番号は入れないでください（計画書には利用者コードだけを書きます）」。
2. **基本情報**（任意・文字）: 年齢・性別・障害種別・障害等級・手帳・契約形態（既定「雇用契約（A型）」）・入所年月日・通所歴・
   勤務日数・勤務時間・時給・月平均賃金。名簿の代わり（1章に、面談の話より優先して書く）で、AI に渡す「利用者の基本情報」の文にもなる。
3. **本人への説明と同意**（チェック）。チェックするまで録音できず、「面談を終える」も進まない。
4. **面談**: 録音（CareNote と同じ録音の部品。5分区切りで文字にして欄の末尾へ足す。表示スイッチ
   `NEXT_PUBLIC_CARENOTE_RECORDING=on` のときだけ出る）と、文字起こしの欄（手で直せる・貼り付けもできる。録音が無い版でも使える）。
   横に**面談の進め方**: 様式の順の話題（1 基本情報〔入力欄から〕／2 仕事・暮らしの希望・家族／3-1 作業面／3-2 心理・社会参加面／
   3-3 健康面／5・6 目標／7 配慮／8 関係機関）と聞き方の例、「話に出たかの目安」（言葉が出たかだけ。十分に聞けたかは判定しない）。
5. **面談を終える** → 送る前の確認（黒塗りした文章を見る）→「この内容で AI に送る」→ 30秒〜1分。
6. **結果**: 左に様式どおりの表示（表紙・目次・10章。Paged.js でページに組む）、右に「要記入」の一覧（章ごと）と
   「AI からの確認のお願い」。「印刷・PDFに保存」「面談の文字起こしに戻る」「最初からやり直す」。
   「この画面は保存しません。PDF に保存してください」の注記。
7. **失敗の表示**: サーバーの日本語の文をそのまま出す（422＝名前が残っていて送れない、413＝長すぎる、402＝AI の利用枠 など）。
   通信が切れた・JSON でない返事も日本語で出す。

## 3. 安全のための作り

- 氏名・受給者証番号は受け取らない（様式の ID化の原則）。利用者コードは AI に送らない（表紙・様式の側で書く）。
- 送る文章は CareNote と同じ黒塗り（`/api/preview` と `/api/generate` が同じ `maskRequestBody` を通る）。
- 様式の表示は `sandbox="allow-scripts allow-modals"` の iframe（`allow-same-origin` を付けない）。CDN から読む Paged.js・書体が、
  画面のログイン情報に触れないため。印刷は親の画面からの合図（postMessage）で開く。
- ログインは CareNote と同じ Clerk（`middleware.ts` は変えていない）。

## 4. 公開の仕方（決定②）

- **同じコード**を、別の Vercel のプロジェクトでビルドする。そのプロジェクトの環境の値に `NEXT_PUBLIC_SUPPORT_PLAN_A=on`
  （前の名前 `standalone` も同じ意味で受け付ける）。`NEXT_PUBLIC_` の値は**ビルドの時に**埋め込まれるので、値を変えたら作り直し（Redeploy）が要る。
- 印が on の版では: 「/」→ `/support-plan-a`、CareNote の画面（利用者・つくる・点検・使い方）→ `/support-plan-a`、
  計画書の画面の上に「個別支援計画（就労A型）」とログアウトのボタン。
- 印の無い今の本番（carenote-ai.vercel.app）は何も変わらない: `/support-plan-a` は 404、「/」は利用者の一覧。
- 単独の版のログイン（Clerk）・DB（Supabase）・AI の鍵は、CareNote 本番とは別に用意する（台帳 T-SPA-01「案A」）。
- 印が on の版でも、CareNote の API（`/api/clients` など）は URL を打てば呼べる（画面から行く道は無い。ログインは要る）。
  案A のとおり別の DB を用意すれば、CareNote 本番のデータには届かない（DB を CareNote 本番と同じにすると届くので、そうしない）。
- 文章の長さの上限は CareNote と同じ（1つの欄 4万字・合計 6万字。超えると `/api/generate` が 413 と日本語の文を返す ── `lib/generation/dispatch.ts`）。

## 5. コードと試験

| 何 | どこ | 試験 |
|---|---|---|
| 印の読み取り | `lib/supportPlan/edition.ts` | `edition.test.ts`・`app/page.test.ts`・`app/(dashboard)/layout.test.tsx`・`app/support-plan-a/layout.test.tsx` |
| 画面の外枠・入口 | `app/support-plan-a/{layout,page}.tsx` | `app/support-plan-a/layout.test.tsx` |
| 画面 | `components/supportPlan/SupportPlanAWorkbench.tsx` | `SupportPlanAWorkbench.live.test.tsx`（jsdom で通す） |
| 入力欄 → 名簿・AI への文・様式の外の値 | `lib/supportPlan/standalone.ts` | `standalone.test.ts` |
| 話に出たかの目安 | `lib/supportPlan/coverage.ts` | `coverage.test.ts` |
| 要記入の一覧 | `lib/supportPlan/pending.ts` | `pending.test.ts` |
| 送信と失敗の日本語 | `lib/supportPlan/request.ts` | `request.test.ts` |
| 様式の値・描画・印刷用ページ | `lib/supportPlan/format.ts`・`components/supportPlan/{SupportPlanDocument.tsx,printCss.ts,printHtml.ts}` | `format.test.ts`・`SupportPlanDocument.test.tsx`・`printHtml.test.ts` |
| AI の指示・JSON の決まり | `lib/rules/supportPlanA.ts`・`lib/generation/supportPlanA{,Prompt}.ts`・`dispatch.ts`（documentType `supportPlanA`） | `supportPlanA.test.ts`・`dispatch.test.ts`・本物の API の試験 `scripts/supportPlanAGeneration.itest.ts`（手動・課金あり） |
| 操作動画の台本 | [`VIDEO-SCRIPT.md`](VIDEO-SCRIPT.md)・`tools/shoot-plans.mjs` の `spa1` | `lib/manual/supportPlanVideoScript.test.ts` |

## 6. まだ決めていないこと・次の段階

- 段階3: 保存・承認（どこに・誰が承認するか）。
- 品質ルール v0.1 の監修（実際のサービス管理責任者に見てもらう）。
- 設計書 v0.1（要件定義・設計書の PDF）はリポジトリの外にある（台帳 T-SPA-01 の根拠の欄）。`dispatch.ts` のコメントが指す「8.2」はその節。
