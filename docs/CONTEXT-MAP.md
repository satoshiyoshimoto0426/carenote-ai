# CONTEXT-MAP — carenote-ai（ナレッジグラフ lite）

> AI のコード調査の**第一手**はここと該当 `docs/` を読むこと（横断規約 §2.5-E）。
> 各モジュールが「何を持つか」と「主要な横断接続（データフロー）」を1枚で把握する。
> コード変更で構成・接続が変わったら、同じ PR でここを更新する（Doc-as-Code）。
> プロダクトの正本は [`../SPEC.md`](../SPEC.md)。本書はその実装マップ。

---

## 1. 現状のモジュール構成（何を持つか）

| モジュール | 役割 |
|---|---|
| `middleware.ts` | Clerk 認証ゲート。公開ルート（`/sign-in`, `/sign-up`）以外を保護 |
| `app/(auth)/` | Clerk のサインイン/サインアップ画面 |
| `app/(dashboard)/dashboard/` | 履歴ダッシュボード（過去の評価一覧） |
| `app/(dashboard)/evaluate/` | PDFアップロード＋評価実行 UI（クライアント） |
| `app/api/blob-upload/` | Vercel Blob のアップロード用トークン発行 |
| `app/api/evaluate/` | Claude API でPDFを評価→JSON整形→Supabase保存→Blob削除 |
| `app/api/history/` | ログインユーザーの評価履歴を返す |
| `components/` | UI部品（FileUploader / LoadingProgress / EvaluationResults / CategoryCard / ScoreRing / MiniBar / Sidebar） |
| `lib/db.ts` | Supabase データアクセス（saveEvaluation / getEvaluations / getEvaluationById） |
| `lib/evaluationCriteria.ts` | 評価プロンプト（8カテゴリ・27点満点の採点基準） |
| `lib/exportExcel.ts` | 評価結果の Excel 出力（xlsx） |
| `lib/supabase/{client,server}.ts` | Supabase クライアント（anon＝RLS / service role＝RLSバイパス・サーバ専用） |
| `types/evaluation.ts` | 評価関連の型（EvaluationResult ほか） |
| `supabase/schema.sql` | DB スキーマ（evaluations テーブル） |

## 2. 主要な横断接続（データフロー）

```
[ブラウザ] ──(全リクエスト)──> middleware.ts ──(Clerk)──> 認証チェック
   │
   │ evaluate ページ（client）
   ├─ upload() ─────────────> /api/blob-upload ──> Vercel Blob（PDF一時保管）
   │
   └─ POST ─────────────────> /api/evaluate
                                  ├─ Vercel Blob から PDF 取得
                                  ├─ Claude API（PDF評価・JSON生成）
                                  ├─ lib/db.saveEvaluation ──> Supabase（evaluations）
                                  └─ del(blob)（個人情報保護のため評価後に削除）

[ダッシュボード] ── /api/history ──> lib/db.getEvaluations ──> Supabase
[評価結果画面]   ── lib/exportExcel ──> xlsx ダウンロード
```

外部サービス: **Clerk**（認証）, **Supabase**（DB・RLS）, **Vercel Blob**（PDF一時保管）, **Claude API**（評価＋ケアプラン生成）。

## 3. 作成補助（再定義の本体）── 実装状況

> 詳細と段階フェーズは [`../SPEC.md`](../SPEC.md) を参照。製品の軸は「評価」から「作成補助」へ。

