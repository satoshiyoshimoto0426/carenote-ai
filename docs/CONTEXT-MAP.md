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

外部サービス: **Clerk**（認証）, **Supabase**（DB・RLS）, **Vercel Blob**（PDF一時保管）, **Claude API**（評価・※今後は生成も）。

## 3. 再定義後に追加予定のモジュール（SPEC 準拠・計画）

> 詳細と段階フェーズは [`../SPEC.md`](../SPEC.md) を参照。製品の軸は「評価」から「作成補助」へ。

| モジュール（計画） | 役割 | フェーズ |
|---|---|---|
| `lib/rules/` | **品質エンジン**：作成のコツ・守るべきルールを構造化。生成プロンプトへ注入 | P1 |
| `lib/generation/` | 下書き生成ロジック（アセス／ケアプラン第1・2表／モニタリング） | P1 |
| `app/api/generate/`（仮） | 入力＋ルール → 下書き生成 API | P1 |
| `extension/` | **時短エンジン**：ブラウザ拡張(Manifest V3)。生成内容を既存の介護ソフト画面へ自動入力。`adapters/` でソフト別の欄対応を差し替え | P2 |
| 評価（現行） | 独立機能として継続。開発時は生成物の品質回帰チェックにも転用 | 継続 |

### 計画後のデータフロー（概念）
```
[入力: 面談メモ/音声/既存データ] ─> app/api/generate ─(lib/rules + lib/generation + Claude API)─> 下書き
        └─> [ブラウザ拡張] ─(adapters)─> 既存の介護ソフトの欄へ自動入力（人が最終確認して確定）
```

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき

---
*最終更新: 2026-06-09 / 再定義(SPEC v0.1)に合わせて新規作成*
