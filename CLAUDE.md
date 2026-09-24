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
  jsdom で動かす検査（`*.live.test.tsx`・`components/clients/*.test.tsx` など）も、「出ている」は `textContent` でなく
  `shownText(container, 要素)`・`isShown(container, 要素)`（同じ判定の橋 ── jsdom の `textContent` は隠した文字も数える）で見る。
  「出していない」は `textContent`・`innerHTML` のまま（2026-09-24 に2つの枝を取り込んだときに寄せた）。
  **検査の名前は、検査した場合だけを言う**（畳んだ欄だけを見て「なぜ赤いかが文字で読める」と名付けたため、開いた欄では
  ふきだしにしか理由が無い穴が隠れていた ── 2026-09-23 steering-log）。画面が場合分けしているなら、場合ごとに検査を置く
- E2E: `Playwright` 導入予定（P2 のブラウザ拡張フローで）
- カバレッジ目標: 80%

## Rules（carenote-ai 固有）
- ✅ React Server Components を基本とし、`"use client"` は最小限
- ✅ Server Actions は `app/actions/` に集約
- ✅ Supabase クエリは `lib/supabase/` の関数経由のみ
- ✅ **lib/db の読み書きは「0件」と「DB の失敗」を分ける**（2026-09-24 steering-log ── 同じ種類を3回踏んだ）:
  1件を読むときは `maybeSingle`（`single()` は0件にもエラーを返す）。0件・uuid の形でない id（`isMalformedIdError`）は
  null / [] / false、それ以外の失敗は `lib/db/errors.ts` の `DbAccessError`（職員向けの `publicMessage` つき）を投げ、
  入口は 503 と `e.publicMessage` を返す（DB の詳しい理由はログだけ）。「失敗」だけを表す戻り値（保存の null など）を
  使うときは、`lib/db/dbFailures.test.ts` の CONTRACTS に理由つきで載せる（載っていない async 関数があると落ちる）
- ✅ 認証チェックは middleware.ts または `auth()` を使用
- ✅ 環境変数の型は `env.ts` で zod 検証（導入予定）
- ✅ コンポーネントは Server-first、Tailwind は arbitrary value より theme tokens を優先

## Prohibitions（carenote-ai 固有）
- ❌ `.env.local` `.env.production` をコミット禁止
- ❌ Supabase RLS（Row Level Security）を無効化しない
- ❌ Clerk のミドルウェア除外（matcher）を無断で広げない
- ❌ `next.config.ts` で型チェック無効化禁止（`typescript.ignoreBuildErrors = true` 禁止）
- ❌ React 19 → 18 へのダウングレード禁止

## 既知の落とし穴（この PC）
- **自分が触っていないファイルで `biome check` が format 違反を出したら、まず改行コード（CRLF）を疑う**。
  この PC は Git のシステム設定（`C:/Program Files/Git/etc/gitconfig`）が `core.autocrlf=true` で、git が書き出したファイル
  （`git stash`・`stash pop`・checkout・新しい worktree）が CRLF になる。repo の中は LF のままなので `git status` は綺麗に見える。
  - 確かめる（Bash）: `git ls-files --eol | grep -E 'w/(crlf|mixed)'` ── 1行でも出たら、それが原因。
    `w/crlf` だけを探さない: git が CRLF で書き出したファイルに LF で書き足すと `w/mixed` になる（.md は Biome が見ないので赤にならず残る）。
  - 戻す（Bash）: `git ls-files --eol | grep -E 'w/(crlf|mixed)' | cut -f2 | xargs -r sed -i 's/\r$//'`（行末の CR を消すだけ・中身は変えない）。
    このあと `git status` に中身の差が無い `M` が残る（git が大きさの変化だけで「変更あり」とみなす）。
    `git diff <ファイル>` が空なのを確かめてから `git add <ファイル>` で消す。中身も変えたファイルは、いつもどおり自分の変更として扱う。
  - 根本の直し（repo の根の `.gitattributes` に `* text=auto eol=lf`）は枝 `harness/stop-gates` で進行中（2026-09-23 時点・コミット前）。
    main に入り、main をこの枝に取り込んだら、この項目は消す（経緯と未了の追跡= `.claude/steering-log.md` 2026-09-23「git が書き出したファイルが CRLF になり」）。