| モジュール | 役割 | 状況 |
|---|---|---|
| `lib/rules/` | **品質エンジン**：帳票別の作成ルール（carePlan / assessment / monitoring）。**v1=吉本（ケアマネ歴13年）の知見ベース**（意向形ニーズ/長期12か月・短期6か月/です・ます体/アセスメント連動・根拠の記録性を最重視）。生成プロンプトへ注入 | v1反映済 |
| `lib/anthropic.ts` | Anthropic SDK クライアント（既定 Opus 4.8、`ANTHROPIC_MODEL` で上書き可） | P1実装済 |
| `lib/generation/structured.ts` | 全帳票共通の生成コア（adaptive thinking＋構造化出力＋プロンプトキャッシュ） | P1実装済 |
| `lib/generation/{carePlan,assessment,monitoring,meetingSummary,supportLog}.ts` | 帳票別の生成（スキーマ＋プロンプト構築。`*Prompt.ts` は純粋関数でテスト済）。第4表=担当者会議の要点、第5表=支援経過も対応。各 generate に `options.rescue` を追加（救済モードで完成形まで埋める） | P1実装済 |
| `lib/rules/rescue.ts` | 救済モードのプロンプト上書き（「創作しない」を限定緩和。吉本承認・§2.7-C）。各 generate が options.rescue 時に末尾追記 | 実装済 |
| `lib/generation/rescue.ts` | **救済モード**：人物像（＋時系列 `timeline`）から書類一式を依存順生成（アセス→第1/2表→{会議・経過・モニタリング}を並列）。上流出力を `lib/draftText` で文字列化し下流入力へ。メモ組立は純粋関数・テスト済 | 実装済 |
| `lib/generation/rescueIntake.ts` | **救済モード Stage0**：PDF資料（最大5件・documentブロック）＋手打ち人物像を1回のAI読解で「出典付きサマリ＋要注意点」に統合（`generateIntake`）。氏名等は転記せず一般表現へ。プロンプトは純粋関数・テスト済 | 実装済 |
| `lib/draftText.ts` | 下書き→コピー用プレーンテキスト整形（純粋関数・テスト済）。救済モードの帳票連結にも使用 | P1実装済 |
| `app/api/generate/` | 認証＋`documentType`分岐（carePlan/assessment/monitoring）＋入力検証 | P1実装済 |
| `app/api/rescue/` | 救済モードAPI（Clerk認証）。人物像（＋timeline／sourceDocs=Blob上のPDF最大5件）→（資料あれば Stage0 `generateIntake`）→`generateRescueBundle`→一式JSON＋`intake`。PDFは finally で必ず del()（非保持原則）。maxDuration=300 | 実装済 |
| `app/(dashboard)/create/` | 作成UI：帳票セレクタ→入力→下書き生成→確認・コピー（`components/drafts/` に表示部品） | P1実装済 |
| `app/(dashboard)/rescue/` | 救済モードUI：人物像の**構造化フォーム**（性格/生活歴/既往・診断/心身/家族・住環境/サービス/意向/補足）→一式生成→全帳票表示＋コピー。完成形まで埋める旨のバナー表示 | 実装済 |
| `extension/` | **時短エンジン**：ブラウザ拡張(MV3)。対象=**カイポケ**。サイドパネルで下書き生成→セクション単位コピー(Step1)＋カイポケ画面へ流し込み(Step2)。`src/adapters/kaipoke.js`＝CareNote→カイポケ欄マッピング(出典[KAIPOKE-DOM.md](KAIPOKE-DOM.md))。調査: [P2-KAIPOKE.md](P2-KAIPOKE.md)・[CALL-PIPELINE-FEASIBILITY.md](CALL-PIPELINE-FEASIBILITY.md)（電話録音→要約→転記の可否／カイポケ公開APIは無し・公認既製品あり・2026-09-09） | **P2 Step1+Step2 実装済**（テキスト欄の半自動入力。第2表等はDOM追加取得後） |
| 評価（現行） | 独立機能として継続。開発時は生成物の品質回帰チェックにも転用 | 継続 |

### 生成のデータフロー（P1実装済・3帳票）
```
[作成ページ /create] ──(帳票選択＋メモ入力)──> POST /api/generate ──(Clerk認証)──
   └─ documentType で分岐: generateAssessment / generateCarePlan / generateMonitoring
        └─ lib/generation/structured.generateStructuredDraft（共通コア）
             ├─ system = 役割 + lib/rules/<帳票>（品質ルール） ※プロンプトキャッシュ
             ├─ Claude API（構造化出力で帳票JSONを生成）
             └─> 下書き ──> components/drafts/<帳票>View で表示 → lib/draftText でコピー（人が確定）
```

### 拡張のデータフロー（P2実装済・カイポケ）
```
[サイドパネル extension/src/panel.js]
   ├─ 生成: POST {baseUrl}/api/extension/generate（Bearer = 利用者別トークン。認可=lib/extensionAuth・G3）
   │        └─ lib/generation/dispatch.generateFromBody（Web版と共通コア）→ 下書きJSON
   │   ※JSON貼付での読込もフォールバックで可（API未設定でも転記支援は使える）
   ├─ 表示: 帳票をセクション単位で表示・ワンクリックコピー（Step1・どのソフトでも使える）
   └─ 流し込み: chrome.tabs.sendMessage(activeTab, CARENOTE_INJECT)
        └─ extension/src/content.js（r.kaipoke.biz常駐）
             └─ globalThis.CareNoteKaipoke.inject（src/adapters/kaipoke.js）
                  └─ name優先→ラベル近接探索で欄を解決 → JSF互換でvalue設定＋input/change発火
                     ＋ハイライト表示（保存・確定は人間／SPEC F7）
```
セキュリティ: 拡張はカイポケ画面の内容を外部送信しない。ログイン情報も扱わない（SPEC §12）。
下書きはローカル(chrome.storage.local)のみ保存。外部送信は生成API（自分のバックエンド）だけ。

