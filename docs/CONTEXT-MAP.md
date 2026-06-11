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
| `lib/generation/{carePlan,assessment,monitoring,meetingSummary,supportLog}.ts` | 帳票別の生成（スキーマ＋プロンプト構築。`*Prompt.ts` は純粋関数でテスト済）。第4表=担当者会議の要点、第5表=支援経過も対応 | P1実装済 |
| `lib/draftText.ts` | 下書き→コピー用プレーンテキスト整形（純粋関数・テスト済） | P1実装済 |
| `app/api/generate/` | 認証＋`documentType`分岐（carePlan/assessment/monitoring）＋入力検証 | P1実装済 |
| `app/(dashboard)/create/` | 作成UI：帳票セレクタ→入力→下書き生成→確認・コピー（`components/drafts/` に表示部品） | P1実装済 |
| `extension/` | **時短エンジン**：ブラウザ拡張(MV3)。対象ソフトは**カイポケ**（一旦・吉本決定 2026-06-11）。Step1=DOM非依存の転記支援パネル→Step2=アダプタで半自動入力。調査メモ: [P2-KAIPOKE.md](P2-KAIPOKE.md) | P2調査済 |
| 評価（現行） | 独立機能として継続。開発時は生成物の品質回帰チェックにも転用 | 継続 |

### 生成のデータフロー（P1実装済・3帳票）
```
[作成ページ /create] ──(帳票選択＋メモ入力)──> POST /api/generate ──(Clerk認証)──
   └─ documentType で分岐: generateAssessment / generateCarePlan / generateMonitoring
        └─ lib/generation/structured.generateStructuredDraft（共通コア）
             ├─ system = 役割 + lib/rules/<帳票>（品質ルール） ※プロンプトキャッシュ
             ├─ Claude API（構造化出力で帳票JSONを生成）
             └─> 下書き ──> components/drafts/<帳票>View で表示 → lib/draftText でコピー（人が確定）
[将来] 下書き ──> [ブラウザ拡張(P2)] ──> 既存介護ソフトへ自動入力
```

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき

---
*最終更新: 2026-06-11 / P1拡張: アセスメント・モニタリング生成＋共通コア(structured.ts)を反映*
