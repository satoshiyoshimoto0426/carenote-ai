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
| `lib/rules/carePlan.ts` | **品質エンジン**：ケアプラン作成のコツ・守るべきルールを構造化（※サンプル・要差し替え）。生成プロンプトへ注入 | P1実装済 |
| `lib/anthropic.ts` | Anthropic SDK クライアント（既定 Opus 4.8、`ANTHROPIC_MODEL` で上書き可） | P1実装済 |
| `lib/generation/carePlanPrompt.ts` | プロンプト構築（system＝役割＋ルール / user＝入力）。純粋関数 | P1実装済 |
| `lib/generation/carePlan.ts` | 下書き生成本体。構造化出力(JSON Schema)＋adaptive thinking＋プロンプトキャッシュ | P1実装済 |
| `app/api/generate/` | 認証＋入力検証＋生成呼び出し | P1実装済 |
| `app/(dashboard)/create/` | 作成UI：メモ入力→下書き生成→確認・コピー（人が確認・修正前提） | P1実装済 |
| `lib/generation/`（他帳票） | アセスメント／モニタリング等への拡張 | P1継続 |
| `extension/` | **時短エンジン**：ブラウザ拡張(MV3)。生成内容を既存の介護ソフト画面へ自動入力。`adapters/` でソフト別対応 | P2計画 |
| 評価（現行） | 独立機能として継続。開発時は生成物の品質回帰チェックにも転用 | 継続 |

### 生成のデータフロー（P1実装済）
```
[作成ページ] ──(memo入力)──> POST /api/generate ──(Clerk認証)──
   └─ lib/generation/carePlan.generateCarePlan
        ├─ system = 役割 + lib/rules（品質ルール） ※プロンプトキャッシュ
        ├─ Claude API（構造化出力で第1・2表JSONを生成）
        └─> 下書き(CarePlanDraft) ──> 作成ページで確認・コピー（人が確定）
[将来] 下書き ──> [ブラウザ拡張(P2)] ──> 既存介護ソフトへ自動入力
```

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき

---
*最終更新: 2026-06-09 / P1: ケアプラン生成プロトタイプ（第1・2表）実装を反映*
