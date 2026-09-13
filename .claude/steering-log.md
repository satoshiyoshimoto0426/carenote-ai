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

## 2026-09-11 画面（"use client"）がサーバー専用モジュールを値 import してビルド断
- 事象: `app/(dashboard)/rescue/page.tsx` が `lib/generation/rescueIntake.ts` から定数（種別一覧）を import → 同ファイルが Anthropic SDK を読むため `node:fs` 等がブラウザ向けビルドに混ざり `Module build failed`。tsc・vitest は通るので build まで回さないと気づけない。
- 対策: 型と定数を `lib/generation/intakeTypes.ts`（純粋）へ分離し、画面はそちらを読む。rescueIntake.ts は `export *` で再輸出。
- 学び: 画面から `lib/generation/*` を **値 import する時は純粋モジュールか確認**（`import type` なら消えるので安全）。完了報告前の `npm run build` は省略しない（§2.8-B）。

## 2026-09-11 同名系ヘルパーの取り違え（getValue(draft,key) を欄の読み取りに使い、追記が上書きになる欠陥）
- 事象: 追記モード（previewAppend/applyAppend）と転記シート（injectKaipokeSheet）で `getValue(el)` と書いたが、既存の `getValue(draft, key)` は下書きから値を取る関数。要素を渡すと常に "" → 「既存は空」と誤判定し、**過去の記録を消さないための機能が上書きになる**欠陥。テストは DOM を通らないので緑のまま。コミット前の読み返しで発見。
- 対策: `readFieldValue(el)` を新設して両所を差し替え。テストで「getValue に要素を渡すと空」を明示。
- 学び: ①DOM を触る関数は名前に `Field`/`El` を入れて下書き系と区別する ②「消さない」系の安全機能は、実機（またはjsdom）で **既存文章が残ること**を必ず確認する（次回: jsdom テストを1本足す）。

## 2026-09-12 独立審査（graph-doubt）が拾った「自分では見えない」欠陥 ── 4つの型
- **事象**: main 取り込み前の敵対検証で critical 8件。自分のセッションのセルフレビューでは1件も見えていなかった。
  1. **見えない文字**: `vault.ts` に生の NUL を書き、git がバイナリ扱い→差分が PR にも triage にも出ない。Write ツールは `\uXXXX` を実文字に展開することがある（本セッションでゼロ幅文字でも再発）。
  2. **fail-closed の例外が広すぎる**: 関係者名簿だけ「表が無くても動くように」と warn で続行＝家族名が消えないまま AI へ。安全網に「便利な例外」を作った。
  3. **戻した値の再送**: 二枚方式で実値に戻した下書きを、後段 API が「記号版のはず」と信じてそのまま AI へ。**設計変更（restoreDeep 導入）が、前提の古い呼び出し側を壊す**型。
  4. **テストが呼び出し側を守っていない**: 純粋関数は緑でも、ルート層（SSRF・再黒塗り・vault 復元）は1行消しても緑。
- **対策**: ①センサー `tools/check-invisible.mjs`（CI＋Stop フック） ②関係者表も 503（テストで固定） ③規約「戻した帳票を再び AI へ送る API は maskDeep を通す」を CONTEXT-MAP へ ④ルート層テスト4本＋偽 Supabase テスト＋jsdom DOM テスト。
- **学び**: (a) 慎重領域は「自分で合格判定しない」（§2.7-E）が実効性を持った初回。graph-doubt 30 エージェント・約 24 分・8件確定。(b) 「既存も同じだから安全」と思った箇所（Blob 公開ストア）が一番重い指摘だった。(c) Write ツールでエスケープ列を書く時は、書いた直後に `node tools/check-invisible.mjs` を回す。(d) `git stash` / `pop` は autocrlf=true の環境で作業ファイルを CRLF に戻し biome を赤にする ── 使った後は `sed -i 's/\r$//'` で戻す。

