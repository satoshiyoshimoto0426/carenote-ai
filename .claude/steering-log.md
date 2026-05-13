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
