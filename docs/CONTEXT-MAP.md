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
| `components/` | UI部品（FileUploader / LoadingProgress / EvaluationResults / CategoryCard / ScoreRing / MiniBar / SharingStatus）。外枠（左の帯・上の帯）は `components/shell/`（§3「外枠」） |
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
各画面の見出しからは `PageHeader` の `helpAnchor` で `/guide#chN` へ飛べる（A案の外枠では上の帯の「この画面の使い方」も同じ章へ飛ぶ ── 行き先は `lib/nav.ts` の `helpAnchorOf`）。開閉の要る FAQ だけ `components/manual/FaqAccordion.tsx`（"use client"）。
**UI の文字を変えたら content.ts も同じ PR で直す**（Doc-as-Code）。
**決定（2026-09-12）**: `public/manual/` は Next.js の public 配下＝**ログイン無しで URL を知っていれば閲覧できる**（middleware の matcher がドット付きパスを除外）。秘密情報は含めない前提で、研修配布と PDF 生成のためこの形を採る。検索避けは `noindex` と `public/robots.txt`。
**録音パイプライン (2026-09-17・docs/specs/recording-pipeline.md)**: 対面3帳票へ録音を拡大。
R0 上限の是正（4MB＝Vercel の実効上限。25MB は到達不能だった）／R1 入口を4帳票へ（`components/create/NotesField.tsx`）／
R2 確認画面の長文対応（`lib/privacy/previewNav.ts`・赤い言葉に通し番号と「次へ」・畳んでも赤は全部出す）／
R3 画面内録音（`components/recording/RecordingPanel.tsx`＋`lib/recording/{config,segments,mimeType}.ts`。
5分区切り・音声は端末にもサーバにも残さない・**表示スイッチ `NEXT_PUBLIC_CARENOTE_RECORDING` は既定 off**）／
R4 文字起こし全文の保存（`supabase/client_transcripts.sql`＋`lib/db/transcripts.ts`＋`app/api/transcripts/`。
AES-256-GCM・5年・可視性は `getClientById` に一本化・**AIへは渡さない**）／R5 説明書 v0.6（草案）。
画面を動かす検査＝`components/recording/RecordingPanel.live.test.tsx`（jsdom）。

**管理者の準備手順（2026-09-13）**: `docs/ADMIN-SETUP.md` が正本（①関係者名簿の表 ②索引 ③Clerk 組織 ④既存データの移行）。SQL の中身は `supabase/client_related.sql` と `supabase/client_org_scope.sql`。

**名簿の範囲（2026-09-13・G3b 吉本さん決定「事業所で共有」）**: `lib/db/clients.ts` の `scopeExpr` が唯一の絞り込みで、掛かるのは **`clients` だけ**。氏名の2表（`client_identities` / `client_related_identities`）は**親の利用者IDで引く**（`selectByClientIds`）── 3表を別々に `org_id` で絞ると、移行が揃わなかったときや組織未選択時に登録された関係者がいるときに**利用者は見えるのに氏名だけ名簿から落ちる**（＝置換も漏れ検査も効かない fail-open。独立審査 2026-09-13）。ルート（8ファイル・11ハンドラ）が範囲を渡すことは `tests/api/orgScope.route.test.ts` が縛る。

記号（A様）の採番は**範囲内の最大＋1**（件数だと範囲が混ざったとき同じ記号を二度振る）。安全網は3段: ①`assertClientCodesUnique`（同じ記号の利用者が2人 ── **復号する前に**見るので復号失敗行があっても取りこぼさない）②`expandAliasVariants` が「同じ表記が違う記号」を見つけたら `AliasConflictError`（空白違いの別人・同姓同名を黙って捨てない）③`assertUnderRowLimit`（900件超で停止 ── PostgREST の既定1000行の黙った打ち切り対策）。これらは待っても直らないので `ALIAS_PERMANENT_MESSAGE`（管理者へ連絡）で返し、読み直さない。

**⚠ Clerk の `orgId` は「所属」ではなく「いま選んでいる事業所（Active Organization）」**。所属させただけでは null のまま＝共有は始まらない。だから `components/SharingStatus.tsx` が状態を常時表示し、その場で切り替えられるようにしている（`OrganizationSwitcher`）。**置き場所は外枠の上の帯の右側**（どの幅でも出る。2026-09-23 A案 ── それまでは左メニューとスマホ用の2か所）。`getClientAliases` は orgId が null のとき warn を残す（センサー）。**有効化には Clerk の組織設定＋SQL 2本の実行＋既存データの移行＋各職員が事業所を選ぶこと が要る**（手順の正本= `docs/ADMIN-SETUP.md`）。保存書類（`documents`）の共有は未対応で `created_by` のまま。