## 2026-09-12 CI の自動審査（claude-triage review-pr）が「成功」のまま何も審査していなかった
- **事象**: PR #9 の review-pr が 9 秒で success。ログに `Unexpected input(s) 'prompt'` の警告があり、`@beta` 版のアクションは `prompt` 入力を受け付けず、Claude の実行ステップが全部 skipped。独立審査 critical #2「PR＋triage が一度も走った証拠がない」の実体。
- **対策**: MaouCastle 本体（2026-09-06 に実 PR で疎通済み）と同じ `@v1`＋`claude_args`（--max-turns 40）＋`timeout-minutes: 20` へ揃える。triage-issue 側も同じ穴なので同時に修正（横展開）。
- **学び**: 「CI が緑」は「検査が走った」と同義ではない。所要秒数が異常に短い job は疑う（Observe before Act §2.6-C）。センサー候補: review-pr の成功条件に「レビュー投稿の有無」を加える。

## 2026-09-12 移行が要る変更を「実装したから有効」と書いた ── PR #14（名簿の事業所共有）独立審査
- **事象**: 名簿の読み出し範囲を `created_by` から「事業所（org_id）＋組織加入前の自分」に広げたが、
  1. **既存データに届かない**: 本番の `clients` は全件 `org_id = null`。組織を有効にしても**同僚には見えない**まま。
     SQL には索引だけ入れて `update ... set org_id = ...`（移行）を書いていなかったので、Issue #13 は実質未解決。
  2. **採番が件数ベース**: 「事業所の行」と「自分の org_id=null 行」が混ざる範囲を `count` で数えて `A,B,...` を振ると、
     別人が同じ `A` を取りうる。部分一意索引（`where org_id is not null`）はこの組合せを止めない。
     記号が重なると `restoreNames` が**他人の実名**に戻す（審査側が実行で再現）。
  3. **断定**: マニュアル・DATA-HANDLING に「組織に所属していれば全員分に効く」と書いた（移行前は成り立たない）。
- **対策（同 PR）**: ①採番を「範囲内の最大＋1」へ（`clientCodeIndex` を新設・往復テスト800件） ②`assertCodesUnique`
  で「同じ記号に違う氏名」を見つけたら送信中止（移行の適用有無に依存しない安全網） ③名簿の読み出しに件数上限
  （900件）を付け、超えたら中止（PostgREST は既定1000行で**黙って**打ち切る＝fail-open だった） ④壊れた orgId は
  黙って本人スコープへ落とさず例外 ⑤実名の保存に失敗したら利用者ごと取り消す ⑥`supabase/client_org_scope.sql` に
  移行手順（手順2の重複チェック→手順3の backfill→手順4の確認）を同梱 ⑦ルート9本の範囲受け渡しを
  `tests/api/orgScope.route.test.ts` で縛る（2本を壊して2件落ちることを実測）。
- **学び**: (a) **スキーマの意味を変える変更は「新規データの経路」と「既存データの移行」を必ず対で出す**
  ── 実装だけでは既存利用者に1ミリも届かない。(b) 「範囲」を広げたら**採番・一意制約も同じ範囲**に合わせる
  （片方だけ広げると衝突する）。(c) DB クライアントの**既定の行数上限は黙って効く** ── 安全に関わる読み出しには
  明示の limit と超過時の中止を付ける。(d) ドキュメントの「〜に効きます」は前提条件（管理者の作業）とセットで書く。
- **補足（審査の誤検知）**: 審査は「`lib/db/clients.test.ts` が同一コミットのまま 20 回中 6 回失敗する」と報告したが、
  ローカルで 12 回連続実行して 12 回とも 12 passed。並列エージェントが同じ作業ツリーを書き換えていたための汚染と判断。
  **審査の指摘も一次情報で確かめてから直す**（§2.6-A は審査結果にも適用する）。

## 2026-09-13 独立審査を「作業中の作業ツリー」で回すと、審査と作業が互いを壊す
- **事象**: graph-doubt（並列エージェント）を carenote-ai の実ディレクトリに対して起動したまま、
  同じディレクトリで `npx tsc` / `npx vitest` を実行したら
  `This is not the tsc command you are looking for` で落ちた。調べると `node_modules/.bin` が空。
  審査エージェントが検証のため `npm ci` / `npm install` を走らせ、その最中は `.bin` が一時的に消える。
  **前回（2026-09-12）の審査が「テストが20回中6回失敗する」と報告したのも同じ原因**
  （ローカルで12回連続実行して 12/12 通過・再現せず）。審査側の環境汚染を「実装の不安定」と読み違えていた。