### 救済モードのデータフロー（実装済・SPEC §6.5 F9）
```
[救済ページ /rescue] ──(人物像フォーム＋時系列 timeline＋PDF sourceDocs≦5)──> POST /api/rescue ──(Clerk認証)──
   └─ Stage0（sourceDocs があるときのみ）: Blob取得→base64→rescueIntake.generateIntake
        （documentブロックで統合読解→出典付き summary＋cautions。処理後 finally で必ず del()）
   └─ composeRescueNotes（Stage0サマリを人物像メモの先頭に連結・純粋関数。手打ち優先はルール側で指示）
   └─ lib/generation/rescue.generateRescueBundle（依存順オーケストレーション・全帳票 rescue=true）
        1) generateAssessment(persona)
        2) generateCarePlan(persona + アセス結果)            ← assessmentToText で連結
        3) Promise.all[ generateMeetingSummary / generateSupportLog / generateMonitoring ]
                                                            ← carePlanToText で連結（並列）
        └─> {assessment, carePlan, meetingSummary, supportLog, monitoring, intake?}
             └─ components/drafts/<帳票>View で一括表示＋コピー（モードバナーで「下書き・要事実照合」明示）
```
品質緩和（救済モードのみ）: `lib/rules/rescue.RESCUE_SYSTEM_OVERRIDE` を各 generate の system 末尾に追記し、
完成形まで埋める（保留印なし）。通常生成は従来ルール（創作しない）を維持。氏名等の固有事実は創作しない。

### 利用者保存（A案・フェーズ1）── 実装状況
> 仕様: [specs/ui-redesign-and-client-storage.md](specs/ui-redesign-and-client-storage.md)。要配慮個人情報を扱うため R2（個人情報・法務）と一体。

| モジュール | 役割 | 状況 |
|---|---|---|
| `lib/privacy/crypto.ts` | 実名のアプリ層暗号化（AES-256-GCM・鍵=`CARENOTE_PII_KEY`） | 実装・テスト済 |
| `lib/privacy/pseudonymize.ts` | 氏名⇄記号の置換＋利用者コード採番（純粋・テスト済） | 実装・テスト済 |
| `lib/privacy/retention.ts` | 保持期限算出（5年） | 実装・テスト済 |
| `lib/db/{clients,documents}.ts` | 利用者・帳票のデータアクセス（service role＋アプリ層 created_by スコープ。実名は client_identities に暗号化）。approve/unapproveDocument（G4） | 実装済 |
| `app/api/clients/`・`app/api/clients/[id]/`・`app/api/documents/`・`app/api/documents/[id]/` | 利用者CRUD（一覧/作成/詳細＋帳票）・帳票保存・帳票承認 PATCH（Clerk認証） | 実装済 |
| `types/{client,document}.ts` | 利用者・帳票の型 | 実装済 |
| `supabase/clients_documents.sql`・`supabase/approval_migration.sql` | clients / client_identities / documents ＋ RLS（多層防御）。approval_migration は既存DBへの G4 列追加（冪等） | 要適用（SQL Editor） |

**承認モデル（G4・2026-07-09）**: documents.status は `draft|approved` の2状態。保存（POST /api/documents）は
**常に draft**（クライアントの status 指定は無視）。承認は `PATCH /api/documents/[id] {action:"approve"|"unapprove"}`
の人間操作のみ（approved_at/approved_by を監査証跡に記録・created_by スコープ）。**未承認の保存書類はコピー不可**
（UI 側で disabled。生成直後・保存前のコピーは従来どおり可）。コピー整形は `lib/draftText.documentContentToText`。

実行の前提: ①`supabase/clients_documents.sql`（既存DBは `approval_migration.sql` も）を Supabase で実行 ②`CARENOTE_PII_KEY`(base64 32B) を設定。