仕様と5段計画: [specs/call-pipeline.md](specs/call-pipeline.md)。根拠調査: [CALL-PIPELINE-FEASIBILITY.md](CALL-PIPELINE-FEASIBILITY.md)。

### 見た目の土台 ── デザイントークン v2（A案「作業台」・2026-09-23・ブランチ `redesign/a`）
値の正本は **`app/globals.css` の `:root`**。地（`--paper` `--card` `--pane` `--rail` `--active` `--row-selected`）／
文字4段（`--ink` → `--ink-2` / `--ink-table` → `--muted` → `--faint`）／線（`--line` `--btn-line` `--line-inner` `--line-faint`）／
**飾り専用 `--dash`（「—」と区切りの「/」だけ。文字に使わない）**／色の役割（`--green`=主ボタン・選択中、`--red-word`=赤い言葉だけ、
`--amber*`=注意、`--clay*`=エラー）／書体（`--sans`=IBM Plex Sans JP、`--mono`=IBM Plex Mono ── 記号・件数・日付）。
書体の読み込みは `app/layout.tsx` の Google Fonts `<link>`（next/font はビルドが外部通信に左右されるので使わない）。
Clerk の画面用の**写し**が `lib/clerkAppearance.ts`（Clerk は CSS 変数を解釈しない箇所があるため16進数で持つ）。
センサー: `app/globals.test.ts`（①層の外で要素の余白を決める規則 ── `@media`/`@supports`/`@container` の中と `@layer a, b;` の直後も見る
②文字色トークンが地〔paper/card/pane/surface-2〕の上で WCAG AA 4.5:1 以上 ③`--sans`/`--mono` の先頭の書体を layout.tsx が読み込む ──
`RootLayout` を実際に描いた HTML に、その書体と太さ〔Sans 400/500/700・Mono 400/500〕を載せた `rel="stylesheet"` の Google Fonts `<link>` があるか）、
`lib/clerkAppearance.test.ts`（写しとトークンのずれ ＋ 下の層の順番 ＋ 押す・入力する部品に 44px〔`min-h-11`〕を約束するクラスが付いているか・
elements の部品が「押す／押さない／まだ計測していない」のどれかに分けてあるか）。CSS の読み取り器は `tests/helpers/cssTokens.ts`（テスト専用）。
**`--faint` は 58 か所で本物の文字（赤い言葉の理由など）に使われている** ── 4.5:1 を割る値にしない。
**Clerk のスタイルは `clerk` 層に入れる（3か所で1組）**: `app/layout.tsx` の `ClerkProvider appearance={{ cssLayerName: CLERK_CSS_LAYER }}`
＋ `app/globals.css` 先頭の `@layer theme, base, clerk, components, utilities;`（`@import "tailwindcss"` より前）＋ 名前の正本 `lib/clerkAppearance.ts` の `CLERK_CSS_LAYER`。
これが無いと Clerk の層外スタイルが Tailwind のクラスに勝ち、`clerkAppearance.elements`（ログイン枠・組織切替の見た目）が画面に効かない（2026-09-23 に /sign-in で計測）。
ログインが要る画面の見た目の確認で**まだ済んでいないもの**は `docs/REDESIGN-A-SIGNOFF.md`（redesign/a を main へ出す前に全部済ませる）。

### ナビ4項目・アイコン・書類の種類の正本（A案「作業台」・2026-09-23・ブランチ `redesign/a`）
- **`lib/nav.ts`（純粋）**: ナビは6項目→4項目（吉本さん決定）。`NAV_ITEMS` = 利用者 `/clients`・つくる `/create`・点検 `/evaluate`・使い方 `/guide`。
  `sectionOf(pathname)` が古い URL も振り分ける（`/rescue`→つくる、`/dashboard`→点検。URL は消さない ── ブックマーク・マニュアル・撮影の道具が使う）。
  `helpAnchorOf(pathname, mode)` が「この画面の使い方」の行き先（利用者→ch2、つくる→ch3、一式まとめて〔`mode=bundle` か `/rescue`〕→ch6、点検→ch1、使い方→なし）。
  テスト `lib/nav.test.ts` は、返す章が `lib/manual/content.ts` に実在することと、今の各ページの `PageHeader helpAnchor` と同じ行き先であることも確かめる。
  読む側: 左の帯 `components/shell/Rail.tsx`（どれが光るか）と上の帯 `components/shell/TopBar.tsx`（項目の名前・「この画面の使い方」の行き先）。
