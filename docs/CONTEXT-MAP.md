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
| `lib/generation/rescue.ts` | **救済モード**：人物像から書類一式を依存順生成（アセス→第1/2表→{会議・経過・モニタリング}を並列）。上流出力を `lib/draftText` で文字列化し下流入力へ。メモ組立は純粋関数・テスト済 | 実装済 |
| `lib/draftText.ts` | 下書き→コピー用プレーンテキスト整形（純粋関数・テスト済）。救済モードの帳票連結にも使用 | P1実装済 |
| `app/api/generate/` | 認証＋`documentType`分岐（carePlan/assessment/monitoring）＋入力検証 | P1実装済 |
| `app/api/rescue/` | 救済モードAPI（Clerk認証）。人物像→`generateRescueBundle`→一式JSON。maxDuration=300 | 実装済 |
| `app/(dashboard)/create/` | 作成UI：帳票セレクタ→入力→下書き生成→確認・コピー（`components/drafts/` に表示部品） | P1実装済 |
| `app/(dashboard)/rescue/` | 救済モードUI：人物像の**構造化フォーム**（性格/生活歴/既往・診断/心身/家族・住環境/サービス/意向/補足）→一式生成→全帳票表示＋コピー。完成形まで埋める旨のバナー表示 | 実装済 |
| `extension/` | **時短エンジン**：ブラウザ拡張(MV3)。対象=**カイポケ**。サイドパネルで下書き生成→セクション単位コピー(Step1)＋カイポケ画面へ流し込み(Step2)。`src/adapters/kaipoke.js`＝CareNote→カイポケ欄マッピング(出典[KAIPOKE-DOM.md](KAIPOKE-DOM.md))。調査: [P2-KAIPOKE.md](P2-KAIPOKE.md) | **P2 Step1+Step2 実装済**（テキスト欄の半自動入力。第2表等はDOM追加取得後） |
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
   ├─ 生成: POST {baseUrl}/api/extension/generate（Bearer = CARENOTE_EXTENSION_TOKEN）
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
[救済ページ /rescue] ──(人物像の構造化フォーム)──> POST /api/rescue ──(Clerk認証)──
   └─ composePersonaNotes（構造化フィールド→ラベル付きメモに合成・純粋関数）
   └─ lib/generation/rescue.generateRescueBundle（依存順オーケストレーション・全帳票 rescue=true）
        1) generateAssessment(persona)
        2) generateCarePlan(persona + アセス結果)            ← assessmentToText で連結
        3) Promise.all[ generateMeetingSummary / generateSupportLog / generateMonitoring ]
                                                            ← carePlanToText で連結（並列）
        └─> {assessment, carePlan, meetingSummary, supportLog, monitoring}
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
| `lib/db/{clients,documents}.ts` | 利用者・帳票のデータアクセス（service role＋アプリ層 created_by スコープ。実名は client_identities に暗号化） | 実装済 |
| `app/api/clients/`・`app/api/clients/[id]/`・`app/api/documents/` | 利用者CRUD（一覧/作成/詳細＋帳票）・帳票保存（Clerk認証） | 実装済 |
| `types/{client,document}.ts` | 利用者・帳票の型 | 実装済 |
| `supabase/clients_documents.sql` | clients / client_identities / documents ＋ RLS（多層防御） | 要適用（SQL Editor） |

実行の前提: ①`supabase/clients_documents.sql` を Supabase で実行 ②`CARENOTE_PII_KEY`(base64 32B) を設定。

**B（現行ダークのまま機能追加）完了**: `app/(dashboard)/clients/`（一覧＋新規作成）・`clients/[id]/`（詳細＋保存帳票）、
Sidebar に「👥 利用者」、救済結果を選択/新規の利用者に5帳票一括保存（`/rescue` の保存パネル）。compile/build 検証済（実行は上記前提が必要・UI見た目はAで刷新）。
**残り（A＝editorial 総替え）**: layout/Sidebar/ホーム/既存ページ（create/evaluate/rescue/clients）をデザインシステムv0へ。
**未対応**: `/create` からの「利用者に保存」導線、**maskNames を generate/rescue に組み込み**（Claudeへ記号のみ）。

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき

---
*最終更新: 2026-06-16 / 救済モード（人物像→書類一式の一括下書き・SPEC §6.5 F9）を反映*
*2026-06-15 / P2拡張: カイポケ・サイドパネル＋流し込みアダプタ(extension/)を反映*
*2026-06-11 / P1拡張: アセスメント・モニタリング生成＋共通コア(structured.ts)を反映*
