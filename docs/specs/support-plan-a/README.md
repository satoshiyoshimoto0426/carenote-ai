# 就労A型の個別支援計画書（原案）── 単独の画面の仕様（段階2）

> 面談の文字起こしから、事業所の様式「個別支援計画書（就労継続支援A型事業所）」（10章立て）どおりの**原案**を作り、
> 印刷・PDF に保存する画面。原案はサービス管理責任者が確かめて仕上げる。
> 進み具合と次の一手の正本は [`../../TASK-LEDGER.md`](../../TASK-LEDGER.md) の T-SPA-01。コードの地図は
> [`../../CONTEXT-MAP.md`](../../CONTEXT-MAP.md)「就労A型 個別支援計画（単独の公開先）」。
> ログインなしの試行版を公開する手順（PowerShell に貼るだけ）は [`DEPLOY.md`](DEPLOY.md)。

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
- 送る文章は CareNote と同じ黒塗りを通る（`/api/preview` と `/api/generate` が同じ `maskRequestBody`）。ただし単独の版には
  **名簿が無い**ので、電話番号などの型は置き換わるが、**人の名前は置き換わらない**。名前らしい語は送る前の画面で赤い候補として
  人が確かめる（独立審査 2026-10-04 中2）。試行は架空のデータだけで行う（ログインなしの版は画面の上にも注意を出す）。
- 様式の表示は `sandbox="allow-scripts allow-modals"` の iframe（`allow-same-origin` を付けない）。CDN から読む Paged.js・書体が、
  画面のログイン情報に触れないため。印刷は親の画面からの合図（postMessage）で開く。
- ログイン: 印 `on` の版は CareNote と同じ Clerk のログインが要る。印 `open` の版（ログインなしの試行版・2026-10-05 吉本さんの決定
  「営業の際にログインが手間」）は、`middleware.ts` がこの画面と3つの道（`/api/preview`・`/api/generate`・`/api/transcribe`）だけを
  ログインなしで通す。3つの道はログインしていない人を中で絞る（`lib/supportPlan/guestAccess.ts`）:
  - 送る前の確認と原案づくりは、計画書（documentType `supportPlanA`）以外は 401。名簿は読まない。
    原案づくりは**全員で1日30回・同じ IP アドレスから1時間10回**（IPv6 は前の64ビットで数える）。
  - 文字起こしは書類の種類を見ない（音声だけを受け取る道）。そのかわり1回の音声は3MB（画面の録音の1区切り）まで、
    全員で1日 約20時間分（音声の大きさの合計）・同じ IP から1時間30回まで。
  - 文の長さは**黒塗りの前に**上限（1欄4万字・合計6万字）で断る（413）。送る前の確認は `maxDuration` 30秒。
    黒塗りのメールの型は長さに上限を付けた（上限が無いと長い英数字の並びで長さの2乗の時間がかかり、計算の枠を
    使い切って本番まで止めうる形だった ── 独立審査 2026-10-08 重大1・見張りは `lib/privacy/maskSpeed.test.ts`）。
  - ゲストの頼みは試行版の画面そのものからだけ受ける: Origin・Sec-Fetch-Site が自分と違えば 403、JSON でなければ 415
    （別のサイトに来た人のブラウザに頼みを送らせ、IP ごとの上限をすり抜けるのを防ぐ ── 同 中2）。
  - 本番の名前（carenote-ai.vercel.app など・`edition.ts` の `PRODUCTION_HOSTS` と `VERCEL_PROJECT_PRODUCTION_URL`）では、
    印が open の版が付け替えられてもログインなしの道を開かない。GitHub からのビルドに印が入っていたら `next.config.ts` がビルドを止める（同 中3）。
  回数はサーバーの実体ごとの記憶で数えるので、きっちりの上限ではなく目安の歯止め（実体が分かれる・入れ替わると数え直し）。
  意図して攻める人を確実に止められるのは AI 会社側の利用額の上限だけ。CareNote の利用者・書類の道（`/api/clients` など）は、
  試行版でもログインが要る（`tests/middleware.test.ts` が app/api の道を全部たどって確かめる）。

## 4. 公開の仕方（決定②）