**B（現行ダークのまま機能追加）完了**: `app/(dashboard)/clients/`（一覧＋新規作成）・`clients/[id]/`（詳細＋保存帳票）、
Sidebar に「👥 利用者」、救済結果を選択/新規の利用者に5帳票一括保存（`/rescue` の保存パネル）。compile/build 検証済（実行は上記前提が必要・UI見た目はAで刷新）。
**残り（A＝editorial 総替え）**: layout/Sidebar/ホーム/既存ページ（create/evaluate/rescue/clients）をデザインシステムv0へ。
**仮名化の配線済み (2026-07-19)**: `getClientAliases`（lib/db/clients・実名復号→記号対応表・表記ゆれ展開）を
`/api/generate` と `/api/rescue` に組込み、**登録利用者の実名を記号化してからClaudeへ送信**（intakeサマリにも適用）。
限界: 登録外の実名・PDF原本は置換不可＝第一の防御は「実名を書かない」運用（docs/DATA-HANDLING-EXPLANATION.md §3・§7）。
拡張API（/api/extension/generate）はClerkユーザー文脈が無いため名簿置換は対象外だが、型置換＋漏れ検査（`maskRequestBody(body, [], vault)`）は通す（2026-09-12）。
**未対応**: `/create` からの「利用者に保存」導線。
**黒塗りの3段化 (2026-09-09・電話連絡パイプライン第1段)**: `lib/privacy/maskPii.ts` が唯一の入口
（名簿置換 `pseudonymize.maskNames` → 型置換 `patterns.maskPatterns`〔電話・郵便番号・メール・住所・生年月日・番号類〕
→ 自己点検 `leakCheck.assertNoLeak`）。`/api/generate` と `/api/rescue` はこれを通し、実名や型が残れば **422** で送信中止（fail-closed）。
findings は種類と件数のみ（原文をログに出さない）。予定の日付は消さない（カレンダー登録・支援経過の日付を守る）。
**二枚方式 (同日)**: 型置換の元の値はリクエスト内の札入れ `lib/privacy/vault.ts`（〔電話番号1〕＝090-…・同じ値は同じ札・フィールド間で共有）が覚え、
AIの返事は `restoreDeep` で手元に戻してから返す（`appointments` は戻さない）。名前（A様）は「記号で保持」契約どおり戻さない（表示時の復元は次の増分）。
**規約（2026-09-12・独立審査 critical #7）: 戻した帳票を再び AI へ送る API は必ず `maskBody.maskDeep` を通す。** 該当= `/api/kaipoke/assessment`（draft）・`/api/rescue`（intake）。restoreDeep を使う経路= `/api/generate`・`/api/extension/generate`・`/api/rescue`・`/api/kaipoke/assessment`。
**漏れ検査の独立性 (同日)**: `patterns.hasLongDigitRun`（10桁以上の数字列）と `pseudonymize.nameRegex`（空白・ゼロ幅・旧字体の揺れ）を `leakCheck.findLeaks` が使い、置換ルールの取りこぼしが検査の取りこぼしにならない。
**センサー (同日)**: `tools/check-invisible.mjs`（NUL・ゼロ幅文字の混入検査）を CI `quality-gates.yml` と `.claude/hooks/stop-build-check.sh` が呼ぶ。
**ルート層テスト (同日)**: `tests/api/*.route.test.ts`（generate/preview・kaipoke/assessment・rescue・extension/generate）と `lib/db/clients.test.ts`（偽 Supabase）が fail-closed を固定。拡張の DOM 経路は `extension/src/adapters/kaipoke.dom.test.ts`（jsdom）。
**送る前に見る画面 (同日・第2段)**: `POST /api/preview`（AIへ送らず、`lib/privacy/maskBody.maskRequestBody` を通した本文＋`candidates.findNameCandidates` の候補を返す）
→ `components/drafts/PreSendPreview.tsx`（候補を赤下線）→ 職員が「この内容で送る」→ `/api/generate`（同じ maskRequestBody）。`/create` に組込済（実機確認済 2026-09-09）。
**フル版表示 (同日)**: `GET /api/clients/aliases`（記号→実名・本人の利用者のみ）→ `/create` 結果画面の「実名で表示」切替。
`pseudonymize.restoreNamesDeep` は表示とコピー専用。保存帳票は記号のまま（documents.ts の契約を維持）。
**第3段 文字起こし入口 (同日・D1=外部サービス)**: `/create` 支援経過欄の「録音ファイルから文字にする」→ `POST /api/transcribe`
→ `lib/transcribe/provider.ts`（OpenAI 文字起こしAPI・`OPENAI_API_KEY`・差し込み口で他社切替可）→ 文字を支援メモに追記 → 第2段へ。
音声は非保持。`lib/transcribe/validate.ts` が **4MB**・形式・エラー言い換え（25MB は文字起こしサービスの上限だが、手前の Vercel が 4.5MB で切るため到達できない ── 2026-09-17 実測 6MB→413）。運用は **Genspark SecondBrain（使い方B）**が正、この経路は予備（DATA-HANDLING v0.3 §5-2）。
**第4段 カレンダー (同日・D2=個人 Google)**: `types/supportLog.ts` に `appointments`（AIが抽出・記号＋用件・番号禁止・「今日の日付」で相対表現を解決）
→ `lib/calendar/links.ts`（JST→UTC・終日・maskPatterns 二重安全網・`googleCalendarUrl`／`buildIcs` RFC5545）→ `components/drafts/AppointmentsPanel.tsx`
（「Googleカレンダーに追加」＝作成画面を開くだけ・保存は人／.ics）。**API・OAuth 審査は使わない**（テスト状態は7日でトークン失効＝公式確認）。記号版 result から作り実名を渡さない。
**第5段 アセスメント追記 (2026-09-10)**: `assessmentUpdates`（AIが状態像の変化から欄別の追記文を作る・書き換え禁止・個人情報禁止）→ CareNote `AssessmentUpdatesPanel`（表示・コピー）
／拡張 `kaipoke.js` の**追記モード**（`buildAppendedValue`〔純粋・二重追記防止〕→ `previewAppend`〔書かない〕→ `applyAppend`〔退避して末尾に足す〕→ `undoAppend`）。
`content.js` CARENOTE_APPEND_*、`panel.js` 「前後を見る／この欄に追記する／元に戻す」。inject（上書き）とは別経路。登録は人。
**D4 関係者名簿 (2026-09-10)**: `supabase/client_related.sql`（`client_related_identities`・暗号化・続柄一意）→ `lib/db/clients.ts` `getRelatedPeople/addRelatedPerson/deleteRelatedPerson`＋`loadAliases` が関係者を含める
（記号＝`pseudonymize.relatedAliasCode`「A様の長女」・**表が読めなければ 503 で送らない**）→ `GET/POST/DELETE /api/clients/[id]/related`（DELETE は利用者IDでも絞り 0件は 404）→ `components/clients/RelatedPeople.tsx`（利用者詳細ページ）。SQL は手動実行が要る。
**第6段 OCR統合 (2026-09-11)**: `/rescue` 参考資料に画像（JPEG/PNG/WebP・`blob-upload` 許可）＋資料ごとの種別 → `/api/rescue`（`contentType`/`docType` を検証）
→ `lib/generation/rescueIntake.ts`（PDF=document ブロック／画像=image ブロック・種別ごとの読みどころ・`facts`〔分類＋出典＋日付〕・`conflicts`・`documents`）
→ `composeIntakeNotes`（食い違い→分類別事実）を `generateRescueBundle` の入力に。結果の全文章とファイル名に maskPii（`maskDeep`）。画面に読み取り報告・食い違い・事実（分類別）。sourceDocs の検証は `lib/rescue/sourceDocs.ts`（SSRF 許可リスト＝**非公開ストアのホストのみ**・純粋・テスト済）。Blob は **非公開ストア** `carenote-intake-private`（D6・2026-09-12）に置き、`lib/blob/readPrivate.ts`（get()）で読む（/api/evaluate も同じ）。400/422 でも finally で削除・失敗は `warnings`。
**カイポケ転記 手順仕様書 (2026-09-11)**: [KAIPOKE-TRANSCRIPTION-SPEC.md](KAIPOKE-TRANSCRIPTION-SPEC.md)（ブラウザ操作型AIの実機転記記録＝アセスメント11ページ全欄・第2表往復・禁止文字・keyup同期・エラー回避）。
取り込み済: `kaipoke.js` `normalizeForKaipoke`（〜→～・丸数字→(n)・ローマ数字・組文字・空白）を `writeField` で必ず通す／`writeField` が keyup も dispatch／`measureText` に総文字数の安全上限（行×字−行数）／
`isReloginRequired`（再ログイン画面検知）→ `content.js` が書き込み系を拒否・`panel.js` バッジ「再ログインが必要」／FIELD_MAPS.assessment に P1 の26字幅と P2 `form:supportSubject` を追加。
**カイポケ転記シート (同日)**: `lib/kaipoke/assessmentLayout.ts`（10ページ31欄・安全上限・純粋）→ `lib/generation/kaipokeAssessment.ts`（下書き→欄別文章・`isInferred`）→ `POST /api/kaipoke/assessment`
→ `/create` の「カイポケの欄に合わせる」→ `KaipokeSheetView`（欄ごとコピー／拡張用JSON）→ 拡張 documentType `kaipokeAssessment`（`injectKaipokeSheet`：ページ単位・既存文章は消さない）。
**第2表の半自動化 (同日)**: 拡張 `kaipoke.js` `buildPlan2Steps`／`plan2ScreenFromNames`／`parseFrequency`／`classifyServiceType`／`fillPlan2Step`（追加画面1つ分だけ埋める・画面違いは書かない）
→ `content.js` CARENOTE_PLAN2_FILL → `panel.js` 「第2表を1件ずつ流し込む」（案内→流し込む→登録は人→次へ、進捗は storage）。`readFieldValue(el)` が欄の今の文章（`getValue(draft,key)` と別物）。第3表は未対応。
**職員向けマニュアル (2026-09-12・ROADMAP 第4版 P-MANUAL)**: 本文の正本は `lib/manual/content.ts`（7章・手順145・よくある質問65。実画面の棚卸し→執筆→「実在しないラベルを潰す」検証の産物）。
同じデータを3つの形で出す: ①アプリ内 `app/(dashboard)/guide/page.tsx`（`/guide`・目次・章ごとの動画枠・手順・注意・FAQ）
②印刷/PDF `tools/build-manual.mjs` → `public/manual/index.html`（`npm run manual` で再生成・**生成物なので手で直さない**）＋ Chrome ヘッドレスで `public/manual/CareNote-AI-操作マニュアル.pdf`（本文を直したら HTML→PDF の順で作り直す）
③動画 `docs/MANUAL-VIDEO-SPEC.md`（収録台本・91場面。§7＝実際の作り方）。**①〜④⑥⑦の6章は収録済**で
`public/manual/videos/chN.mp4`（`video.status: "ready"`）。⑤カイポケ転記だけ他社画面のため未収録＝画面に「準備中」と出る。
道具は `tools/make-narration.mjs`（声＝MiniMax・男性。読みは `lib/manual/readingDict.ts` で固定し、
`tools/check-reading.mjs` が文字起こしで読み間違いを検出する）→ `tools/shoot-run.mjs`＋`tools/shoot-plans.mjs`（Chrome を自動操作して撮る）
→ `tools/make-card.mjs`（撮れない場面の説明カード）→ `tools/make-video.mjs`（ffmpeg で合成）。
**字幕は動画へ焼き込む一本化**（再生ページに track タグを足すと二重に出る ── 再発防止テストは `lib/manual/videoScript.test.ts`）。
各画面の見出しからは `PageHeader` の `helpAnchor` で `/guide#chN` へ飛べる。開閉の要る FAQ だけ `components/manual/FaqAccordion.tsx`（"use client"）。
**UI の文字を変えたら content.ts も同じ PR で直す**（Doc-as-Code）。
**決定（2026-09-12）**: `public/manual/` は Next.js の public 配下＝**ログイン無しで URL を知っていれば閲覧できる**（middleware の matcher がドット付きパスを除外）。秘密情報は含めない前提で、研修配布と PDF 生成のためこの形を採る。検索避けは `noindex` と `public/robots.txt`。
**録音パイプライン (2026-09-17・docs/specs/recording-pipeline.md)**: 対面3帳票へ録音を拡大。
R0 上限の是正（4MB＝Vercel の実効上限。25MB は到達不能だった）／R1 入口を4帳票へ（`components/create/NotesField.tsx`）／
R2 確認画面の長文対応（`lib/privacy/previewNav.ts`・赤い言葉に通し番号と「次へ」・畳んでも赤は全部出す・
「なぜ赤いか」は畳んだ欄は各行の末尾、開いた欄は本文の下に `redWordReasons` で文字で出す ── ふきだしはタッチ端末に出ない・2026-09-23）／
R3 画面内録音（`components/recording/RecordingPanel.tsx`＋`lib/recording/{config,segments,mimeType}.ts`。
5分区切り・音声は端末にもサーバにも残さない・**表示スイッチ `NEXT_PUBLIC_CARENOTE_RECORDING` は既定 off**）／
R4 文字起こし全文の保存（`supabase/client_transcripts.sql`＋`lib/db/transcripts.ts`＋`app/api/transcripts/`。
AES-256-GCM・5年・可視性は `getClientById` に一本化・**AIへは渡さない**）／R5 説明書 v0.6（草案）。
画面を動かす検査＝`components/recording/RecordingPanel.live.test.tsx`（jsdom）。

