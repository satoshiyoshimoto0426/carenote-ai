# carenote-ai - Claude Code Harness Guide

> このプロジェクトは **cortex-lite ハーネス**（Flywheel: Context Supply / Quality Gates / Auto Review / Alert-Fix）に従う。
> 横断規約は `~/.claude/CLAUDE.md` に集約済。ここではプロジェクト固有のルールのみ記す。

## Project Overview
介護記録 AI 補助プロダクト。介護事業所での日常記録（バイタル、申し送り、ケア記録）を AI が支援する。
**技術スタック**：Next.js 16 / React 19 / TypeScript / Biome / Tailwind CSS 4 / Supabase / Clerk / Vercel Blob

## Directory Structure
- `app/` — Next.js 16 App Router（ページ・API ルート）
- `components/` — React コンポーネント（再利用部品）
- `lib/` — ユーティリティ・データアクセス層
- `middleware.ts` — Clerk 認証ミドルウェア
- `supabase/` — Supabase スキーマ・migration
- `public/` — 静的アセット

## Build Commands
| 操作 | コマンド |
|---|---|
| 開発サーバー | `npm run dev` |
| ビルド | `npm run build` |
| 起動 | `npm run start` |
| リント | `npm run lint`（ESLint） |
| フォーマット | `npm run format`（Biome check --write） |
| チェック | `npm run check`（Biome check のみ） |
| 型チェック | `npx tsc --noEmit` |

## Test Strategy
- `vitest` 導入済（`npm run test`）。純粋ロジックからテスト追加（例: `lib/parseEvaluationJson.test.ts`）
- React コンポーネントテスト: `@testing-library/react` は必要時に追加
- E2E: `Playwright` 導入予定（P2 のブラウザ拡張フローで）
- カバレッジ目標: 80%

## Rules（carenote-ai 固有）
- ✅ React Server Components を基本とし、`"use client"` は最小限
- ✅ Server Actions は `app/actions/` に集約
- ✅ Supabase クエリは `lib/supabase/` の関数経由のみ
- ✅ 認証チェックは middleware.ts または `auth()` を使用
- ✅ 環境変数の型は `env.ts` で zod 検証（導入予定）
- ✅ コンポーネントは Server-first、Tailwind は arbitrary value より theme tokens を優先

## Prohibitions（carenote-ai 固有）
- ❌ `.env.local` `.env.production` をコミット禁止
- ❌ Supabase RLS（Row Level Security）を無効化しない
- ❌ Clerk のミドルウェア除外（matcher）を無断で広げない
- ❌ `next.config.ts` で型チェック無効化禁止（`typescript.ignoreBuildErrors = true` 禁止）
- ❌ React 19 → 18 へのダウングレード禁止

## Flywheel 状態（自己評価 2026-05-13 Phase 4 完了時点）

| 要素 | 状態 | 内容 |
|---|---|---|
| ① Context Supply | ★★★★☆ | CLAUDE.md＋SPEC.md＋docs/CONTEXT-MAP 整備済 |
| ② Quality Gates | ★★★★☆ | Biome(v2・稼働確認済) + tsc + vitest + Hooks |
| ③ Auto Review | ★★★★☆ | `claude-triage.yml` 配置済（要 `ANTHROPIC_API_KEY`） |
| ④ Alert-Fix | ★★☆☆☆ | Issue Template 配置済、監視は未連携 |

次に強化すべきは **SPEC.md P1 の実装（品質/生成エンジン）**, **Vercel エラー監視連携**。

## 次に取り組むべき改善

1. **SPEC.md の P1 実装**（品質エンジン＝ルールベース、生成バックエンド）
2. **`noExplicitAny` / `noArrayIndexKey` / `useSemanticElements` を warn → error へ再昇格**（レガシ評価UI整理時）
3. **GitHub Actions の Quality Gate に `npm run test` を組み込む**
4. **Playwright で E2E**（P2 のブラウザ拡張フロー）

## Steering Loop
横断規約（`~/.claude/CLAUDE.md` Section 2.2）に従う。
学習ログは `.claude/steering-log.md` に追記。

---
*ver 1.1 / 2026-06-09 / 製品を作成補助へ再定義（SPEC.md）・P0 資産整理（Biome稼働化・vitest導入）*
*ver 1.0 / 2026-05-13 / cortex-lite ハーネス導入*