- **同じコード**を、印 `NEXT_PUBLIC_SUPPORT_PLAN_A` を付けてビルドし、**別の URL** に出す。値は3つ:
  `on`（前の名前 `standalone` も同じ意味）＝計画書だけ・ログインあり／`open`＝計画書だけ・**ログインなし**／それ以外＝今の CareNote。
  `NEXT_PUBLIC_` の値は**ビルドの時に**埋め込まれるので、値を変えたら作り直しが要る。
- 試行（2026-10-04〜）の出し方（decisions-log 2026-10-04・10-05）: 今の CareNote と**同じ Vercel プロジェクト**の別のデプロイ。
  ログイン（Clerk の開発用の環境）・DB（Supabase）・AI の鍵は CareNote 本番と**共用**（吉本さん承認）。
  公開は吉本さんが PowerShell で実行する（Claude の `vercel deploy --prod` はアプリの安全装置が止めるため）。
  **手順は [`DEPLOY.md`](DEPLOY.md) の枠をまるごと貼るだけ**（書き換える所は無い・2026-10-05 にこの形で公開して6点とも OK）。
  枠がしていること: `main` の最新を zip で **.git の無い置き場**に取り出す（Hobby の「Deployment Blocked」を避ける・
  日本語のファイル名を化かさない）→ `carenote-ai\.vercel` を写す →
  `vercel deploy --prod --skip-domain -b NEXT_PUBLIC_SUPPORT_PLAN_A=open`（`--skip-domain` で carenote-ai.vercel.app は動かない。
  管理画面では「Production Staged」）→ 試行版と本番の6点を確かめる。なぜこの形か（つまずいた所）は DEPLOY.md §5。
  試行版の URL は公開のリポジトリ（この repo を含む）に書かない（広まると AI の残高が減る）。
- してはいけないこと: 印を Vercel のプロジェクト設定の環境の値に入れる（次に main へ push したとき、本番が計画書だけの版になる）／
  試行のデプロイを Promote・Instant Rollback の行き先に選ぶ（本番の URL が計画書だけの版に変わる）。
- 印が on / open の版では: 「/」→ `/support-plan-a`、CareNote の画面（利用者・つくる・点検・使い方）→ `/support-plan-a`。
  画面の上に「個別支援計画（就労A型）」とログアウトのボタン（ログインしていなければ出ない）。open の版は「架空のデータだけで」の注意も出す。
- 印の無い今の本番（carenote-ai.vercel.app）: `/support-plan-a` は 404、「/」は利用者の一覧、ログインなしの道は1本も開かない
  （`tests/middleware.test.ts`）。ただし `/api/generate`・`/api/extension/generate` は documentType `supportPlanA` を受け付ける
  （ログインと黒塗りは同じなので害は無い ── 独立審査 2026-10-04 小1）。
- 共用している間の注意: 試行版でログインした人は CareNote 本番にも同じアカウントで入れる（見えるのは自分の範囲だけ）。
  試行の参加者を CareNote の事業所（Clerk の組織）に入れない。AI の残高は CareNote 本番と同じ財布なので、試行の前に残高を確かめる。
  本物のデータを扱う前に、ログイン・DB・鍵を CareNote 本番と分ける（台帳 T-SPA-01「案A」の本来の形）。
- 文章の長さの上限は CareNote と同じ（1つの欄 4万字・合計 6万字。超えると `/api/generate` が 413 と日本語の文を返す ── `lib/generation/dispatch.ts`）。

## 5. コードと試験

| 何 | どこ | 試験 |
|---|---|---|
| 印の読み取り | `lib/supportPlan/edition.ts` | `edition.test.ts`・`app/page.test.ts`・`app/(dashboard)/layout.test.tsx`・`app/support-plan-a/layout.test.tsx` |
| ログインなしの試行版（道の開け閉め・ゲストの受け付け・回数の上限） | `middleware.ts`・`lib/supportPlan/guestAccess.ts`・`app/api/{preview,generate,transcribe}/route.ts` | `tests/middleware.test.ts`・`guestAccess.test.ts`・`tests/api/generate.route.test.ts`・`tests/api/transcribe.route.test.ts` |
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
