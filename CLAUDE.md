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
- **安全テストの一覧 `tools/safety-tests.json`**（2026-09-23 吉本さん決定）: `npm test`（`tools/run-tests.mjs`）が毎回照らし合わせ、
  名指しのファイルが消えた・名前が変わった／守るフォルダ（`lib/privacy` `tests/api` `lib/recording` `lib/transcribe` `lib/rescue`）が
  最低件数を下回った／守るファイルに `.skip(` `.only(` `.todo(` など飛ばす書き方がある（`const s = it.skip` のように括弧なしで別名へ入れる形も）／集計に skipped・todo が1件でもある、のどれかで失敗する
  （判定は `tools/testManifest.mjs`、その検査は `tools/testManifest.test.ts`）。
  集計行は **stdout だけ**から読む（テストが `console.error` で書いた偽の集計行を本物と取り違えないため）。
  引数なしの実行では vitest の JSON レポートでも「全ファイルが走り・全テストが合格」かを確かめ（2つ目の判定・読めなければ失敗）、
  落ちたときは JSON レポートから、飛ばされたテスト・走らなかったファイルを**ファイル名とテスト名で**挙げる。
  入口を書き換えて見張りごと飛ばす変更（`package.json` の test を `vitest run` にする・CI の `npm run test` を変える・
  `quality-gates.yml` に `continue-on-error` や `if:` を足す）も、同じ検査が落とす。
  安全テストを足したら一覧にも足す。消す・弱めるときは吉本さんの承認（横断規約 §2.7-C）のうえで、一覧も同じコミットで直す
- React コンポーネントテスト: `@testing-library/react` は必要時に追加。`renderToStaticMarkup` で描いた HTML は
  `tests/helpers/markup.ts`（parse5）で**木として読む**。文字列の正規表現・`toContain` で属性や押せる/押せないを見ない
  （class の `disabled:` や title のふきだしで満たされ、壊れても緑になる ── 2026-09-23 steering-log）。新しい検査は部品をわざと壊して赤になるのを確かめる。
  `textOf` は属性の中身と、隠す印（`hidden` 属性・`aria-hidden="true"`・class の `hidden`/`invisible`/`sr-only`・style の `display:none`/`visibility:hidden`）の
  ある要素の文字を数えない。CSS ファイル側の見え方（色・overflow・`md:hidden` など）は判定しない。「出していない」は `textOf` でなく HTML 全体で見る。
  `elementsOf` は隠した要素も返すので、**部品が出ていること**（切り替え・チェックの印・赤い印）を数えるときは `isReachable` でも絞る（2026-09-24 steering-log）。
  **検査の名前は、検査した場合だけを言う**（畳んだ欄だけを見て「なぜ赤いかが文字で読める」と名付けたため、開いた欄では
  ふきだしにしか理由が無い穴が隠れていた ── 2026-09-23 steering-log）。画面が場合分けしているなら、場合ごとに検査を置く
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

1. **品質エンジンの継続強化**: `lib/rules/` は v1（吉本=ケアマネ歴13年の知見）反映済。NG表現→言い換え集・新人がやりがちなミス等を随時追記。コンサル先固有の様式・運用は `docs/HEARING-SHEET.md` で確認（§5は主に社内で充足済）
2. **`noExplicitAny` / `noArrayIndexKey` / `useSemanticElements` を warn → error へ再昇格**（レガシ評価UI整理時）
3. ~~GitHub Actions の Quality Gate に `npm run test` を組み込む~~（2026-09-12 実施済）
4. **Playwright で E2E**（P2 のブラウザ拡張フロー）

## Steering Loop
横断規約（`~/.claude/CLAUDE.md` Section 2.2）に従う。
学習ログは `.claude/steering-log.md` に追記。

---
*ver 1.1 / 2026-06-09 / 製品を作成補助へ再定義（SPEC.md）・P0 資産整理（Biome稼働化・vitest導入）*
*ver 1.0 / 2026-05-13 / cortex-lite ハーネス導入*