- **`components/ui/icons.tsx`**: `strokeWidth`（既定 1.6。A案は選択中のナビを 1.8）。A案用に `IconPeople`（利用者）・`IconPencil`（つくる）・`IconCheckCircle`（点検）・`IconMic`・`IconChevronUp/Down` を追加（使い方は既存の `IconHelpCircle`）。
  センサー `components/ui/icons.test.tsx` ── 書き出した全アイコンが `aria-hidden="true"`・`currentColor`・`strokeWidth` を守るか（アートボードの SVG をそのまま貼ると aria-hidden が無い）。
- **`lib/create/docTypes.ts`**: 書類5種類の並び順 `DOC_ORDER` と、画面ごとの名前 `DOC_TYPE_LABELS`（`tab`=つくるの種類ボタン／`description`=その下の1行／`saved`=利用者の画面の書類の行／`bundle`=救済モードの結果の見出し／`output`=A案の送信の帯の「作るもの」・**まだ画面に出していない**）。
  create・clients/[id]・rescue の3画面がここを読む（前は各画面に別々に書いてあった）。**画面の文字は変えていない**（`lib/create/docTypes.test.ts` が固定）。
  `output` の担当者会議以外の4つは案（画面に出す前に吉本さんの確認が要る）。`app/api/documents/route.ts` の `ALLOWED_TYPES` は同じ5種類を別に持っている。

### 外枠 ── 左の帯・上の帯・共有状態（A案「作業台」・2026-09-23・ブランチ `redesign/a`）
`app/(dashboard)/layout.tsx` = `[Rail] [列: TopBar（上の帯＋注意の帯）→ main.app-main-inner → 送り先の表示]`。旧 `components/Sidebar.tsx`（6項目・220px）とスマホ用の `MobileNav`・`.app-topbar`・`.app-sharing-mobile` は廃止。
- **`components/shell/Rail.tsx`**: 768px 以上は幅 72px の左の帯（CN・4項目・下端に Clerk `UserButton` とメールの「@」より前を文字で）。768px 未満は**同じ4項目が画面の下のタブ**（文字つき・高さ 56px・safe-area）── スマホから利用者・つくるへ行けるようになった。光る項目は `lib/nav.ts` の `sectionOf`（`aria-current="page"`・緑の線 1.8）。スマホの下のタブにはアカウントのボタンを入れていない（以前のスマホ画面と同じ）。
- **`components/shell/TopBar.tsx`**: 高さ 52px の上の帯（スクロールしても上に貼りつく）。左 = ページの差し込み（無ければ項目の名前）、右 = 「この画面の使い方」（`helpAnchorOf`。使い方の画面では出さない）＋ 共有状態。帯＋注意の帯の実際の高さを ResizeObserver で測って `--shell-head-h` に書く（`.presend-nav` と `html` の `scroll-padding-top` が読む。旧: 固定の 72/76/80px）。`html` の scroll-padding（上 = 帯＋8px、スマホの下 = タブ＋safe-area＋8px・`app/globals.css` の `@layer base`）が、フォーカスした部品・使い方の章の飛び先（`/guide#chN`）を帯やタブの裏に隠さない（WCAG 2.2 AA 2.4.11。章ごとの旧 `.shell-anchor` は廃止 ── 両方あると二重に下がる）。画面が描かれていない（隠れたタブの）間は測れず、見えた時に書き直す。
- **`components/shell/TopBarSlot.tsx`**: ページが上の帯の左に見出し・道しるべを差し込む口（`TopBarSlotProvider` を layout が持ち、`TopBarSlot` で包んだ中身を createPortal で帯へ）。使っているのは利用者（A5・`components/clients/ClientsLayout.tsx`）。つくるは作り直すスライスで使う。**1画面で差し込むのは1か所だけ**（2つの差し込みが同じ口に入ると、並び順が描かれた順に左右されるため）。
- **`components/SharingStatus.tsx`**: `variant="bar"`（点・「共有状態を確認中／事業所で共有中＋事業所の名前／自分の登録分のみ」・`OrganizationSwitcher`）と `variant="strip"`（共有していないときだけ帯の下に `role="status"` で「…置き換わりません。複数人で使うときは、右上の事業所の切り替えから選んでください。」）。旧 `full`/`compact` は廃止。`OrganizationSwitcher` の見た目で文字を隠す指定は**切り替えのボタンの中だけ**に書く（Clerk は `__personalWorkspace` など一部の名前を、押すと開く一覧の行にも使う。`SharingStatus.test.tsx` が見張る）。
- 高さは `calc(100dvh - …)` で決めない（注意の帯が出ると下の端が画面の外へ出るため）。寸法トークン `--topbar-h` `--rail-w` `--tabbar-h` `--pane-header-h` は `app/globals.css` の `:root`。
  768px 以上は外枠（`.app-shell`）が画面の高さちょうど（`100dvh`）で**文書は動かない** ── 列を flex の縦並びにして本文に残りの高さを渡し、本文の中の区画が自分の中で動く（下の「区画」）。スマホは今までどおり文書が動き、上の帯が貼りつく。
