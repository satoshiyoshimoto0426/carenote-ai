# Steering Log — carenote-ai ハーネス改善記録

問題が複数回発生したらここに記録し、ガイド／センサー／テストのいずれかで対策する。

## Template
```
### YYYY-MM-DD: [問題の要約]
- **発生回数**: N回
- **問題**: 何が起きたか
- **対策**: ガイド/センサー/テストのどれを追加したか
- **ファイル**: 変更したファイルパス
- **教訓**: 学んだこと
```

## Log

### 2026-05-13: cortex-lite ハーネス導入
- **発生回数**: 1回（初期セットアップ）
- **問題**: ユーザー層 `~/.claude/CLAUDE.md` を整備したのを機に、carenote-ai 側もハーネス化する必要があった
- **対策**: ガイド + センサー + Auto Review の3要素を一括導入
- **ファイル**: `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/*.sh`, `.github/workflows/quality-gates.yml`
- **教訓**: 新規プロジェクトに `/harness-init` を流せばこのセットが自動配置されるようにする

### 2026-06-09: biome.json が v1 書式のまま放置され Quality Gate が機能停止していた
- **発生回数**: 1回（製品再定義の P0 資産整理で発覚）
- **問題**: 前セッションで追加した `biome.json` が Biome v1 書式（`files.ignore` / トップレベル `organizeImports`）のまま未コミットで残り、インストール済みの Biome v2.4.10 では**設定エラーで check 自体が動かない**状態だった。つまり Quality Gate（②）が見かけ上あるのに無効化されていた。
- **対策（センサー復旧）**: 公式 `npx biome migrate --write` で v2 書式へ移行（`files.includes` の否定glob・`assist.actions.source.organizeImports`）。その後 `biome check` が初めてコードに対して走り、既存の評価UIに 37 errors を検出 → 自動修正＋手当てで緑化。
- **ファイル**: `biome.json`, `components/*`, `lib/supabase/*`, `app/(dashboard)/evaluate/page.tsx`
- **教訓**: 設定ファイルを**追加した時点で実際に走らせて緑を確認**する（"配置した≠機能している"）。Observe before Act（§2.6-C）。導入PRで `npm run check` を1回通すことを必須に。

### 2026-06-09: 既存レガシUIの a11y/style 指摘で baseline を緑化する際の severity 判断
- **発生回数**: 1回（#上と同じ P0 で連鎖）
- **問題**: Biome 初回稼働で、既存の評価UIに `noArrayIndexKey`（静的な文字列リストの index key）と `useSemanticElements`（div+role=button より `<button>` 推奨）が error として多数検出。後者はドロップゾーンが内部に `<input type=file>` を持つため `<button>` 化が HTML 的に不正で、機械的修正が不適切だった。
- **対策（severity 調整）**: 実害の大きい指摘（button type 欠落・SVGのa11y・非null assertion・キーボード操作の欠如）は**正しく修正**。一方 `noArrayIndexKey` / `useSemanticElements` は**rule severity を warn に降格**して追跡負債化（inline `biome-ignore` ではなく rule 単位で調整＝ §2.1 disable禁止の精神に沿う）。
- **ファイル**: `biome.json`
- **教訓**: 過去の steering #4/#5 と同根 ── **禁止の強さはプロジェクト成熟度に比例**させ、既存負債で無関係作業（製品再定義の P1）を止めない。warn は「見えるが止めない」追跡手段。レガシ評価UIを作り直す際に error へ再昇格する。

### 2026-07-08: 危険 Bash ガードの所有権分割 ── pre-tool-guard.sh を撤去

- 汎用ガード（force push・reset --hard/clean -f・supabase db reset・.env の git add）はグローバル層 `~/.claude/hooks/pre-bash-guard.py` が ask/block で所有するため、プロジェクト側の複製（旧式・`-f` 短縮形を素通しするドリフト版）を撤去し settings.json の登録も削除。固有分が残らないためフック自体を廃止し、再ドリフト検知の空打ちテスト `test_project_hooks.sh` を新設（7/7 PASS）。正本= HARNESS-RUNBOOK §5・決定= decisions-log 2026-07-08。
- **横展開（maoucastle-game PR#5 独立審査 Critical への対処）**: グローバル層未導入環境（CIランナー・新規マシン）では撤去したガードが完全素通しになるため、「フック全撤去」から「fail-safe 専用フックに縮退」へ変更 ── 存在チェックで所有者がいる環境では休眠し、不在時のみ旧4ガード相当（force push の -f 素通し穴は修正済）で block。settings.json に再登録。空打ちテスト16/16 PASS。あわせて main 由来の .claude/launch.json biome フォーマット違反（quality-gate を赤にしていた既存違反）を同PRで修正。