**管理者の準備手順（2026-09-13）**: `docs/ADMIN-SETUP.md` が正本（①関係者名簿の表 ②索引 ③Clerk 組織 ④既存データの移行）。SQL の中身は `supabase/client_related.sql` と `supabase/client_org_scope.sql`。

**名簿の範囲（2026-09-13・G3b 吉本さん決定「事業所で共有」）**: `lib/db/clients.ts` の `scopeExpr` が唯一の絞り込みで、掛かるのは **`clients` だけ**。氏名の2表（`client_identities` / `client_related_identities`）は**親の利用者IDで引く**（`selectByClientIds`）── 3表を別々に `org_id` で絞ると、移行が揃わなかったときや組織未選択時に登録された関係者がいるときに**利用者は見えるのに氏名だけ名簿から落ちる**（＝置換も漏れ検査も効かない fail-open。独立審査 2026-09-13）。ルート（8ファイル・11ハンドラ）が範囲を渡すことは `tests/api/orgScope.route.test.ts` が縛る。

記号（A様）の採番は**範囲内の最大＋1**（件数だと範囲が混ざったとき同じ記号を二度振る）。安全網は3段: ①`assertClientCodesUnique`（同じ記号の利用者が2人 ── **復号する前に**見るので復号失敗行があっても取りこぼさない）②`expandAliasVariants` が「同じ表記が違う記号」を見つけたら `AliasConflictError`（空白違いの別人・同姓同名を黙って捨てない）③`assertUnderRowLimit`（900件超で停止 ── PostgREST の既定1000行の黙った打ち切り対策）。これらは待っても直らないので `ALIAS_PERMANENT_MESSAGE`（管理者へ連絡）で返し、読み直さない。