- **対策**: ①審査を回している間は同じツリーで npm 系コマンドを実行しない（docs 編集・git は可）
  ②次回から審査エージェントには `isolation: 'worktree'`（各エージェントに git worktree を与える）を検討する
  ③審査プロンプトに「作業ツリーを書き換えないこと」と書くだけでは不十分だった
  ── `npm ci` は「書き換え」と認識されにくいので、隔離で構造的に防ぐ。
- **学び**: **審査の指摘も一次情報で確かめる**（§2.6-A は審査結果にも適用）。
  とくに「不安定」「たまに失敗する」系の指摘は、審査環境そのものを疑う。

## 2026-09-13 「実装した」と「効いている」の距離 ── PR #14 第2回 独立審査で確定した critical 群
- **事象**: 名簿の事業所共有について、実装・テスト・移行SQL・文書まで揃えて出したが、審査は不合格。
  型の違う穴が同時に出た:
  1. **鍵になる前提が外部設定に依存し、アプリからは触れも見えもしない** ── Clerk の `orgId` は
     「所属」ではなく「いま選んでいる事業所（Active Organization）」。アプリに組織を選ぶ導線が1つも無く
     （`OrganizationSwitcher`/`setActive`/`useOrganization` が 0 件）、null でも黙って本人スコープへ縮退する。
     それなのに顧客配布物（説明書・マニュアル・PDF）は「所属していれば共有されます」と断定していた。
  2. **親子データを別々の条件で引くと、片方だけ落ちても誰も気づかない** ── 利用者・氏名・関係者の3表を
     それぞれ `org_id` で絞っていたため、移行が3表そろわない／組織未選択で登録された関係者がいると
     「利用者は見えるのに氏名だけ名簿から落ちる」。落ちた名前は置換も漏れ検査も効かず素通り。
  3. **安全網が「見えている範囲」しか見ていない** ── `assertCodesUnique` は復号できた氏名だけを突き合わせ、
     `expandAliasVariants` は同じ表記の2人目を**黙って捨てて**いた（夫婦・同姓同名・二重登録で実在）。
     捨てられた人は名簿に載らず、本文の「A様」を戻すと別人の氏名になる。
  4. **待っても直らない失敗に「少し待ってからもう一度」と言っていた**。
  5. **生成物が仕様に適合していなかった** ── 字幕 .vtt の `NOTE` 直後に空行が無く、ffmpeg では字幕 0 件。
     手順書には「残しても再生に影響はない」と誤った断定。
  6. **テストが緑でも走っていなかった** ── jsdom のテストファイルがワーカー起動タイムアウトで落ちても、
     vitest は `Errors 1 error` と出しながら**終了コード 0** を返す。CI もローカルも合格と判定していた。
- **対策（同PR）**: ①`components/SharingStatus.tsx` で共有状態を常時表示＋その場で切替、`orgId` が null なら warn
  ②氏名2表を**親の利用者IDで引く**（`selectByClientIds`）③重複記号は**復号前**に検出、表記衝突は
  `AliasConflictError` で停止 ④`PermanentAliasError` を分け `ALIAS_PERMANENT_MESSAGE` で返す
  ⑤`buildVtt` に空行を入れ、ffmpeg で 13/14 件パースされることを実測＋テストで固定
  ⑥`tools/run-tests.mjs`（ディスク上の .test.ts 数と実際に走った数を突き合わせ、`Errors` 行があれば失敗）を
  `npm test` に据える ⑦ルート8本に `resolveScope` を入れ、壊れた id でも 503 の JSON で止める。
- **学び**:
  (a) **外部サービスの設定に依存する機能は、「効いているか」を画面に出す**。出せない前提は、文書で
      断定してはいけない（「設定すれば効く」は、設定できる導線があって初めて言える）。
  (b) **親子データは親を唯一の境界にする**。子を親と別の条件で引くと、不整合が必ず fail-open になる。
  (c) **安全網は「捨てる」実装と相性が悪い**。黙って捨てた瞬間、検査対象から消える。捨てるなら止める。
  (d) **終了コード 0 は「全部走った」を意味しない**。テスト本数・ファイル本数まで突き合わせて初めて証拠になる。
  (e) 生成物（字幕・PDF）は**外部のパーサで1回は通す**。人が見て正しそうでも機械が読めないことがある。