- 「CareNote — Powered by Claude API」（AI の送り先が画面に出る唯一の場所）は、送る帯に送信先の表示が入るまで残す。768px 以上では列の下端に常に見えている1行（A4 から）、スマホでは本文の終わり。
- テスト: `components/shell/Rail.test.tsx`・`TopBar.test.tsx`（帯の高さを読む CSS が固定の数字・引き算に戻らないこと、html の scroll-padding が帯・タブの高さから決まり二重に足していないことも）・`TopBarSlot.live.test.tsx`（jsdom・差し込みと高さの書き込み）・`components/SharingStatus.test.tsx`（3つの状態・注意の帯・切り替え・44px）・`app/(dashboard)/layout.test.tsx`（外枠が共有状態・4項目・送り先の表示を持つ）。外枠の文字と地の組み合わせの 4.5:1 は `app/globals.test.ts`。
- **まだ直していない文書**（後のマイルストーンでまとめて書き直す・作り直しは本番に出さない決定）: `lib/manual/content.ts`（共有状態は「画面の左下」・6項目のメニュー・スマホの2アイコン など）、`docs/ADMIN-SETUP.md`・`docs/DATA-HANDLING-EXPLANATION.md`（共有状態の場所）、`docs/MANUAL-VIDEO-SPEC.md`（左メニューの名前とメールで録画のアカウントを確かめる手順）、6章の動画（旧い左メニューが映っている）。

### 区画（ペイン）・まだ作り替えていない画面の器・ホーム（A案「作業台」・A4・2026-09-23・ブランチ `redesign/a`）
- **本文 `main.app-main-inner` は画面いっぱい**（幅の上限・余白なし）。区画を端から端まで並べ、1px の線だけで区切る（カードを積まない）。
- **部品** `components/ui/primitives.tsx`: `Pane`（section／aside・`width` 640／440・`tinted`＝地を `--pane`・`label`＝読み上げの名前）、`PaneHeader`（高さ 48px・**Pane の直下に置く**・`title` は h2）、
  `SectionLabel`（12px 太字・字間 0.06em・`htmlFor` で欄に結んだ label）、`TextAction`（文字だけの操作 ── `href`＝リンク／`onClick`＝ボタン・スマホ 44px）。
  ボタンの寸法もアートボードへ: `btnPrimary`＝高さ 44px の緑（1画面に1つ）、`btnSecondary`＝パソコン 34px・スマホ 44px・枠 `--btn-line`・文字 `--ink`。`Card`/`PageHeader`/`SectionTitle` は作り替え前の画面のために残す（計画 X1 で片付け）。
- **CSS** `app/globals.css` の `@layer components`: `.panes`（区画を横に並べる）・`.pane`・`.pane-640`・`.pane-440`・`.pane-tinted`・隣り合う区画の 1px の線（`.pane + .pane`）・`.pane-header`・`.pane-title`・`.section-label`・`.text-action`・`.legacy-page`。
  層に入れるのは、部品に className で足した Tailwind の指定（余白など）が勝てるように（層の外の規則は層の中に必ず勝つ ── 2026-09-23 の余白 0 の不具合と同じ仕組み）。素の CSS なのでスキャンの取りこぼしと無関係に本番の CSS に出る（本番用ビルドで確認済み）。