- **道具（`tools/*.mjs` など）で `fs.rmSync` を使わない**。この PC の Node v24.4.1 は、日本語を含むパス（repo の置き場所
  `OneDrive\デスクトップ\…`）で `rmSync` を呼ぶと、プロセスごと黙って落ちる（終了コード 127・出力なし）か、消さないまま成功を返す。
  ファイルは `unlinkSync`（無ければ `ENOENT` を無視）で消す。`npm test` が全テスト合格の後に合否の1行を出さずに 127 で終わっていた
  （2026-09-24 steering-log）。見張り= `tools/testManifest.test.ts`（tools の道具に `rmSync` があれば落ちる）。
- **`npm run build` が `EPERM: operation not permitted, unlink '…\carenote-ai\.next\…'` で落ちたら、コードではなく OneDrive を疑う**（2026-09-23〜24 に3回）。
  repo が OneDrive の中にあり、ビルドの作業場所 `.next` も同期されている。Next はビルドの最初に `.next` の中（cache 以外）を消すが、
  フォルダをファイルとして消そう（unlink）として止まる。OneDrive が書き出した直後のフォルダを同期している最中に起きる、と推定（未確認）。
  - 確かめる: ①ログに `EPERM`・`unlink`・`\.next\` の3つがそろう ②名前の出た場所がフォルダ
    （Bash: `node -e "console.log(require('fs').statSync(process.argv[1]).isDirectory())" '<ログに出たパス>'` → `true`）。
    `fsutil reparsepoint query` は見分けに使えない ── OneDrive の中は `app` や `node_modules` にも同じ種類の印（`0x9000?01a`）が付き、その状態の `.next` でもビルドは通る。
  - 戻す: ①数分待って、同じ場所で1回だけやり直す（2026-09-24 は失敗の約15分後に、`.next` を消さずに通った。待つ長さの目安は未確認）。
    ②同じ形で2回目も落ちたら、そこでやり直しをやめ（同じ理由で2回＝止める規則）、OneDrive の外の写しでビルドする（Bash・carenote-ai の中で）:
    ```
    T=$(mktemp -d)   # %TEMP% の下 = OneDrive の外
    git ls-files -z -co --exclude-standard | xargs -0 cp --parents -t "$T"
    MSYS_NO_PATHCONV=1 cmd /c mklink /J "$(cygpath -w "$T/node_modules")" "$(cygpath -w "$PWD/node_modules")"
    (cd "$T" && npm run build > build.log 2>&1; echo rc=$?)
    MSYS_NO_PATHCONV=1 cmd /c rmdir "$(cygpath -w "$T/node_modules")"
    ```
    写しはコミット前の変更も含み、`.gitignore` で外れる `.env.local` は写さない（鍵を外へ出さない。ビルドは鍵なしで通る）。
    **片づけは最後の行（node_modules への橋＝ジャンクションを外す）が先**。`$T` に node_modules が無いのを確かめてから `$T` を消す。
    橋を付けたまま `$T` を消すと、道具によっては本物の node_modules の中まで消すおそれがある（試していないので、必ず先に外す）。
    ③`.next` を丸ごと消す手は、ファイルの削除なので吉本さんに聞いてから（①②で足りるので、ふつうは要らない）。
  - 根本の直し（repo を OneDrive の外へ移す・`.next` を同期から外す など）は環境の選択で、決めるのは吉本さん。
    決まって直ったら、この項目は消す（経緯と未了の追跡= `.claude/steering-log.md` 2026-09-24「OneDrive の中の `.next`」）。

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