**⚠ Clerk の `orgId` は「所属」ではなく「いま選んでいる事業所（Active Organization）」**。所属させただけでは null のまま＝共有は始まらない。だから `components/SharingStatus.tsx` が状態を常時表示し、その場で切り替えられるようにしている（`OrganizationSwitcher`）。表示の3状態（確認中／事業所で共有中＋事業所名／自分の登録分のみ＋「置き換わりません」の注意書き）と切り替えが出ることは `components/SharingStatus.test.tsx` が縛る（Clerk は偽物にする・2026-09-23）。`getClientAliases` は orgId が null のとき warn を残す（センサー）。**有効化には Clerk の組織設定＋SQL 2本の実行＋既存データの移行＋各職員が事業所を選ぶこと が要る**（手順の正本= `docs/ADMIN-SETUP.md`）。保存書類（`documents`）の共有は未対応で `created_by` のまま。

仕様と5段計画: [specs/call-pipeline.md](specs/call-pipeline.md)。根拠調査: [CALL-PIPELINE-FEASIBILITY.md](CALL-PIPELINE-FEASIBILITY.md)。

### テストの見張り（Quality Gates・2026-09-23 追加）
```
npm test ─> tools/run-tests.mjs
   ├─ ⓪ tools/safety-tests.json（安全テストの一覧）を tools/testManifest.mjs で照合 ── vitest より前・数秒
   │     ・名指しのファイル（理由つき）がディスクにある／守るフォルダが最低件数を下回っていない
   │       （lib/privacy・tests/api・lib/recording・lib/transcribe・lib/rescue）
   │     ・守るファイルに .skip( .only( .todo( skipIf runIf fails xit などの書き方が無い
   │       （`const s = it.skip` のように括弧なしで別名へ入れる形も ── 引数つきの実行ではここが唯一の見張り）
   ├─ ① vitest run（NO_COLOR）。引数なしのときは JSON レポートも一時ファイルへ書かせる（落ちたときの名指し用・読んだら消す）
   ├─ ②③ ディスク上のテストファイル数＝走った数・`Errors` 行が無い・vitest の終了コード 0（2026-09-13 から）
   └─ ④ 集計行 Test Files / Tests に skipped・todo・expected fail が1件でもあれば失敗
        ②④で落ちたときは、走らなかったファイル・飛ばされたテストをファイル名とテスト名で挙げる
        （合否は集計行で決める。JSON が読めなくても合格にはしない）
```
なぜ: ②だけでは、安全テストを1つ消すと両方の数が減って緑のまま、`it.skip` を入れても緑のままだった（吉本さん決定「安全テストが消えない・飛ばされない見張り」）。
見張りの検査は `tools/testManifest.test.ts`（わざと壊した状態を作って止まることを確かめる）。
画面の検査（送る前の画面・録音・共有状態）は、描いた HTML を `tests/helpers/markup.ts`（parse5 で木として読む。`textOf` は属性の中身と、隠す印＝`hidden` 属性・`aria-hidden="true"`・class の `hidden`/`invisible`/`sr-only`・style の `display:none`/`visibility:hidden` のある要素の文字を数えない。CSS ファイル側の見え方は判定しないので、「出していない」は HTML 全体で見る）で読む。文字列の照合では class の `disabled:` や title のふきだしで空振りしていた（2026-09-23・steering-log）。道具そのものの検査は `tests/helpers/markup.test.ts`。CI（`quality-gates.yml`）は `npm run test` 経由で同じ見張りを通る（`package.json` の test が `node tools/run-tests.mjs` のままか・CI の行が `npm run test` のままか・`quality-gates.yml` に落ちても緑にする `continue-on-error` や段を飛ばす `if:` が無いかも、同じ検査が確かめる ── 入口を書き換えて見張りごと飛ばす抜け道を塞ぐ）。
引数つき（`npm test -- <ファイル>`）でも⓪と `Errors` 行・終了コードの確認は必ず走る。件数の突き合わせと④は引数なしのときだけ（`-t` で絞ると外れたテストが skipped と数えられるため）。
一覧の抜けを防ぐ検査: `lib/generation` で「AI への指示に氏名・実名・個人情報を書かせない」を固定している検査は、字面から拾って一覧と突き合わせる（2026-09-23 の検収で `kaipokeAssessment.test.ts` の抜けが見つかったため）。
書く瞬間の注意喚起: 一覧の最低件数を下げる・名指しを消す・判定を緩める変更は、MaouCastle ルートの `.claude/hooks/pre-tool-guard.sh`（慎重領域 §6 #9）が
見張りの4ファイル（`tools/run-tests.mjs`・`tools/safety-tests.json`・`tools/testManifest.mjs`・`tools/testManifest.test.ts`）への Edit/Write で知らせる。
これはルートの `.claude/settings.json`（`Bash|Edit|Write`）で動く。carenote-ai 自身の `.claude/settings.json` は Bash だけを見る fail-safe で、注意喚起を持たない。
**未了（redesign/a を本番へ出す前に必須）**: この注意喚起は maoucastle-game のブランチ `harness/h3-safety-advisory`（ab5e3ad）にあり、
main へはまだ入っていない。ハーネスの変更なので PR＋独立審査（§2.7-F 出口）を通す ── [maoucastle-game#38](https://github.com/satoshiyoshimoto0426/maoucastle-game/issues/38)。

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき
- 安全テストを足した・消した・名前を変えたとき（`tools/safety-tests.json` も同じコミットで直す）

---
*最終更新: 2026-09-23 / 画面の安全テストを木で読む道具（`tests/helpers/markup.ts`）と共有状態の検査（`components/SharingStatus.test.tsx`）を反映。同日、`textOf` が隠した要素の文字を数えないことと、その限界を追記*
*2026-09-23 / テストの見張り（安全テストの一覧 `tools/safety-tests.json`・判定 `tools/testManifest.mjs`・落ちたときの名指し・ルートのフックの注意喚起との接続）を反映*
*2026-06-16 / 救済モード（人物像→書類一式の一括下書き・SPEC §6.5 F9）を反映*
*2026-06-15 / P2拡張: カイポケ・サイドパネル＋流し込みアダプタ(extension/)を反映*
*2026-06-11 / P1拡張: アセスメント・モニタリング生成＋共通コア(structured.ts)を反映*