- **768px 以上は区画が自分の中で縦に動く**（左の入力を動かしても右は動かない）。区画の頭の帯は区画の上に貼りつく。スマホは区画を縦に積み、文書が動く（スマホ用の形は M1/M2）。
- **貼りつく物の基準 `--sticky-top`**（計画の指摘「区画の中は 0・文書が動く所は帯＋注意の帯」）: 768px 以上で区画（`.pane`・`.legacy-page`）が「自分の上端に重なる物の高さ」を書く
  （0。頭の帯を直下に持つ区画は `--pane-header-h` ── `.pane:has(> .pane-header)`）。`.presend-nav`（前へ／次へ）の top と区画の `scroll-padding-top`（フォーカス・飛び先の止まる位置）がこれを読み、
  無い所（スマホ＝文書が動く）では今までどおり `--shell-head-h`。**動く器に padding-top を付けない**（ブラウザは貼りつく物の基準をその分下げる ── `.legacy-page` の上下 40px は `::before`/`::after` の空の箱で空ける）。
- **動く器の直下の物は縮ませない**（`.pane > *`・`.legacy-page > *` に `flex-shrink: 0`・768px 以上）。器は高さの決まった flex の縦並びで、
  overflow-hidden の一覧（角を丸めた Card）は縮む下限が 0 になり、器の高さで自分の行を切り落として下の行へ行けなくなる（2026-09-24 A4 の検証の blocker ──
  利用者の一覧と点検の履歴）。**残りの高さを埋める物は `grow`**（flex-grow だけ）を付け、`flex-1` は使わない（縮む指定と高さ 0 の出発点を入れ直すので、
  overflow-hidden や小さい `min-h` と組むと同じ切り落としが起きる）。器の中で縮めて中だけ動かしたい物だけが `flex-1 min-h-0` を自分で付ける。
- **まだ作り替えていない画面の器 `.legacy-page`**: 5画面（`create`・`evaluate`・`dashboard`・`rescue`・`guide`）の根元に付ける（A4 では7画面。`clients`・`clients/[id]` は A5 で外した ── 下の「利用者の作業台」）。
  以前の本文の幅（最大 1000px＝中身 920px＋左右 40px）と余白（スマホ 16/16/32px）を再現し、768px 以上ではそれ自体が1つの区画のように動く。旧 `.app-main-inner` の「幅の決定点」の決まりはここが引き継いだ。作り替えたページから外し、全部外れたら消す（計画 X1）。
- **ホーム = 利用者**（吉本さん決定 2026-09-23）: `app/page.tsx` が `/` を `/clients` へ（旧 `/evaluate`）。ログイン直後の行き先は Clerk の `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `AFTER_SIGN_UP_URL`。
  手元の見本 `.env.local.example` は `/clients` にした（ただしこのファイルは `.gitignore` の `.env*` に当たり **git に入っていない**）。本番の Vercel の値は吉本さんが変える（`docs/REDESIGN-A-SIGNOFF.md` の 8）。
- テスト: `components/ui/primitives.test.tsx`（部品が付けるクラス・ボタンの 44px・区画の CSS の形〔層・768px 以上で動く・動く器の直下の物は縮まない・`.pane-640`／`.pane-440` の幅・区画の境目の 1px の線（スマホは上・768px 以上は左）・`--sticky-top`・旧画面の器の幅〕）・`app/page.test.ts`（`/` → `/clients`）。
- **まだ直していない文書**（D1a/D2 でまとめて）: 「ログインすると、ダッシュボードか評価するの画面が開きます」── `lib/manual/content.ts`:248（あわせて 98-99・216-217・302）・`docs/MANUAL-VIDEO-SPEC.md`:221・`docs/manual-video/ch2.draft.vtt`・公開中の ch2 の字幕。

### 利用者の作業台 ── 一覧の表と右の 440px の区画（A案「作業台」・A5・2026-09-24・ブランチ `redesign/a` ＝ 計画 U1＋U2）
- **並び**: `app/(dashboard)/clients/layout.tsx`（サーバー）→ `components/clients/ClientsLayout.tsx`（ブラウザ）が `/clients` と `/clients/{id}` を包む。
  上の帯（`TopBarSlot` で差し込む）= 見出し「利用者」＋人数（等幅）か、道しるべ「利用者 / B様」（`/clients/{id}`）＋「記号・属性で探す」＋「新しい利用者」（脇のボタン → `/clients?new=1`）。
  本文 = `.panes` の中に [左 = 一覧の表（`Pane`・残りの幅）] | 1px の線 | [右 = `Pane as="aside" width={440} tinted` ＝ ページの中身]。
  layout は利用者を選び替えても作り直されないので、**表は消えず、一覧も読み直さない**。右の区画だけがページで入れ替わる。
- **何を選んでいるか**は URL だけで決める（`usePathname` → `lib/clients/clientList.ts` の `selectedClientIdOf`）。選んだ行は地 `--row-selected`（`tr[data-selected]`）とリンクの `aria-current="page"`。
  **`/clients` を開いただけでは誰も選ばない**（右の区画は案内「左の一覧から利用者を選ぶと、書類と関係者名簿がここに出ます」だけ）── 関係者名簿の実名は、行を押してその方の URL を開いたときだけ出す（吉本さん決定 2026-09-23）。
  `?new=1` は `useSearchParams` で読む（layout は searchParams を受け取れない ── 計画の指摘 U2）。`/clients?new=1` のときだけ登録の欄で、「新しい利用者」を押した色にする。
- **`components/clients/ClientsContext.tsx`**（`ClientsProvider` / `useClients`）: 一覧（GET `/api/clients`）・読み込みの状態（`loading`/`ready`/`error`）・探す言葉・`addClient`（登録した利用者を読み直さずに先頭へ）・`reload` を、表・上の帯の探す欄・登録の欄が分け合う。
  **読めなかったら「0人」にしない**: 通信の失敗・200 以外・JSON でない・配列でない、はすべて `error` にし、「利用者一覧を読めませんでした」＋サーバーの文を出す（まだ利用者がいません、も人数も出さない ── 計画 U0 と同じ決まり）。
  ※ 枝 `redesign/a-backend` の U0（コミット 988cc85）に同じ役目の `lib/clients/listError.ts` の `fetchClientList` がある。この枝にはまだ無いので同じ決まりをここに持った。**取り込むときは `fetchClientList` に寄せて1つにする**（同じ枝の `tests/ui/clientListErrors.live.test.tsx` の「/clients」の検査は、一覧がページから layout へ移ったので `ClientsLayout` を描く形に直す ── 確かめる中身は同じ）。
- **`components/clients/ClientTable.tsx`**: 表（見出しの行 40px・行 52px・列 = 記号〔等幅・行の見出しのセル `<th scope="row">` の中の `<a href="/clients/{id}">`〕・属性〔`clientAttrLine` か「（属性未設定）」〕・登録日〔等幅・日本時間の 2026/09/01〕）。
  **行（`<tr>`）は押す物にしない**（押せるのは記号のリンクだけ ── 撮影の道具 `tools/shoot-run.mjs` の openClient と救済モードの保存後のリンクがこの形を使う）。書類の種類ごとの日付の列は後の段（計画 U5）。
  読み込み中・読めなかった（「一覧をもう一度読む」）・まだいない（氏名を暗号化して記号で表示する約束の文）・探して当てはまる人がいない（「探す言葉を消す」）の4つの知らせ。`ClientSearchField` が上の帯の探す欄。**実名は描かない**（`ClientRecord` は氏名を持たず、ここは記号・属性・登録日だけ）。
- **`components/clients/NewClientForm.tsx`**: 右の区画の登録の欄（`/clients?new=1` のとき `app/(dashboard)/clients/page.tsx` が出す）。欄の id（`#c-name` `#c-age` `#c-gender` `#c-care-level` `#c-household`）・名前・「氏名は暗号化して保存し、画面では記号で表示します」は以前と同じ。
  登録できたら表の先頭へ足して、その方の画面（`/clients/{id}`）を開く（以前は欄を閉じて一覧に行が増えるだけ）。**一覧を読めていないあいだは登録を止める**（表が見えないと、もういる方を気づかずに二重に登録できるため ── U0 で救済モードの保存を止めたのと同じ理由）。
- **`lib/clients/clientList.ts`（純粋）**: `clientAttrLine`（「85歳・女性・要介護2・独居」）・`filterClients`（記号と属性を画面の中だけで絞る・全角半角をそろえる・空白区切りは全部を含む・「B様」は記号そのものと比べる）・`formatRegisteredDate`・`selectedClientIdOf`。`clients/[id]/page.tsx` も属性の1行はここを使う。
- **`app/(dashboard)/clients/[id]/page.tsx`**: 右の区画の中身になった（`.legacy-page`・幅の上限・道しるべを外し、余白だけ付ける）。**中身はまだ以前の見た目**（関係者名簿・残した文字起こし・書類と承認 ── 作り替えは計画 U3a/U3b/U4）。
- **見た目** `app/globals.css` の2つ目の `@layer components`（`.client-table*`・`.client-code-link`・`.clients-*`）。部品に `btnSecondary` などの Tailwind の指定がある要素の上書きは、ここ（層 components）ではなく部品の側の Tailwind で書く（層 utilities に負けて効かない ── A5 の本番用ビルドで「新しい利用者」の押した色が出なかった）。
  スマホ（768px 未満）: 上の帯が狭いので、見出しは読み上げ用に残して見た目だけ隠し、人数と道しるべは出さない（一覧へ戻るのは下のタブ）。案内だけの右の区画は出さない。**スマホ用の形はまだ**（選んだ方の詳細や登録の欄は表の下に出る ── 計画 M1）。
- テスト: `components/clients/ClientTable.test.tsx`（jsdom・本物の Context ＋偽の通信 ── 行のリンク・行は押す物にしない・絞り込み・まだいないときの約束の文・読めなかったら知らせ〔空の一覧に見せない〕・読み直し・API に氏名が紛れても出さない・選んだ行の地と寸法の CSS）・
  `components/clients/ClientsLayout.test.tsx`（jsdom・本物の上の帯と一緒に ── 選んだ行が URL に付いてくる・**勝手に選ばない**〔`/clients` では一覧しか問い合わせない〕・選び替えても読み直さない・道しるべ・登録した利用者が読み直さずに表に出る・読めないあいだは登録できない）・`lib/clients/clientList.test.ts`。
  選んだ行の文字の 4.5:1 は `app/globals.test.ts`。利用者の画面の「この画面の使い方」が上の帯の1つだけになったことは `lib/nav.test.ts`。
- **まだ直していない文書**（D1a/D2 でまとめて）: `lib/manual/content.ts`:102・260（右上の「新規」→「新しい利用者」）・108-110・272-274（登録すると、その方の画面が開く）・280（「利用者 ＞ A様」のパンくずは上の帯の「利用者 / A様」になった）、
  `tools/shoot-plans.mjs`:55・103（`click: "新規"`。本番はまだ「新規」なので、本番に出すまで変えない）、`docs/MANUAL-VIDEO-SPEC.md`:204・224。

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき

---
*2026-09-23 / デザイントークン v2（A案「作業台」）・書体 IBM Plex・トークンのセンサー（globals.test / clerkAppearance.test）を追記。同日: Clerk の層（cssLayerName）と、ログインが要る画面の確認残り（REDESIGN-A-SIGNOFF.md）を追記。同日: Clerk の押す部品の 44px とその見張りを追記。同日: 書体の読み込みの見張りを「描いた HTML の <link>」を見る形に強めた。同日: ナビ4項目の決まり（lib/nav.ts）・A案のアイコン・書類の種類の正本（lib/create/docTypes.ts）を追記。同日: 外枠（左の帯・上の帯・共有状態の置き場所・components/shell/）を追記し、Sidebar を外した。同日: 区画（ペイン）の部品と CSS・まだ作り替えていない画面の器（.legacy-page）・ホーム＝利用者（A4）を追記。2026-09-24: 動く器の直下の物を縮ませない決まり（一覧が切れて下の行へ行けなかった A4 の不具合）を追記。同日: 利用者の作業台（一覧の表・右の 440px の区画・上の帯への差し込み・ClientsContext・勝手に選ばない ── A5）を追記し、利用者の2画面を .legacy-page から外した*
*最終更新: 2026-06-16 / 救済モード（人物像→書類一式の一括下書き・SPEC §6.5 F9）を反映*
*2026-06-15 / P2拡張: カイポケ・サイドパネル＋流し込みアダプタ(extension/)を反映*
*2026-06-11 / P1拡張: アセスメント・モニタリング生成＋共通コア(structured.ts)を反映*
