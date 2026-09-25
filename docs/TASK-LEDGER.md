# CareNote AI タスク管理書（2026-09-25 現在地から作り直し）

> **これは何か**: 2026-09-25 時点で「まだ終わっていないこと」をすべて集め、優先順位・担当・次の一手・根拠を付けた一覧。6つの観点（記録・作り直しの計画・見張りの仕組み・GitHub・過去の宿題・新しい方向性）から 191件を集め、重複をまとめて **102件** にし、別の AI が「終わったものが混ざっていないか・抜けがないか」を確かめた（指摘14件を反映済み）。
> **使い方**: 上から順に読む。「吉本さんが決めること」は返事をもらったら ~/.claude/decisions-log.md に記帳する。終わった項目は消さず「済（日付）」にする。次の版は docs/ROADMAP.md 第5版と同時に作る。
> **優先順位**: P0＝いま最優先（本番の安全・壊れているもの）／P1＝次にやる／P2＝そのあと／P3＝いつか。
> **根拠の欄**は開発向け（ファイル名や命令の結果）。吉本さんは読み飛ばしてよい。

## いまの状態（要約）

本番（carenote-ai.vercel.app）は 2026-09-24 に作り直しの第1段（新しい外枠・利用者の作業台・つくるの見た目・書類保存の範囲チェック・日付 API）を PR #15・#16 で出し、CI は緑（main 991a753）。自動レビューは PR #16 は完了・承認ですが、第1段の本体 PR #15 は途中で終わり判定が出ていません（Issue #37 の再発）。ただし本番に出た分の独立審査（graph-doubt）と吉本さんの実機確認（確認表の9行）がまだで、事業所の組織（Clerk）の有効化・文字起こし保存の表・点検のモデル名の3つは本番の安全と動作に直結する未了です。作り直しの残り（点検・履歴・救済モードの見た目3コミット、日付列 A7、つくるの左右分割 C0〜C9、点検 K1〜K3、スマホ M1/M2）と、新しい方向性「ケアマネの右腕」の段階の順番は吉本さんの決定待ちです。ハーネス側は3つの作業ツリーに未コミットの修正が残り、独立審査3巡目を打ち合わせのために途中で止めたままです。法務（説明書の専門家レビュー・カイポケ規約照会）は外部の待ち時間が最長なので、今週中に依頼を出すのが最も効きます。

## 言葉の説明（初めて見る言葉はここ）

| 言葉 | 意味 |
|---|---|
| 独立審査（graph-doubt） | 別の AI に「疑う目」で見させて、間違いや抜けを探す仕組み。人の第三者レビューの代わり |
| 自動レビュー（review-pr） | GitHub に変更を出すたびに AI が自動で中身を審査する仕組み |
| CI（自動チェック） | GitHub に変更を出すたびに、書き方・型・組み立て・テストを自動で確かめる仕組み |
| PR（取り込みの申請） | 変更を本番の元（main）へ入れるための申請。自動チェックと審査を通してから取り込む |
| main | 本番に出ている元のプログラム |
| 枝（ブランチ） | 本番を触らずに変更を進めるための、プログラムの分かれ道 |
| コミット | 保存した変更のひとまとまり |
| 衝突（コンフリクト） | 同じ場所を2つの枝が別々に直していて、どちらを採るか手で選ぶ必要がある状態 |
| stash（退避） | 途中の変更をいったん脇へどけて保管したもの |
| ハーネス | 開発の見張りの仕組み全体（危険な操作を止める・終わりに検査する など） |
| Stop hook（終わりのチェック） | Claude が作業を終えるたびに自動で走る検査 |
| 関門 G1〜G5 | 本番の利用を始める前に必ず通す確認事項（ROADMAP の番号） |
| G3b | 事業所の中で、他の職員が登録した利用者の名前も記号に置き換わるかの関門 |
| Clerk の組織 | ログインの仕組み（Clerk）の中の「事業所」のまとまり。職員を同じ事業所として扱うために必要 |
| Supabase / SQL | データベースと、そこへ直接指示を出す命令文 |
| Blob ストア | ファイルの保管庫（Vercel）。「公開」だと URL を知る人は誰でも読める |
| RLS / JWT | データベース側にも掛ける二重の鍵（今はアプリ側の鍵だけ） |
| CoT（考えの筋道） | 慎重な変更の前に、事実・解釈・選択肢・判断を順に書いて吉本さんに見せる書き方 |
| §2.7-F など | Claude の作業規約の項番（~/.claude/CLAUDE.md） |

## 1) 今すぐ（本番の安全・壊れていないかの確認）

> 2026-09-24 に途中段階を本番へ出したため、出口の審査と実機の確認が本番の後回しになっている。ここが済むまで次の段には進まない。

### T-NOW-01　本番の新しい画面を吉本さんがログインして確かめる（確認表の「未確認」9行＋行8の動作確認）
- **優先**: P0 いま最優先　**担当**: 吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **止めているもの**: 本番に出た画面の実機サインオフ（§2.8-B）。これが無いと「本番で崩れていないか」を誰も見ていない状態
- **次の一手**: docs/REDESIGN-A-SIGNOFF.md の行 1・2・3・5・6・7・9・11・12 の「吉本さんの手順（1〜3手）」を PC とスマホで通し、崩れた所・読めない所を Claude に伝える。行8（ログイン直後の行き先）は設定の反映済み（変更後に本番の公開が2回あり）。ログアウト→ログインで「利用者」が最初に開くかの動作確認だけが未で、通ったら「済」にする。関係者の実名が出るので人のいない所で。
- <small>根拠（開発向け）: docs/REDESIGN-A-SIGNOFF.md:16-27（状態列: 行1,2,3,5,6,7,9,11,12＝未確認、行8＝未確認（吉本さんの設定待ち）。grep -c で 済0件・未確認10件・未決定3件）／同:3-5「全部に済が付くまで main へ出さない」は 2026-09-24 の決定（wt-harness/decisions-log.md「途中段階を本番へ」）で解除／Vercel の NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL・AFTER_SIGN_UP_URL → /clients は本日 lead が変更済／本番＝main 991a753（`npx vercel inspect` target production・Ready 2026-09-24 21:35 JST、CI run 36000054861 Quality Gates success）</small>

### T-NOW-02　今日本番に出た第1段（外枠・利用者の作業台・書類保存の範囲チェック・日付 API）の独立審査（graph-doubt）をまとめて回す
- **優先**: P0 いま最優先　**担当**: Claude　**状態**: ✅審査は済（2026-09-25・判定＝**不合格**：重大 6件・軽微 2件が確定、未確定 41件）　**大きさ**: 中(半日)
- **止めているもの**: 第1段は自動レビューも独立審査も通っていない状態で本番にある（安全網・データ・認証に触る変更を含む）
- **結果（2026-09-25）**: 一覧は docs/reviews/2026-09-25-redesign-m1-doubt.md。確定した重大6件は T-NOW-05〜10 に、軽微2件は T-HN-07・T-HN-08 に割り当てた。未確定の41件（反証の上限のため未検証）は一覧に残し、着手時に確かめ直す。
- **次の一手（元の記載）**: main 991a753（PR #15・#16 の差分。特に lib/db/clients・POST /api/documents の範囲チェック・SharingStatus）を対象に /graph-doubt を1回通し、critical は同日に直して小さな PR で出す。結果を REDESIGN-A-SIGNOFF.md と decisions-log に残す。
- <small>根拠（開発向け）: scratchpad/m1-status.txt 末尾: lens:delivery/invent/live/mutation/spec/survival => FAILED、merge => FAILED／scratchpad/wf-m1-finish.js:3-4,94-95（phase('Review') の await workflow('graph-doubt') が未実行）／`gh pr view 15 --json reviews` → reviews: []／`gh pr view 15 --comments`: github-actions のコメントは「Auto Review 進行中」・Critical 3項目が「サブエージェント実行中」・判定（APPROVE/…）未チェックのまま「Claude finished in 2m 25s」＝判定なしで終了（PR 側の review-pr 実行 35967886853 は success だが中身は判定なし。PR #16 の 35976526820 は完了・承認）／wt-harness/decisions-log.md 2026-09-23「出口ゲート: 安全網・データ・認証にかかわるものは独立審査」／lead 検証「milestone 1 の graph-doubt は未実施」</small>

### T-NOW-03　点検（PDF の AI 評価）は本番でいま動いていない（AI のモデル名が存在しない・Issue #4）── 直してから1回だけ確かめる
- **優先**: P0 いま最優先　**担当**: Claude＋吉本さん　**状態**: ✅済（2026-09-25）　**大きさ**: 小(〜1時間)
- **止めているもの**: 動かなければ本番の機能が1つ止まっている。点検の作り直し（K1〜K3）の前提
- **結果（2026-09-25）**: PR #17 を main へ取り込み（04:03）→ 本番へ自動公開（04:04）→ Issue #4 は自動で閉じた。Claude が本番で、実名の無い試験用 PDF（英文1ページ・「Client A」）を撮影用の試験アカウントで点検し、25秒で評価結果が出た（中身がほぼ空なので 0/27・要改善は正しい動き）。吉本さんの手での確認②は不要になった。残る点検の課題は K1〜K3（見た目の作り直し・実名が履歴に出る件）。
- **次の一手**: ①Claude が点検専用のモデル名の定数を作り、存在しない名前 claude-sonnet-4-5-20250514 を正しい名前（claude-sonnet-4-5 ＝ 2026-09-25 に公式一覧で確認）に直して小さな PR で出す（Opus に黙って寄せない）→ ②吉本さんが実名の無い試験用 PDF で本番の点検を1回実行し、結果が出るかを Claude に伝える → ③Issue #4 を閉じる。
- <small>根拠（開発向け）: app/api/evaluate/route.ts:73 `model: "claude-sonnet-4-5-20250514"`・:70 `"anthropic-beta": "pdfs-2024-09-25"`／lib/anthropic.ts:8 `CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8"`／`gh issue list` → #4 OPEN（本文は「Sonnet 4.5 は claude-sonnet-4-5-20250929」と指摘。2026-09-25 に claude-api スキルの正本 shared/models.md:92 で Sonnet 4.5 の ID は claude-sonnet-4-5-20250929（別名 claude-sonnet-4-5）と確認。route.ts:73 の名前はどの一覧にも無い＝本番の点検は API に弾かれている）／docs/ROADMAP.md:142／scratchpad/redesign-plan.md:336 K0・OPEN【点検が動いているか】</small>

### T-NOW-04　事業所（Clerk の組織）を作って職員を入れ、登録済み利用者を事業所へ移し、職員2人で「他人の登録利用者の名前が記号に変わる」ことを確かめて Issue #13 を閉じる（管理者手順③④・関門 G3b）
- **優先**: P0 いま最優先　**担当**: 吉本さん＋Claude　**状態**: ⛔止める（2026-09-25）── **先に T-NOW-05（ログインの環境）と T-NOW-06（事業所の設定）を決める**。開発用の環境で作った事業所・職員は本番用へ移せず、作り直しになるため　**大きさ**: 中(半日)
- **止めているもの**: 複数の職員で使い始めた瞬間に、他の職員が登録した利用者の実名が AI へ出る穴が開いたまま。③と④は同じ日に続けて行う（間が空くと職員が下書きを作れなくなる）
- **次の一手**: ①Clerk ダッシュボード → Organizations で事業所の組織を作り職員を全員入れ、org_ で始まる ID を控える ②同じ日に Supabase の SQL 画面で supabase/client_org_scope.sql【手順2】を組織 ID に置き換えて Run（0件を確認）→【手順3】→【手順4】で (a)0件・(b)3つとも0 ③各職員が画面上の帯の右側で事業所を選び「名簿を事業所で共有中」を確認 ④職員 B のメモに職員 A の利用者名を書いて下書きを作り「送る前に見る画面」で記号になっているか見る → Claude が #13 を閉じ、ADMIN-SETUP と ROADMAP の進捗欄を更新。Claude が横で手順を読み上げる。
- <small>根拠（開発向け）: docs/ADMIN-SETUP.md:5「残りは③④です」・:32-37（同日実施の注意）・:150-179（③④・確かめ方）／docs/ROADMAP.md:39,42,66-73,80-92（本番 clients 2件・org_id 全件 null・記号重複なし＝移行は安全に通る見込み 2026-09-13 実測）／`gh issue view 13` コメント 2026-09-14「1 SQL 実行 ✅／2 Clerk で組織 ⬜／3 既存データ移行 ⬜／4 各職員が事業所を選ぶ ⬜」／docs/CONTEXT-MAP.md:207,223／実装は PR #14（MERGED 2026-09-14）で main 済／今日の lead 報告に③④の記述なし＝未着手として扱う（済んでいれば「確認待ち」に格下げ）</small>

## 2) 画面の作り直しの残り

> 作り直し計画47段のうち main に入ったのは F0〜F7・U0〜U4・S1・U5 の API 部分・C3 のタブ・R1 まで。残りは吉本さんの順番決定（決めること1）と未回答の質問待ちが多い。

### T-NOW-05　【決定】本番のログイン（Clerk）が「開発用の環境」のまま動いている ── 本番用へ切り替えるか（T-NOW-04 の前に）
- **優先**: P0 いま最優先　**担当**: 吉本さん（決定）＋Claude　**状態**: 未着手（決定待ち）　**大きさ**: 中(半日)
- **止めているもの**: T-NOW-04（開発用の環境で作った事業所・職員のデータは本番用へ移せない＝作り直しになる）。Clerk 公式は開発用の環境を「100人まで・本番の仕事には向かない・セッションの守りが本番の水準に無い」と書いている
- **次の一手**: 決めること24。案A＝自分のドメインを取り、Clerk の本番用の環境を作って切り替える（認証の慎重領域＝着手前に考えの筋道を示して承認→PR→独立審査）。案B＝当面は開発用のまま続け、上の3点を承知したことを decisions-log に記帳する
- <small>根拠（開発向け）: docs/reviews/2026-09-25-redesign-m1-doubt.md の確定1（本番の応答の X-Clerk-Auth-Reason: dev-browser-missing・公開鍵が pk_test・公式 docs の引用）</small>

### T-NOW-06　【決定】Clerk の事業所の設定（1事業所5人まで・個人のアカウント不可）が、画面の作りと T-NOW-04 の手順の前提と食い違う
- **優先**: P0 いま最優先　**担当**: 吉本さん（決定）＋Claude　**状態**: 未着手（決定待ち）　**大きさ**: 小(〜1時間)
- **止めているもの**: T-NOW-04。6人目からの職員は、画面に緑の「事業所で共有中」が出ているのに名簿が共有されていない状態になりうる（2026-09-13 の重大な指摘と同じ種類）
- **次の一手**: 決めること25（人数の上限・個人のアカウントを許すか）→ 決まった内容に合わせて Claude が SharingStatus と ADMIN-SETUP の手順を直す（緑は決めた事業所の ID と一致したときだけにする案も）
- <small>根拠（開発向け）: docs/reviews/2026-09-25-redesign-m1-doubt.md の確定2（公開設定の max_allowed_memberships:5・force_organization_selection:true と components/SharingStatus.tsx:39,63,71,73）</small>

### T-NOW-07　本番への公開が自動チェック（CI）の結果を待たない ── 見張りが落ちても main に入れば本番に出る
- **優先**: P0 いま最優先　**担当**: 吉本さん（承認）＋Claude　**状態**: 未着手（決定待ち）　**大きさ**: 中(半日)
- **止めているもの**: 安全テストの見張り（tools/run-tests.mjs）が本番の手前で止める力を持たない。第1段の公開は3回とも CI の完了より先に本番へ出ていた（実害は無し）
- **次の一手**: 決めること26 → インフラの変更なので着手前に考えの筋道を示して承認→PR→独立審査
- <small>根拠（開発向け）: docs/reviews/2026-09-25-redesign-m1-doubt.md の確定3（main の保護なし・公開と CI 完了の時刻の比較）</small>

### T-NOW-08　「一式まとめて」が、どの利用者から来たか（?client=）を受け取らず、保存先の既定が「新しい利用者」── 同じ方を二重に登録する道
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: app/(dashboard)/rescue/page.tsx で ?client= を読み、一覧にあればその方を保存先の既定にし「B様に保存します」と文字で出す。一覧に無ければその旨を出し、新しい利用者を既定にしない。受け取る側の画面のテストを足し、安全テストの一覧にも載せる
- <small>根拠（開発向け）: docs/reviews/2026-09-25-redesign-m1-doubt.md の確定4（components/clients/ClientPane.tsx:241・rescue/page.tsx:277,796,852）</small>

### T-NOW-09　名簿の共有状態の表示を「スマホで隠す」「スクロールで流す」ようにしても、テストが気づかない（2026-09-13 の重大な指摘の再発を止める見張りが無い）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: SharingStatus・TopBar のテストに「画面幅つきの隠す印が付いていない」と「globals.css でどの幅でも隠していない・上の帯は sticky」の検査を足す。わざと隠して赤になることを確かめる
- <small>根拠（開発向け）: docs/reviews/2026-09-25-redesign-m1-doubt.md の確定5（変異 U01〜U05 を全部入れても 1189 件が緑）</small>

### T-NOW-10　書類の持ち主の絞り込み（created_by）3か所を消しても、テストが気づかない（サーバーは行の保護 RLS を通らないので、この3行が唯一の守り）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: lib/db/documents.test.ts に「getDocumentsByClient・approveDocument・unapproveDocument は必ず本人で絞る」を足し、PATCH /api/documents/[id] のテストも足す。安全テストの一覧の理由に書き足す
- <small>根拠（開発向け）: docs/reviews/2026-09-25-redesign-m1-doubt.md の確定6（lib/db/documents.ts:157,245,275）</small>

### T-UI-01　点検・履歴・救済モード・使い方の新しい見た目（枝 redesign/a-restyle の3コミット）を main に取り込む（衝突6ファイル）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 途中　**大きさ**: 中(半日)
- **止めているもの**: 作り直し第2段の本番反映。終わるまで点検・救済モードは旧い見た目のまま
- **次の一手**: 作業用コピー wt-cn-restyle で main を取り込み、衝突する6ファイル（dashboard・evaluate・guide・rescue の page.tsx、CONTEXT-MAP、SIGNOFF）を手で解く。main 側は 997f7e2 で「履歴への入口」と「使い方の知らせ」を別の形で足しているので二重にしない。ゲート5本を通して PR → 独立審査 → 吉本さんが SIGNOFF 行12（R2）を本番で確かめる。 あわせて docs/REDESIGN-A-SIGNOFF.md の冒頭3行「全部に済が付くまで main へ出さない」を「2026-09-24 に途中段階を本番へ出したため、未確認の行は本番の画面で確かめる」に書き換える（今の main と決定が食い違っている）。
- <small>根拠（開発向け）: `git log --oneline main..redesign/a-restyle` → 6b2a40e / 3c5b2eb / b2cc56c（本セッションでも再確認）／`git merge-tree --write-tree main redesign/a-restyle` → CONFLICT: app/(dashboard)/dashboard/page.tsx・evaluate/page.tsx・guide/page.tsx・rescue/page.tsx・docs/CONTEXT-MAP.md・docs/REDESIGN-A-SIGNOFF.md（lead が挙げた rescue 521行・dashboard 164行の他に点検・使い方もぶつかる）／`git diff --stat main...redesign/a-restyle` → 18 files +1578/-914（2026-09-25 再計測）／枝側 SIGNOFF 行12「R2 … 状態=未」</small>

### T-UI-02　利用者一覧の「書類の種類ごとの最新日付」の列（A7＝計画 U5）を stash から取り出して仕上げる（API は本番済・画面だけ途中）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 途中　**大きさ**: 中(半日)
- **次の一手**: main から新しい枝を切り stash@{0} を apply（main に直接 pop しない。未追跡の lib/clients/latestDocs.ts と .test.ts も一緒に入っている）。ゲート5本を通し、1440px と 375px で「—」「読めませんでした」「自分が保存した書類だけです」の3つの出方をテストで固定してから PR と独立審査へ。
- <small>根拠（開発向け）: `git stash list` → stash@{0}: On redesign/a: A7 date columns partial (stopped 2026-09-24 16:00 for tonight's release)（本セッション再確認）／`git stash show --stat stash@{0}` → 15 files +651/-60（ClientTable.tsx +115・ClientTable.test.tsx +289・globals.css +61・lib/documents/latest.ts・lib/db/documents.ts・tools/safety-tests.json）／`git ls-tree stash@{0}^3` → lib/clients/latestDocs.ts・latestDocs.test.ts／main の components/clients/ClientTable.tsx:12「書類の種類ごとの日付の列は後の段（計画 U5）で足す」／docs/CONTEXT-MAP.md:142／API 側 d97f365 は main 済（`git log main..redesign/a-backend` 空）／~/.claude 枝 decisions-log 2026-09-23 決定1「書類の日付は自分が保存した書類だけ」</small>

### T-UI-03　作り直し計画の未回答の質問を吉本さんに1問ずつ聞いて decisions-log に記帳する（点検画面の3点・基本情報の自動入力・xlsx・AI の送り先の表示・ホームで実名を隠す一手間・Clerk ロゴ・約束の1行・名簿の説明文）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **止めているもの**: 点検 K2・K3、つくる C2・C4・C6、マニュアル D1c の着手に必要
- **次の一手**: 末尾の「吉本さんが決めること」を AskUserQuestion で1問ずつ聞き、答えを ~/.claude/decisions-log.md に記帳。SIGNOFF 行4・10・13 の状態欄も更新する。
- <small>根拠（開発向け）: scratchpad/redesign-plan.md「# OPEN」【点検の画面】(:537)【基本情報の自動入力】(:540)【xlsx】(:542)【AI会社の表示】(:530)【ホームで実名が見える】(:535)【実名の説明文】(:534)／docs/REDESIGN-A-SIGNOFF.md 行4・行10・行13「状態=未決定（吉本さんの選択待ち）」／~/.claude/decisions-log.md に 2026-09-23/24 の見出しは無い（本セッション grep 0件。同意文・一時停止・色・Powered by の決定は wt-harness 枝側の decisions-log にのみ記載）</small>

### T-UI-04　C0: 「AI に送る文章」の組み立てを純粋な関数に切り出す（payload と payloadKey。動きは変えない）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **止めているもの**: C4（左右分割）の前提
- **先に要るもの**: T-DIR-01
- **次の一手**: app/(dashboard)/create/page.tsx:222 の buildPayload を lib/create/payload.ts へ移し、payloadKey（見た文章と送る文章が同じかを見分ける鍵）とテストを足す。
- <small>根拠（開発向け）: app/(dashboard)/create/page.tsx:222 `const buildPayload = ()…`・:245・:303 で /api/preview と /api/generate の両方に使用／`ls lib/create/payload.ts` → No such file／計画 C0（redesign-plan.md:218-225）</small>

### T-UI-05　C1: 592行の「つくる」ページを部品に分け、500行台にする（動きは変えない。安全網の検査つき）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-04
- **次の一手**: CreateWorkbench / InputPane / ResultView に分け、ResultView の「実名で表示中でもカイポケの欄に合わせるは記号版を送る」を動かす検査で固定して tools/safety-tests.json に足す。行数をテストで見張る。独立審査つき。
- <small>根拠（開発向け）: `wc -l app/(dashboard)/create/page.tsx` → 592（docs/specs/recording-pipeline.md:74-76 は「未達 623→606行」と古い）／components/create/ には DocTypeTabs.tsx・NotesField.tsx・SaveTranscriptBar.tsx のみ／計画 C1（redesign-plan.md:227-235）</small>

### T-UI-06　C2: 利用者と書類の種類を URL（?client=&type=）で「つくる」へ引き継ぎ、上の帯にパンくずを出す
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-03
- **次の一手**: lib/create/params.ts とパンくず（利用者 / B様 / 担当者会議）を作る。先に「基本情報の自動入力」（決めること8）を吉本さんに決めてもらう。
- <small>根拠（開発向け）: `ls lib/create/params.ts` → No such file／docs/REDESIGN-A-SIGNOFF.md 行11「利用者や書類の種類はまだ引き継がれない ── 後の段 C2・C9 で入れる」／計画 C2（redesign-plan.md:237-245）</small>

### T-UI-07　C3: 録音中・文字起こし中は書類の種類を変えられないようにし、画面を離れる前に止める（録音の消失防止）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 途中　**大きさ**: 中(半日)
- **次の一手**: 文字のタブ（DocTypeTabs）は済。RecordingPanel に onActiveChange を足し、録音中はタブ・一式まとめて・使い方リンクを止め、左の帯の移動と閉じる操作に確認（「録音中です。移動すると…消えます」）を出す。動かす検査つき・独立審査。
- <small>根拠（開発向け）: components/create/DocTypeTabs.tsx（main に存在・role=tablist）／`grep onActiveChange components/recording/RecordingPanel.tsx` → 0件／`grep 録音中・文字起こし中 app/(dashboard)/create/page.tsx` → 0件／計画 C3（redesign-plan.md:247-256）＋CRITIQUE [important]「Leaving the page while recording discards audio」(:555-556)</small>

### T-UI-08　C4: 左にメモ・右に「AI に送る文章」の分割画面にし、右に出ている文章だけを送れるようにする（安全網の作り直し）
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-UI-04・T-UI-07・T-UI-03
- **次の一手**: CRITIQUE の critical 3件（①狭い幅ではプレビューを見てからでないと送れない ②「まだ全文を開いていない欄」の一回きりの警告を外のボタンでも通す ③名簿が変わったら 409 で止める digest）を受け入れ条件に入れる。文言「右側に出た文章だけが AI に送られます…」は吉本さんの承認。独立審査必須。
- <small>根拠（開発向け）: app/(dashboard)/create/page.tsx:458「押しても、すぐには送られません。送る前に確認画面が出ます。」（2段階の旧い流れ）／components/create/NotesField.tsx:140／wt-harness/decisions-log.md 2026-09-24「「つくる」の左右分割などは後日」／計画 C4（redesign-plan.md:258-268）＋CRITIQUE critical (:549-552)・important (:553-554)</small>

### T-UI-09　C5: 入力が止まると右側が自動で新しくなる（AI は呼ばない）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-08
- **次の一手**: 1.2秒の待ちと取り消し、/api/preview の 413、速さ（p50/p95）の計測を同じ PR で。プレビュー環境でログインできるかを先に確かめる（Preview 環境に鍵が無い ── T-OPS-16）。
- <small>根拠（開発向け）: `grep usePreviewSync lib/` → なし（lib/create/ は docTypes.ts のみ）／計画 C5（redesign-plan.md:270-280）＋CRITIQUE important「Vercel preview deployment」(:575-576)</small>

### T-UI-10　C6: 録音の帯を A案の形にし、一度止めたあとも「続けて録る」で録れるようにする（不具合の根治）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-03
- **次の一手**: lib/recording/segments.ts に「止めた」を戻す reset を足し、続けて録るの動かす検査を追加。同意の文・一時停止・「音声は保存しません」は1文字も変えない。対応していないブラウザの判定は描画後に行う。独立審査。
- <small>根拠（開発向け）: lib/recording/segments.ts:37-115 に stopped の reset なし（`grep reset` 0件）／`grep 続けて録る components/recording/RecordingPanel.tsx` → 0件／計画 C6（redesign-plan.md:282-291）＋CRITIQUE important (:561-562)</small>

### T-UI-11　C7: メモ欄の細部（字数・基本情報の欄・「この欄を記録として残す」を欄の下の文字ボタンから）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-08
- **次の一手**: SaveTranscriptBar を欄の下の文字ボタンから開く形にし、説明（実名のまま暗号化・5年の正直な文）が出ることをテストで固定。独立審査。
- <small>根拠（開発向け）: components/create/SaveTranscriptBar.tsx は既存（redesign-maps.json: 131行・マウント時に GET /api/clients）／計画 C7（redesign-plan.md:293-302）</small>

### T-UI-12　C9a: 救済モード（912行）を部品に分け、既知の不具合を直す（「資料を消せなかった」の知らせが画面に出ない＝説明書の記述が今は嘘）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 大(数日)
- **次の一手**: BundleForm / BundleResult / IntakeReport / BundleSavePanel / useBundleGenerate に分け、warnings[]（資料の削除失敗）を画面に出す・JSON でない応答に人向けの文を出す・DropZone の useSemanticElements を直す。warnings の表示だけは先に小さな PR で出してよい（説明書との食い違いを早く消す）。保存の押し直しは 11426ed で対応済みなので除く。独立審査。
- <small>根拠（開発向け）: `wc -l app/(dashboard)/rescue/page.tsx` → 912／`grep warnings app/(dashboard)/rescue/page.tsx` → 0件／lib/manual/content.ts:1143「…知らせ…は画面に出ません」・docs/DATA-HANDLING-EXPLANATION.md:107「削除に失敗した時は画面に警告」（今は出ない）／11426ed fix(rescue): 一式の保存を押し直しても…（済）／計画 C9a（redesign-plan.md:314-322）</small>

### T-UI-13　C9b: 「一式まとめて」を「つくる」の中（/create?mode=bundle）に入れ、/rescue はそこへ転送する
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-UI-12・T-UI-08
- **次の一手**: 右側に「一式まとめてには送る前に確かめる画面がありません。添付した資料は原本のまま AI に渡ります」を出す。/rescue は client を引き継いで転送（404 にしない）。
- <small>根拠（開発向け）: app/(dashboard)/create/page.tsx:345 `<TextAction href="/rescue">一式まとめて（救済モード）`／lib/nav.ts:42-45／計画 C9b（redesign-plan.md:324-334）</small>

### T-UI-14　K1: 点検の判定（22点／16点）を1か所にまとめ、結果の読み取りと Excel を丈夫にする（Excel のファイル名から利用者名を外す）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-NOW-03
- **次の一手**: lib/evaluation/judgement.ts を作り、EvaluationResults・exportExcel・履歴（dashboard）の同じ数字をそこへ寄せる。境目（15/16/21/22）のテストと、Excel のファイル名から利用者名を外すテスト。
- <small>根拠（開発向け）: components/EvaluationResults.tsx:18-35 に `>= 22 … >= 16` が4回、lib/exportExcel.ts:15、app/(dashboard)/dashboard/page.tsx:31-40 にも同じ数字／`ls lib/evaluation/` → No such file／計画 K1（redesign-plan.md:346-353）</small>

### T-UI-15　K2: 点検の画面に「これまでの点検」タブを作り、履歴から利用者名・ファイル名の列を外す（今は本番の履歴に実名が出ている）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-03・T-UI-01
- **次の一手**: 吉本さんの「点検の画面」3点の決定（決めること6）を待って着手。推移グラフは外す決定済みなので recharts も使わなくなる。/dashboard は転送。独立審査（実名の除去）。
- <small>根拠（開発向け）: app/(dashboard)/dashboard/page.tsx:233 `{rec.client_name || "—"}`・:236 `{rec.file_name}`・:8-14 recharts import（restyle 枝でも 220/223 行に同じ）／997f7e2 は履歴への入口リンクを足しただけ／計画 K2（redesign-plan.md:355-363）・:492「点検の推移グラフ: いったん外す」</small>

### T-UI-16　K3: 新しい点検の流れ（「PDF は原本のまま AI に送られます」の表示・履歴保存の完了を待ってから結果を返す）
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-UI-15
- **次の一手**: 吉本さんの文言承認（決めること6）後に着手。evaluate/route.ts の saveEvaluation を await して id を返す。独立審査。
- <small>根拠（開発向け）: components/FileUploader.tsx:103「AI評価を開始する」（旧ラベル）／`grep 原本のまま|最終判断 app/(dashboard)/evaluate/page.tsx components/FileUploader.tsx` → 0件／app/api/evaluate/route.ts:132 `saveEvaluation({` に await なし／計画 K3（redesign-plan.md:365-374）</small>

### T-UI-17　G1: 使い方の画面を区画の形にする（目次を左に固定・PDF を主ボタン）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-01
- **次の一手**: R2 取り込み後に着手し、/guide#ch1〜ch7 が上の帯の下に止まるかを 1440/375 で確かめる。
- <small>根拠（開発向け）: app/(dashboard)/guide/page.tsx:63 `className="legacy-page app-page"`／`git show redesign/a-restyle:app/(dashboard)/guide/page.tsx`:37「読み物なので…（.legacy-page）のまま」／計画 G1（redesign-plan.md:385-392）</small>

### T-UI-18　M1: スマホの形（利用者の一覧を縦積み・選んだ方は全画面・点検の履歴を縦積み。PR #16 で直したのは上の帯だけ）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **次の一手**: 375×812 で全4項目に行ける・共有状態が3状態とも見える・横に動かない・押す物は 44px を確かめ、写真つきでサインオフ。独立審査（共有状態の見え方は 2026-09-13 の critical と同系統）。
- <small>根拠（開発向け）: docs/CONTEXT-MAP.md:343「スマホ用の形はまだ（…計画 M1）」／stash@{0} globals.css 追加分「スマホ用の形…は計画 M1 で決める」／997f7e2 fix(ui): スマホの利用者の上の帯が潰れていたのを直し…（帯のみ）／計画 M1（redesign-plan.md:394-402）</small>

### T-UI-19　M2: スマホの「つくる」を「メモ｜AI に送る文章」の2タブにする
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-DIR-02・T-UI-18
- **次の一手**: CRITIQUE の critical（メモのタブでは送れない・プレビューを見てからでないと送れない）を受け入れ条件に入れる。
- <small>根拠（開発向け）: 計画 M2（redesign-plan.md:404-412）＋CRITIQUE critical「send can be pressed without the preview being on screen」(:549-550)／components/create/MobileTabs* なし</small>

### T-UI-20　作り直しの案に描いた新機能（Ctrl K・分割の常時プレビュー・手順レール）を作るかどうかを決める
- **優先**: P3 いつか　**担当**: Claude＋吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **次の一手**: 決めること23 の答えを受けて、作らないものは計画から外す（書類日付の一覧 A7 は T-UI-02 で進行中）。
- <small>根拠（開発向け）: memory project_carenote_redesign.md:17「案に描いた新機能…は『今は無い』ことを明示して別途相談」</small>

## 3) 安全・個人情報

> 黒塗りの取りこぼしと、実名が入りうる値の経路の穴。どれも小さいが放置すると AI や保存先に実名が出る。

### T-SEC-01　Issue #10: 点検（/api/evaluate）に元のファイル名（実名が入りうる）を送っている ── ログ・AI・保存先へ出ていないか追って直す
- **優先**: P1 次にやる　**担当**: Claude　**状態**: ✅済（2026-09-25・PR #19）　**大きさ**: 小(〜1時間)
- **やったこと（2026-09-25）**: サーバーは本文の fileName を読まず、履歴には固定の「資料」だけを保存する（lib/evaluate/storedFileName.ts）。画面も送らない。AI への文・ログ・応答に出ないことをテストで固定（独立審査の指摘でログの見張りを実際に働く形に直した）。Issue #10 の件名の経路の混入も直した。**残り**: 修正前の行には元の名前が残り、履歴の画面にも出る（列を外すか・消すかは「決めること」6 の②）。同じ種類の件が救済モードにもある → Issue #18（別に対応）。
- **本番の確認（2026-09-25）**: PR #19 を取り込み・公開後、Claude が架空の名前「テスト太郎_ケアプラン.pdf」で本番の点検を実行。履歴の新しい行のファイル名は「資料」、修正前の行は元の名前のまま（説明どおり）。Issue #10 は自動で閉じた。
- **次の一手**: fileName を固定名（例「資料1」）にするか黒塗り（maskPii）を通す→ログ・AI への文・保存先に転記されていないことをテストで固定→Issue を閉じる。あわせて Issue のタイトルに混入した「C:/Program Files/Git/api/evaluate」（Git Bash の経路変換の事故）を「/api/evaluate」に直す。
- <small>根拠（開発向け）: app/(dashboard)/evaluate/page.tsx:106 `body: JSON.stringify({ ...payload, fileName: file.name })`／app/api/evaluate/route.ts:36 で受け取り :135 で使用／app/(dashboard)/dashboard/page.tsx:236 で file_name を表示／`gh issue list` → #10 OPEN（本セッション再確認・タイトルに経路混入あり）</small>

### T-SEC-02　Issue #8: 都道府県名の無い住所（大阪市北区梅田1-2-3）が黒塗りされない
- **優先**: P1 次にやる　**担当**: Claude　**状態**: ✅済（2026-09-25・PR #21・Issue #8 閉）　**大きさ**: 小(〜1時間)
- **やったこと（2026-09-25）**: 失敗するテストを先に書き、lib/privacy/patterns.ts に「市区町村郡＋漢字・カタカナの町名＋番地の形」の規則を追加。独立審査（code-reviewer）が「予定の文（中村ケアマネ9-10時来所）を住所として消し、予定の欄とカレンダーでは元へ戻らない」ほかを指摘 → 単位が続く範囲・測った値・第〜回・区分・0始まり（電話番号）・西暦の日付を除き、漢数字の丁目・「2番3号」・「1丁目2-3」の取りこぼしと、長い漢字の文で遅くなる点も直した。わざと壊す検査5種（ひらがな・後ろの単位・頭の除外・前の言葉・速さの近道）で、どれもテストが赤くなることを確認。再審査（2回目）の指摘で、単位の見張りを2つ区切りの範囲にだけかける形にした（「北区梅田1-2-3日本生命ビル」のように建物名が続く住所が残っていた）。西暦の除外は年-月-日の形だけに（4桁の番地「桜井2001-3」を消す）、前の言葉の除外から1字の「月・年・週」を外し（「望月263-1」）、単位の字に「錠・割・英字」などを足した。3回目の審査で、1字の「か」が「3-1から転居」の住所を残していたのを「か所・か月」の組に直した。わざと壊す検査を追加で5種し、どれも赤になることを確認。仕様書 §2.2 の表と「正直な限界」を事実に合わせた（単位の付かない範囲「9-12訪問」は消えうる、など）。
- **次の一手**: なし（済）。自動レビューの指摘「田中村上3-1」の消しすぎも仕様書の「正直な限界」に追記済み。空白入りの住所などの残りの限界は仕様書 §2.2 のとおり。
- <small>根拠（開発向け）: lib/privacy/patterns.ts:100 コメント（修正前は :73）「都道府県から番地（数字を含む）まで」／テスト（maskBody.test.ts:36・maskPii.test.ts:12・patterns.test.ts:32・vault.test.ts:10）はすべて「大阪府」付きのみ／`gh issue list` → #8 OPEN</small>

### T-SEC-03　Issue #5: 利用者の本文に「〔電話番号2〕」と書かれると復元で別の値に化ける（札の予約語衝突）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 本文中の「〔…〕」を送る前に無害化するか、札を本文と衝突しない形にする→衝突ケースのテストを追加。
- <small>根拠（開発向け）: `gh issue list` → #5 OPEN／札の形は lib/privacy/maskPii.test.ts:36-37 `vault.restore("〔電話番号1〕／〔電話番号2〕")` のとおり本文と同じ文字列</small>

### T-SEC-04　Issue #6: 資料アップロード完了の呼び返し（onUploadCompleted）が Clerk に弾かれる（今は何もしないので実害なし）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 小(〜1時間)
- **次の一手**: この呼び返しに処理を足すときに、先に middleware の除外を入れる。それまでは Issue に「保留」ラベルを付けて閉じない。
- <small>根拠（開発向け）: app/api/blob-upload/route.ts:38 `onUploadCompleted: async () => {` が空／`gh issue list` → #6 OPEN</small>

### T-SEC-05　Clerk と Supabase の RLS 連携（JWT）が未配線 ── 多層防御の1層が効いていない
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 大(数日)
- **先に要るもの**: T-OPS-13
- **次の一手**: 1社実証の後に、Clerk の JWT テンプレートを Supabase に渡す設計を CoT で提示（慎重領域・二段ゲート）。
- <small>根拠（開発向け）: docs/specs/ui-redesign-and-client-storage.md:47「Clerk-Supabase の JWT/RLS 連携は現状未配線」</small>

## 4) 録音・電話・カイポケ連携

> 録音は本番で有効だが通しの実機確認が一度も無く、保存の表も未作成。カイポケ側は規約照会と実機8項目が関門 G2。

### T-REC-01　文字起こしを保存する表（client_transcripts）を Supabase に作る（管理者手順②-2。今は「記録として残す」が管理者向けの案内で止まる）
- **優先**: P0 いま最優先　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **止めているもの**: 本番のボタンが1つ動かない状態。60分の通し録音（T-REC-02）の前提
- **次の一手**: ADMIN-SETUP.md ②-2 のリンクから Supabase の SQL 画面を開き、書いてある SQL をまるごと貼って Run →「Success. No rows returned」→ 手順4で件数 0 を確認 → アプリの「つくる」で「記録として残す」を押して緑の「保存しました」が出るか見る（所要3分）。実際に作ったかは吉本さんに要確認（作成の記録がどこにも無い）。
- <small>根拠（開発向け）: docs/ADMIN-SETUP.md:39-46（②-2 に「済」の印なし・表が未作成のときの案内文）／~/.claude/decisions-log.md:233（2026-09-18）「client_transcripts の表が未作成のため『記録として残す』は管理者向けの案内で止まる」（以後の実行記録なし）／docs/specs/recording-pipeline.md:51-52,57,266</small>

### T-REC-02　60分の会議を吉本さんの PC（Windows・Chrome）で通しで1回録音する（5分区切り・継ぎ目・容量の実測）
- **優先**: P1 次にやる　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-REC-01
- **次の一手**: 実在の利用者を出さない模擬の会議で60分録り、5分ごとの区切りが文字になるか・継ぎ目で言葉が欠けないか・「音が入っていません」が誤って出ないか・最後の区切りまで文字になるか・「記録として残す」が通るかをメモして Claude に伝える。
- <small>根拠（開発向け）: docs/specs/recording-pipeline.md:182「[ ] 吉本さんの端末（Windows・Chrome）で、60分の会議を通して1回」・:186-187／docs/DATA-HANDLING-EXPLANATION.md:216「録音の実機での通し確認: 未実施」／~/.claude/decisions-log.md:232（2026-09-18）「マイクを使った通しの録音は一度も実施していない」／`npx vercel env ls` → NEXT_PUBLIC_CARENOTE_RECORDING が Production に設定済／memory MEMORY.md「first real 60-min recording test」</small>

### T-REC-03　カイポケ（エス・エム・エス社）へ規約照会を送る（送る前に「公式の取り込み窓口（API・提携枠）の有無」の一問を足す）── 関門 G2
- **優先**: P1 次にやる　**担当**: 吉本さん＋Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **止めているもの**: 本番ローンチの関門 G2／方向性「ハンズフリー」の可否。規約 NG なら「コピペ運用へ縮退」は決定済み
- **次の一手**: Claude が docs/KAIPOKE-SMS-INQUIRY.md の【確認したい点】に「外部の記録作成ツールから支援経過等を取り込む公式の窓口（API・データ連携の提携枠）の有無」を1項目追記→吉本さんが文面を確認し［事業所名／会員ID・連絡先］を埋めてカイポケの会員向け問い合わせから送付→送付日を同ファイルに記録。
- <small>根拠（開発向け）: docs/KAIPOKE-SMS-INQUIRY.md:53-55「送付の決定 2026-09-10・送付日［送ったら記入］」（空欄）・同ファイルに API・提携・取り込み の語なし（grep → 送り先の「窓口」2行のみ）／docs/DIRECTION-2026-09-24.md:36,55「公式の窓口（API）の有無は未確認（G2）」／docs/CALL-PIPELINE-FEASIBILITY.md:172 U1／docs/ROADMAP.md:27,112</small>

### T-REC-04　カイポケ実機確認8＋2項目（黒塗り→生成の送信本文・録音ファイル→文字・カレンダー・アセスメント追記・関係者名簿・OCR 統合・転記シート・第2表6手順）を通す。第2表では click() が勝手に送信しないかも見る（Issue #7）
- **優先**: P1 次にやる　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **止めているもの**: 本番ローンチの関門 G2／最重要リスク R-FIELD（第1・2・4・5・6段が実機未確認）
- **次の一手**: テスト利用者でカイポケにログインし、docs/specs/call-pipeline.md の「実機」つき8項目を上から順に通す。登録ボタンは押さない。第2表でラジオ・チェックを押した瞬間に画面が勝手に進まないかを見て結果を Issue #7 に書く。画面が A案に変わっているので手順の文言は読み替える（読み替えられない所は Claude に聞く）。出た不具合を Claude に渡す。 さらに ROADMAP の実機リストにある2項目「拡張の再ログイン検知（第2表を含む）」「一式まとめて／点検のあとに一時保管の資料が消えていること」も同じ日に見る。
- <small>根拠（開発向け）: docs/specs/call-pipeline.md:61,126,149,167,181,199,214,230（「- [ ] 実機」8件すべて未チェック。grep -c → 8）／docs/ROADMAP.md:20-24,113-119,202／`gh issue list` → #7 OPEN「第2表 setRadio/checkbox の click() がカイポケ（JSF）の onclick 部分送信を誘発しないか実機確認」／docs/ROADMAP.md:113-119 の実機リストは8件＋「再ログイン検知」「一時保管が処理後に消えていること」の2件</small>

### T-REC-05　取引先プルダウンの部分一致が実データの表記（【訪問看護】（番号）　名称）に合うかを確かめて直す
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-REC-04
- **次の一手**: 吉本さんが実画面の取引先の表記を1つ写して渡す → Claude が classifyServiceType／取引先検索を合わせてテストを足す。
- <small>根拠（開発向け）: docs/specs/call-pipeline.md:231／docs/ROADMAP.md:119</small>

### T-REC-06　手書き資料（主治医意見書など）の読み取り精度を実測し、悪ければ「撮り方の案内」を画面に足す
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-REC-04
- **次の一手**: テスト用の手書き書類を3枚ほど撮って OCR 統合に通し、読み取り報告の良否を記録する。
- <small>根拠（開発向け）: docs/specs/call-pipeline.md:200／docs/ROADMAP.md:16,189（手書きの読み取り精度は未実測）</small>

### T-REC-07　転記シートの欄への振り分けが現場感覚と合うかを吉本さんの目で較正し、ヒント文を直す
- **優先**: P2 そのあと　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-REC-04
- **次の一手**: アセスメント下書き→「カイポケの欄に合わせる」を1件通し、違和感のある欄をメモして Claude に渡す。
- <small>根拠（開発向け）: docs/specs/call-pipeline.md:215</small>

### T-REC-08　第3表・第4表・モニタリングのカイポケ流し込み（V2 の残り。第3表はポップアップで手入力のまま）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 大(数日)
- **先に要るもの**: T-REC-03・T-REC-04
- **次の一手**: G2 の回答が来てから、第3表のポップアップ構造を KAIPOKE-DOM.md に追記して着手。
- <small>根拠（開発向け）: docs/ROADMAP.md:190（V2 🔜 第3表・第4表・モニタリングは未）／docs/CONTEXT-MAP.md:194／docs/specs/call-pipeline.md:226</small>

## 5) 新しい方向性（右腕）の第1段階の準備

> 2026-09-24 に「ケアマネの右腕」（確認と判断に集中・記録は自動・専門書ナレッジを根拠・自動タスク）が決まったが、段階の順番は未決定。第1段階は既にある「下書き→承認」の仕組みの上に足す形が §2.5-F に沿う。

### T-DIR-01　【決定】段階の順番と、最初に取りかかる範囲を決める（作り直しの残りと新方針のどちらを先にするかを含む）
- **優先**: P1 次にやる　**担当**: 吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **止めているもの**: 段階1〜4のすべての着手・ROADMAP 第5版・作り直し C0 以降／K1 以降／M1 以降の着手順
- **次の一手**: 決めること1 の Claude の提案（1→2→4 を本線、3 は許諾待ちで並行）を読み、①最初に自動で回す会話の種類（電話の支援経過だけか、会議・モニタリングも含めるか）②「確認待ちの箱」を今の「下書き→承認」の仕組みの上に足す形でよいか、の2点を1行で返す。
- <small>根拠（開発向け）: docs/DIRECTION-2026-09-24.md:5「順番・範囲は吉本さんが決める（⏳）」・:41「## 4. 進め方（段階）⏳ 提案」・:56「👤 段階の順番と、最初に取りかかる範囲の決定」／memory project_carenote_direction.md:18「段階の順番は未決定」／wt-harness/decisions-log.md 2026-09-24「「つくる」の左右分割などは後日」</small>

### T-DIR-02　「つくる」の結果を利用者に保存できるようにする（作り直し計画 C8。記号に置き換えた版・常に下書き。段階1の第一歩＝保存できないと箱に並ばない）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **止めているもの**: 段階1（確認の箱・自動タスク）の入口
- **先に要るもの**: T-DIR-01
- **次の一手**: データの扱いが変わるので、着手前に CoT（事実・解釈・選択肢・判断）を吉本さんへ出して承認を decisions-log に記帳（§2.7-F 入口）。左右分割（C4）を待たず今の画面に「この利用者に保存（下書き）」を先に出すか、C4 の後にするかを決めて着手。同じ PR で DATA-HANDLING-EXPLANATION.md を直し、再配布前に吉本さんが確認。出口は独立審査。
- <small>根拠（開発向け）: docs/CONTEXT-MAP.md:159「未対応: /create からの「利用者に保存」導線」／app/(dashboard)/create/page.tsx に /api/documents の呼び出しなし（grep 0件）／wt-harness/decisions-log.md 2026-09-23 決定2「保存するのは名前を記号にした版…常に下書き」／redesign-plan.md:304 C8（deps=C4,S1。S1 は main 済 CONTEXT-MAP.md:135）＋CRITIQUE important (:563-566: C8 は §2.7-F の二段ゲート対象)</small>

### T-DIR-03　「確認待ちの箱」と「自動タスク」の仕様を1枚に書く（docs/specs/inbox-and-tasks.md 仮）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 案を作成（2026-09-25・`docs/specs/inbox-and-tasks.md`。§6 の6問が吉本さんの決定待ち）　**大きさ**: 中(半日)
- **止めているもの**: 段階1の実装すべて
- **先に要るもの**: T-DIR-01
- **次の一手**: §2.8-A ①定義で書く。器は既存の「下書き→承認」（PATCH /api/documents/[id]・DocumentPanel.tsx）を流用し、新しい表は「タスク」1つに留める案。吉本さんに決めてもらう点＝タスクの定義（誰が閉じる・期限・事業所で共有するか（決めること10）・いつ消すか）。
- <small>根拠（開発向け）: supabase/*.sql に task・inbox・confirm を含む表なし（grep -il → 0件）／app・lib・types・components に task/chat の実装なし／タスクの種は types/supportLog.ts:58-70（itemsToConfirm・appointments・assessmentUpdates）／書類の状態は types/document.ts:13 `"draft" | "approved"` の2つだけ／DIRECTION-2026-09-24.md:21-29,45-46,50</small>

### T-DIR-04　自動タスク（要確認事項・予定・アセス追記案）を書類と一緒に保存し、利用者の区画に「確認すること」として並べる（最小版）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-DIR-02・T-DIR-03
- **次の一手**: 保存した書類の content に入る itemsToConfirm 等を components/clients/ClientPane.tsx に行として出す最小版から。承認した行だけ「済み」にできる形。
- <small>根拠（開発向け）: app/(dashboard)/create/page.tsx:544-557（AppointmentsPanel・AssessmentUpdatesPanel・ItemsToConfirm は結果画面に出すだけで保存されない）／components/drafts/AppointmentsPanel.tsx:4-6「保存は職員が押す」／components/drafts/ItemsToConfirm.tsx:8</small>

### T-DIR-05　モニタリングは録音だけでは完結しない（前回プランの要約が必須）── 保存済みの承認済みケアプランから自動で埋めるかを段階1の仕様に入れる
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-DIR-03
- **次の一手**: 「前回のプラン要約を、利用者に保存済みの承認済みケアプランから自動で埋める」を仕様に入れるか決める（保存済み書類が無い利用者は今までどおり手入力）。
- <small>根拠（開発向け）: docs/specs/recording-pipeline.md §3「previousPlanSummary が必須（lib/generation/dispatch.ts:76）。録音では埋まらない」／lib/generation/dispatch.ts:74-85</small>

### T-DIR-06　ROADMAP を第5版に作り直す（DIRECTION を土台に。「動画は未収録」「録音は Genspark 経由」など古い記述を訂正し、現在地を PR #15/#16・G3b 未有効化・録音本番有効に合わせる）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-DIR-01
- **次の一手**: 段階の順番が決まったら、G1〜G6 の関門と段階1〜4を1枚に組み直す（DIRECTION と同じコミットで・Doc-as-Code）。
- <small>根拠（開発向け）: docs/ROADMAP.md:1「第4版 / 2026-09-12」・:3-4「次の版は DIRECTION を土台に」・:29「動画は未収録」（CONTEXT-MAP.md:199 と lib/manual/content.ts:90,239,402,553,911,1080 では6章が ready）・:200（R-LEGAL は Genspark 前提だが v0.6 で OpenAI 直接へ変更済）／DIRECTION-2026-09-24.md:59</small>

## 6) ナレッジ（第2〜4段階）

> 公式資料（法令・告示・通知）は許諾不要で先に進められる。出版社の本は許諾と弁護士確認が要るので問い合わせだけ先に出す。

### T-KN-01　ナレッジの置き場と形を決める（Obsidian 互換の Markdown・出典の書き方・誰が直すか）
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **止めているもの**: 段階2〜4のナレッジ関連すべて
- **先に要るもの**: T-DIR-01
- **次の一手**: Claude が「knowledge/ フォルダに Markdown・ファイル先頭に出典（法令名・通知名・版・URL）・段落ごとに根拠 ID」の型を1枚で提案 → 吉本さんが決める点＝repo の中に置くか別の Vault か／吉本さんが Obsidian で直す運用にするか。
- <small>根拠（開発向け）: DIRECTION-2026-09-24.md:46,50「人が直せる Markdown＋単純な検索から始め」／SPEC.md:82／いまの知見置き場は lib/rules/*.ts 6ファイル・計385行（wc -l）のみ</small>

### T-KN-02　公式資料（法律・省令・告示・通知・厚労省の手引き）の取得リスト第1版を作り、吉本さんが「最初の5本」を選ぶ
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-KN-01
- **次の一手**: 候補（居宅介護支援の運営基準と解釈通知・課題分析標準項目・標準様式の通知・ケアプラン点検支援マニュアル など。正式名称と最新版は取得時に一次ソースで確認）を一覧にし、吉本さんが最初の5本を選ぶ。
- <small>根拠（開発向け）: docs/ROADMAP.md:155「法令・告示・通達は取込可（著作権法13条）。白書・手引きは要旨をルール化＋出典明示」／scratchpad にあるのは個人情報保護法ガイドライン・医療情報安全管理 GL 等で、ケアマネ実務の官公資料は未取得</small>

### T-KN-03　lib/rules の知見を Markdown ナレッジへ移し、生成が「根拠: 〇〇通知」付きで書く（第5表1帳票だけで試し、評価エンジンで回帰採点 ── P-GEN）
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-KN-02
- **次の一手**: 吉本さんが実証帳票（決めること18）と作成ポイントを箇条書きで渡す → ナレッジの該当段落を system に入れ、出力に根拠1行を足す最小版 → 吉本さんの目視＋評価エンジンで回帰。品質が落ちたら戻す。
- <small>根拠（開発向け）: lib/rules/supportLog.ts:1-7（v1・吉本監修）／docs/CONTEXT-MAP.md:58,76（structured.ts が rules を system に注入）／types/supportLog.ts:58-70 に根拠の欄なし／docs/ROADMAP.md:16,150-155（P-GEN）</small>

### T-KN-04　同じナレッジで答えるチャット第1版（全文検索＋Claude・ベクトル検索は作らない）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-KN-03
- **次の一手**: 吉本さんに決めてもらう点＝①アプリ内に置くか ②利用者の情報を入れられない画面にするか（入れる場合は黒塗り「送る前に見る」の経路を必ず通す）。決まったら「Markdown を検索→該当段落を渡す→出典付きで答える」だけの最小版。
- <small>根拠（開発向け）: app・lib・components に chat の実装なし（grep）／DIRECTION-2026-09-24.md:16,50「作り過ぎない（§2.5-F）」</small>

### T-KN-05　出版社（第一法規ほか）への利用許諾・法人向けデータ提供の問い合わせ文を起草する（docs/PUBLISHER-LICENSE-INQUIRY.md）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: KAIPOKE-SMS-INQUIRY.md と同じ型（送信文面＋送付記録＋回答記録）で起草。書くこと＝対象書名・用途（有料サービス内で AI の根拠にする）・出力への引用の有無・法人向けデータ提供や API の有無 → 吉本さんが書名（3冊ほど）を確定。
- <small>根拠（開発向け）: docs/ に「出版社」「第一法規」の記述は DIRECTION-2026-09-24.md:33,47,54 のみ（grep）＝下書きが存在しない</small>

### T-KN-06　出版社へ送付し、弁護士に「市販書を AI の根拠に使うこと」の可否を確認する（説明書の専門家レビューと同じ相談にまとめる）
- **優先**: P2 そのあと　**担当**: 吉本さん＋外部　**状態**: 未着手　**大きさ**: 不明
- **止めているもの**: 段階3（出版社の本の追加）の着手
- **先に要るもの**: T-KN-05・T-OPS-01
- **次の一手**: 問い合わせ文が固まり次第送付し、送付日を記録。弁護士への質問は T-OPS-01 の争点3つに4つ目として添える。
- <small>根拠（開発向け）: DIRECTION-2026-09-24.md:33-34「出版社の許諾が要る可能性が高い…専門家の確認が必要」・:54／docs/ROADMAP.md:95-104 P-LEGAL-C</small>

### T-KN-07　出版社の本の取り込み実装（許諾が取れたものから）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 不明
- **先に要るもの**: T-KN-06
- **次の一手**: 回答が来るまで着手しない。段階2の Markdown ナレッジの仕組みをそのまま使う想定（許諾後の追加作業は「PDF→Markdown 化＋出典」だけの見込み・未検証）。
- <small>根拠（開発向け）: DIRECTION-2026-09-24.md:47「許諾・契約が取れたものから追加」</small>

### T-KN-08　承認済み事例を匿名化してナレッジへ足す手順（人の承認つき）を設計する（段階4）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-KN-01
- **次の一手**: 「承認済み書類 → maskPii → 人が読んで直す（実名・固有の事情を落とす）→ 事業所のナレッジ Markdown に追記」の手順を仕様1枚に。文字起こし全文は対象外。追加学習（モデルの作り替え）は採らない。
- <small>根拠（開発向け）: docs/CONTEXT-MAP.md:123「帳票の content は暗号化しない JSONB で…名簿に無い名前はそのまま入り得る」／lib/privacy/maskPii.ts:46／lib/db/transcripts.ts:18「復号した本文を AI へ渡してはいけない」／DIRECTION-2026-09-24.md:38-39</small>

### T-KN-09　説明書に「承認事例の匿名化ナレッジ化（AI の学習ではない）」を書き足し、法人の了解を取る（段階4）
- **優先**: P3 いつか　**担当**: 吉本さん＋外部　**状態**: 未着手　**大きさ**: 不明
- **先に要るもの**: T-KN-08・T-OPS-01
- **次の一手**: 手順が固まったら §3 に追記 → 専門家レビュー（同じ相談で）→ 法人へ説明して了解を記録。
- <small>根拠（開発向け）: docs/DATA-HANDLING-EXPLANATION.md:18「AIの学習には使われない（契約で禁止）」＝いまの法人への約束／DIRECTION-2026-09-24.md:39</small>

## 7) 運用・法務・外部への確認

> 本番ローンチの関門 G1（法務）・G4（合否基準）・G5（運用の耐久）・G6（総合判定）。外部の待ち時間が最長のものから出す。

### T-OPS-01　データ取扱説明書（v0.6）を弁護士・行政書士に見てもらう（争点: 文字起こし事業者の位置づけ・海外事業者への同意方式・保存期間の起算 ＋ 市販書を AI の根拠に使う可否）── 関門 G1・外部の待ち時間が最長なので第一手
- **優先**: P1 次にやる　**担当**: 吉本さん＋外部　**状態**: 未着手　**大きさ**: 不明
- **止めているもの**: 本番ローンチの関門 G1。合意書・同意書の確定、v1.0 の発行
- **次の一手**: docs/DATA-HANDLING-EXPLANATION.md（v0.6）を専門家へ送り、争点3つ＋出版社の本の件を質問として添える。依頼日を ROADMAP に記録。送る前に T-DOC-02 の古い記述（画面内録音「使えない状態」等）を直しておくと手戻りが減る。
- <small>根拠（開発向け）: docs/ROADMAP.md:26,34,39,101-104,203（G1 ★未着手・専門家レビューが未）／docs/DATA-HANDLING-EXPLANATION.md:5-7（法解釈は専門家レビュー前提）・:212,215・:227（v0.6 2026-09-17）</small>

### T-OPS-02　合意書・利用者への説明文・同意書のひな型を Claude が書き、吉本さんが事業所の実情に合わせて直してから専門家へ渡す（本番の実データを入れる前提条件）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **止めているもの**: 関門 G1／実データ投入の前提
- **次の一手**: Claude がたたき台3種を書く → 吉本さんが直す → T-OPS-01 と同じ相談に添える。
- <small>根拠（開発向け）: docs/ROADMAP.md:105／docs/specs/ui-redesign-and-client-storage.md:84「データ処理委託契約／同意の文面・締結＝本番実データ投入の前提」</small>

### T-OPS-03　職員の誓約書と、退職時にアカウント・拡張トークンを止める手順を決める
- **優先**: P2 そのあと　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: docs/EXTENSION-TOKENS.md の失効手順を読み、誓約書の項目（実名を書かない・共有中を確認する等）を箇条書きで出す。
- <small>根拠（開発向け）: docs/ROADMAP.md:106／docs/EXTENSION-TOKENS.md「トークンは env のため追加・失効に再デプロイが要る」</small>

### T-OPS-04　プライバシーポリシーに「米国で処理する・国外へ渡す」ことを書き足す
- **優先**: P2 そのあと　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 再委託先一覧（Anthropic・OpenAI・Vercel・Supabase）を DATA-HANDLING §5 から写して、越境移転の1段落を足す。
- <small>根拠（開発向け）: docs/ROADMAP.md:107</small>

### T-OPS-05　専門家レビューの結果を説明書へ反映して v1.0（記名押印欄つき）にする
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 保留　**大きさ**: 中(半日)
- **先に要るもの**: T-OPS-01
- **次の一手**: レビューが戻ったら §2・§6・§7 を直し、日付と記名押印欄を付けて v1.0 にする。
- <small>根拠（開発向け）: docs/ROADMAP.md:108／docs/DATA-HANDLING-EXPLANATION.md:5</small>

### T-OPS-06　保存期限（5年）を過ぎた書類・文字起こしを自動で消す仕組みを作る（それまでは月1回の SQL を吉本さんが実行）── 関門 G5・説明書で「開発中」と約束済み
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-OPS-01
- **次の一手**: 起算点（作成日か完結の日か。決めること19）を専門家の回答で確定→Claude が Vercel Cron で retention_until 超えを消すジョブを CoT で提示（慎重領域）→承認後に PR＋独立審査。それまで吉本さんは ADMIN-SETUP「月1回やること」の delete を実行。
- <small>根拠（開発向け）: docs/ROADMAP.md:18,136,203／docs/DATA-HANDLING-EXPLANATION.md:109,211,219／docs/specs/recording-pipeline.md:235,261／supabase/client_transcripts.sql:14「期限切れの自動削除はフェーズ2」／docs/ADMIN-SETUP.md:139「月1回やること（期限切れの掃除）」</small>

### T-OPS-07　エラー監視の連携（Vercel のエラーを通知で受ける）と事故時の一次対応手順 docs/INCIDENT-RESPONSE.md を作る ── 説明書 §8「検知時24時間以内に第一報」の裏づけ
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **次の一手**: Vercel の通知先（メール／LINE。決めること20）を吉本さんが決める→Claude が通知の設定と、当番・第一報の型を1ページに書く。
- <small>根拠（開発向け）: docs/ROADMAP.md:28「監視（エラー通知）❌ 未連携」・:137／`ls docs` に INCIDENT-RESPONSE.md が無い</small>

### T-OPS-08　利用者・書類の削除と書き出しの手段を作る（開示・削除の請求、契約終了時の引き渡し。今は登録した利用者を画面から消せない）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 大(数日)
- **次の一手**: 削除の単位（利用者ごと・書類ごと）と書き出しの形式（PDF か表か）を /spec で1枚にし、慎重領域として吉本さんに CoT を提示→承認→実装（PR＋独立審査）。
- <small>根拠（開発向け）: docs/ROADMAP.md:138「現在 DELETE は関係者名簿の1本だけ」／docs/REDESIGN-A-SIGNOFF.md:24「登録した利用者は画面から消せない」／docs/DATA-HANDLING-EXPLANATION.md:210</small>

### T-OPS-09　暗号鍵 CARENOTE_PII_KEY の保管場所と復旧手順を決めて文書化する（失うと保存済みの実名が二度と戻らない）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 誰が・どこに控えるか（決めること21）を吉本さんが決め、Claude が手順を docs に書く。鍵の値そのものは Claude が扱わない。
- <small>根拠（開発向け）: docs/ROADMAP.md:139</small>

### T-OPS-10　Anthropic の利用上限（スペンドキャップ）を設定し、残高切れ時の運用手順を決める（残高切れは 2026-07 と 2026-09-13 の2回発生）
- **優先**: P2 そのあと　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: console.anthropic.com → Plans & Billing で月の上限と残高の通知を設定し、402 が出たときの連絡先と手順を1行で決める。
- <small>根拠（開発向け）: docs/ROADMAP.md:140／memory project_ci_review_unfunded.md／review-pr が起動し PR #16 は完了まで走った＝残高あり（PR #15 は別の理由〔Issue #37〕で判定なし）</small>

### T-OPS-11　復旧手順（Supabase のバックアップ・Vercel の前の版へ戻す）を文書にする
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: Supabase のバックアップ設定と Vercel のロールバック手順を確認して docs に1ページ書く。
- <small>根拠（開発向け）: docs/ROADMAP.md:141</small>

### T-OPS-12　作成時間・品質のばらつきのベースラインを2条件（コピペ運用／拡張流し込み）で計り、先方と合否の数値を決める ── 関門 G4
- **優先**: P2 そのあと　**担当**: 吉本さん＋外部　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-REC-04
- **次の一手**: 実証帳票を1〜2種に絞り（決めること18）、現行の1件あたりの作成時間を3件ぶん計る。目標値（例: 30分→15分）を先方と合意。
- <small>根拠（開発向け）: docs/ROADMAP.md:40,43,144-149,152,215</small>

### T-OPS-13　出口の総合判定（graph-ship＋graph-doubt を再実行）→ 1社実証ローンチ（G3b がどこで閉じたかを記録してから）── 関門 G6
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 保留　**大きさ**: 中(半日)
- **先に要るもの**: T-OPS-01・T-REC-03・T-REC-04・T-NOW-04・T-OPS-12・T-OPS-07
- **次の一手**: G1〜G5 の状態表を更新し、全部緑になった時点で graph-ship と graph-doubt を回す。
- <small>根拠（開発向け）: docs/ROADMAP.md:45,157-163,217</small>

### T-OPS-14　アセスメント追記の運用ルール（誰が承認するか・追記の書式・元に戻す期限）を事業所規程に置く
- **優先**: P3 いつか　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 上級編の教材と兼ねて、追記の3項目を規程の1ページにまとめる。
- <small>根拠（開発向け）: docs/specs/call-pipeline.md:168</small>

### T-OPS-15　GitHub の Dependabot アラート（脆弱なパッケージの通知）を ON にする（1クリック）
- **優先**: P1 次にやる　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: GitHub の carenote-ai → Settings → Code security → Dependabot alerts を ON。
- <small>根拠（開発向け）: `gh api repos/satoshiyoshimoto0426/carenote-ai/dependabot/alerts` → HTTP 403 "Dependabot alerts are disabled for this repository."</small>

### T-OPS-16　Vercel の Preview/Development 環境に Clerk・Supabase・鍵類が無い（PR の Preview URL でログイン確認ができない）
- **優先**: P3 いつか　**担当**: 吉本さん　**状態**: 保留　**大きさ**: 小(〜1時間)
- **次の一手**: PR ごとの確認に Preview を使いたいなら、Vercel の画面で Preview 用に Clerk の開発キー等を吉本さんが追加する（鍵の入力は Claude が行わない）。使わないなら現状維持。
- <small>根拠（開発向け）: `npx vercel env ls`（名前と環境のみ）→ 15 変数中 13 が Production のみ。3環境にあるのは BLOB_READ_WRITE_TOKEN と ANTHROPIC_API_KEY だけ。コードが参照する変数は .env.local.example の14個と一致＝本番に不足なし</small>

### T-OPS-17　MiniMax の鍵を回す（再発行する）必要があるかを確認する ── 根拠となる記録がどこにも見つからない
- **優先**: P3 いつか　**担当**: 吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **次の一手**: 回す必要がある根拠（漏えいの疑い・共有した事実など）があれば教えてほしい。無ければこの項目は閉じる。あるなら MiniMax の管理画面で新しい鍵を作り ~/.minimax.env を吉本さんが書き換える（Claude は鍵を扱わない）。
- <small>根拠（開発向け）: memory 全27ファイル・~/.claude/*.md・両 steering-log・git log を「ローテ|再発行|失効|rotat|漏えい」で grep → MiniMax 該当 0件（3人の読み手が独立に確認）／見つかったのは project_mv_pipeline.md:27「鍵は ~/.minimax.env（リポジトリ外）」のみ／`ls ~/.minimax.env` → 存在（2026-08-03, 142 bytes）／`git log --all --diff-filter=A -- '.env*'` 0件・.gitignore:34 `.env*`</small>

## 8) マニュアル・動画

> 本番の「使い方」は旧画面の動画6本が ready のまま出ている。事業所向け説明書にも今と違う記述がある（再配布・専門家レビューの前に直す）。

### T-DOC-01　使い方の動画6本（旧画面・6項目の左メニューを映す）を「準備中」に切り替える（計画 F5 の約束・小さな PR）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 決めること22 で「準備中」に決まったら、ch1・2・3・4・6・7 の status を 'planned' にして npm run manual で index.html を作り直す。撮り直しの日程は新しい画面が本番にそろってから（T-DOC-05）。
- <small>根拠（開発向け）: lib/manual/content.ts:90,239,402,553,911,1080 `status: "ready"`（ch5 のみ planned:699）／components/Sidebar.tsx は削除済み（Rail.tsx に置換）／計画 F5 DOCS（redesign-plan.md:106）／STALE（:510-511: ch4 に「25MBまで」が焼き込み、ch6 の人物像の欄が空）／git show 997f7e2（PR #16 は「作り直し途中」の知らせを足しただけ）</small>

### T-DOC-02　事業所向け説明書・管理者手順・仕様書・拡張機能の文言を今の状態に合わせる（D3。画面内録音「使えない状態」・共有状態の場所「左下」・削除失敗の警告・評価する→点検・録音チェック R5/env・版表記 v0.5→v0.6）
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 途中（2026-09-25・PR 中・枝 docs/sync-with-current-screens）　**大きさ**: 中(半日)
- **止めているもの**: 説明書を専門家へ送る前・事業所へ再配布する前に必須
- **やったこと（2026-09-25）**: 実物と突き合わせて直した ── 説明書を v0.7 に（画面内録音は 2026-09-18 から使える状態・共有状態の表示は「画面いちばん上の帯の右側」で言葉は「事業所で共有中」「自分の登録分のみ」・冒頭の版表記 v0.5 の食い違い）、ADMIN-SETUP の切り替えの場所と言葉、録音の仕様書の R3・R5・環境変数の状態、拡張の「作成」→「つくる」。**残り**: 説明書の「削除に失敗した時は画面に警告」は、実は画面に出していなかった（救済モードはサーバーが警告を返すが画面が表示していない・点検はサーバーの記録だけ）→ 約束どおり画面に出す修正を別に行う。「評価する→点検」の言い換えと、再配布前の吉本さんの差分確認。
- **次の一手**: redesign-plan の STALE 一覧を上から潰す。DATA-HANDLING-EXPLANATION.md（:92 左下・:107 削除警告・:136/213-214 録音・:5 版表記）、ADMIN-SETUP.md:162「左下」→「上の帯の右側」、recording-pipeline.md:180-181 の R5 と env を「済（2026-09-18・法人了解のうえ有効化）」に、extension/src/panel.html:37・extension/README.md:41「Web版「作成」ページ」。事業所向けの文書は再配布前に吉本さんが差分を確認。
- <small>根拠（開発向け）: docs/DATA-HANDLING-EXPLANATION.md:92「画面の左下」・:107「削除に失敗した時は画面に警告」（今は出ない）・:136,213-214「画面内録音は使えない状態／設定で止めてあり」（2026-09-18 から on）・:5「v0.5」vs :227「v0.6」／docs/ADMIN-SETUP.md:162 と docs/CONTEXT-MAP.md:223「上の帯の右側」の食い違い／docs/specs/recording-pipeline.md:180-181（[ ] R5・[ ] env）と ~/.claude/decisions-log.md 2026-09-18（法人了解済）／extension/src/panel.html:37・extension/README.md:41／scratchpad/redesign-plan.md「# STALE」・D3（:452-460）</small>

### T-DOC-03　マニュアル本文（lib/manual/content.ts）の旧い名前（作成する・救済モード・評価する・ダッシュボード・左下 など36か所）を新画面に合わせて書き直し、HTML/PDF を作り直す（D1a〜D1c）
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-UI-01・T-UI-03
- **次の一手**: つくるの左右分割（C4〜C8）が出るまでは第①②章と共通部分だけ先に直し、npm run manual → Chrome ヘッドレスで PDF を刷り直す（Edge 不可）。約束の文（MANUAL_PROMISES）は吉本さんが実物と照らして読む。点検の章を⑧章にするか①章に入れるかは決めること6。終わったら PR #16 の「作り直し途中」の知らせを外せる。
- <small>根拠（開発向け）: `grep -c '救済モード|ダッシュボード|作成する|評価する|左下|左のメニュー' lib/manual/content.ts` → 36（例 :98,:199,:298,:310,:1036）／app/(dashboard)/guide/page.tsx:88,100「画面を新しくしている途中です」／public/manual/index.html 2026-09-17 23:08・PDF 2026-09-17 10:49（その後の画面変更を反映していない）／計画 D1a〜D1c</small>

### T-DOC-04　第⑤章（カイポケ転記）の動画は未収録 ── カイポケの収録用テナントとテスト利用者を用意して吉本さんが撮る
- **優先**: P2 そのあと　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-REC-04
- **次の一手**: カイポケで収録用のテスト利用者を作り（本番の利用者では撮らない）、docs/MANUAL-VIDEO-SPEC.md §3.5 の手順で録画→Claude が字幕・ナレーションを合成し content.ts の status を ready にする（AI は他社画面を録画できない）。
- <small>根拠（開発向け）: lib/manual/content.ts:699（ch5 status: planned）／`ls public/manual/videos` に ch5.mp4 が無い／docs/CONTEXT-MAP.md:198-199／docs/MANUAL-VIDEO-SPEC.md:40,81,100</small>

### T-DOC-05　D2: 動画の台本・字幕・撮影の道具（tools/shoot-*.mjs）を新しい画面に合わせ、6本を撮り直す
- **優先**: P3 いつか　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 大(数日)
- **先に要るもの**: T-DOC-03・T-UI-08
- **次の一手**: docs/MANUAL-VIDEO-SPEC.md §5 と tools/shoot-plans.mjs / shoot-run.mjs / make-card.mjs の古い経路・ボタン名を直し、プレビュー環境で dry run。撮り直し本番は吉本さんの立ち会いで。
- <small>根拠（開発向け）: tools/shoot-plans.mjs:49,98 `go: "/dashboard"`・:55,103 `click: "新規"`・:70,143,192・:225・:233／docs/MANUAL-VIDEO-SPEC.md:78,92,130,202／計画 D2（redesign-plan.md:443-450）</small>

### T-DOC-06　ブラウザ拡張の配り方を決め（zip＋手順書／ウェブストア限定公開／組織配布・更新の届け方・事業所ごとのトークン運用）、受講事業所向けのセットアップ手順書を作る
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **止めているもの**: ローンチ定義「中級編の受講事業所への配布」の手段が未計画
- **次の一手**: Claude が3つの配布形態の長所短所を1枚にまとめ、吉本さんが1つ選ぶ（決めること12）→ ADMIN-SETUP と EXTENSION-TOKENS を土台に受講者向けの1枚を書く。
- <small>根拠（開発向け）: docs/ROADMAP.md:121-124,131／docs/EXTENSION-TOKENS.md「既知の限界: トークンは env のため追加・失効に再デプロイが要る」</small>

### T-DOC-07　撮影・E2E の道具（tools/shoot.mjs）が headless Chrome を子プロセスごと止めない ── 恒久策（残った Chrome に繋がって画面が勝手に移る誤動作の再発防止）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 終了時に `taskkill /T /F /PID <pid>`（子プロセスまで）を finally で必ず呼び、起動前に carenote-shoot の Chrome が残っていたら止める（利用者の普段の Chrome は止めない）。挙動をテストで固定する。
- <small>根拠（開発向け）: memory feedback_shoot_leftover_chrome.md「恒久策は…プロセスツリーごと止める形にすること（未着手）」（2026-09-24 夕方に8個残って E2E が別ページへ飛んだ）／tools/shoot.mjs:44-45 `spawn(CHROME, args, { detached: false, stdio: "ignore" })`・`grep -n 'kill|taskkill'` → 該当なし（:92 の ws.close のみ）／現時点の残り = 0</small>

## 9) ハーネス（開発の見張りの仕組み）

> 「CI が赤いのに完了と言う」を止める見張りは枝にしか無く、本番の ~/.claude では動いていない。3つの作業ツリーの未コミット修正は自己テスト 694 件 0 FAIL まで来ているが、独立審査3巡目を途中で止めたまま。

### T-HN-01　ハーネス改修（3リポ）の独立審査3巡目をやり直す（打ち合わせ前に途中で止めたまま）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 途中　**大きさ**: 中(半日)
- **止めているもの**: ハーネス変更を本番（~/.claude と各リポの main）へ入れる関門（§2.7-F 出口ゲート）
- **次の一手**: 3つの作業ツリー（wt-harness +846行／wt-carenote +1026行／wt-maou +1164行）の差分を対象に graph-doubt を最初から回し、critical を直してから結果を吉本さんに見せる（承認前にマージしない）。
- <small>根拠（開発向け）: wt-harness/decisions-log.md 末尾「2026-09-24 …ハーネスの最終審査はいったん止め、打ち合わせ後に再開」／wt-harness/harness-steering-log.md #26 の 8「独立審査3回目の反映（2026-09-23〜24）」以後の再審査の記録なし／`git -C wt-harness status --short` = 変更14＋新規5（全部未コミット）／自己テスト（2026-09-24 夜・実走ログ scratchpad/ledger-harness-tests.log・ledger-project-tests.log）: 63/18/111/143/180/179 = 計694 assert・0 FAIL／carenote-ai/.claude/steering-log.md:375-377</small>

### T-HN-02　3つの作業ツリーの変更をコミットして PR を3本出す（.gitattributes・Issue #38 の変更・枝側 decisions-log を同梱。MaouCastle の PR は CI が走らないので審査結果を PR 本文に貼る）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **止めているもの**: 本番反映（T-HN-03）の前提
- **先に要るもの**: T-HN-01・T-HN-07
- **次の一手**: 審査の指摘を直した後、各作業ツリーで commit → push → PR（vivid-claude-harness／carenote-ai／maoucastle-game）。マージは吉本さんが審査結果を見てから。
- <small>根拠（開発向け）: `git diff --stat`: wt-harness 14 files +846/-45（新規 hooks/stop-ci-guard.py・test_stop_ci_guard.sh・templates/README.md・gitattributes.tmpl・test_stop_build_check.sh）／wt-carenote 6 files +1026/-29（.gitattributes は staged）／wt-maou 6 files +1164/-41／`git ls-remote --heads origin 'harness/*'` は3リポとも空＝未 push／MaouCastle/.github/workflows/quality-gates.yml:13-16 は `.claude/**` を paths-ignore</small>

### T-HN-03　本番の ~/.claude へ反映する（RUNBOOK §6 DEPLOY 手順1〜8）── 「CI が赤いのに完了と言う」を止める見張りを本番で動かす
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **止めているもの**: steering #26 の穴（CI の赤が Claude に届かない）が本番では開いたまま
- **先に要るもの**: T-HN-02・T-HN-05
- **次の一手**: PR マージ後に RUNBOOK §6 の手順を1手ずつ（退避 → decisions-log の接頭辞確認 → rebase（衝突2ファイルは枝側）→ ff merge → autoMode を JSON で戻す → 新セッションで「stop-ci-guard.py が見つかりません」が出ないことを確認 → テスト4本 → 記帳）。手順3・5 は作業ツリーの変更を捨てるので、その直前に吉本さんへ確認。
- <small>根拠（開発向け）: `grep '"Stop"' ~/.claude/settings.json` → 該当なし（stop-ci-guard.py 未登録）／`grep -c '## 6. DEPLOY' ~/.claude/docs/harness/HARNESS-RUNBOOK.md` = 0（手順は枝にのみ）／`git -C ~/.claude status --short` = ` M decisions-log.md`・` M settings.json`（本セッション再確認）・HEAD=2e63501／`git -C ~/.claude diff --stat 0591754 2e63501` = hooks/pre-bash-guard.py と test_pre_bash_guard.sh（rebase で衝突する2ファイル）</small>

### T-HN-04　承認台帳（decisions-log.md）の未コミット分を1か所に寄せてコミットする（本体は 09-09〜09-18 の4件、枝はさらに 09-23×2・09-24 の3件。二重記帳を防ぐ）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 途中　**大きさ**: 小(〜1時間)
- **次の一手**: 枝側（wt-harness）の decisions-log.md を正として T-HN-02 の PR に含める。本体の4件は DEPLOY 手順3で枝の内容に置き換わる（本体が枝の接頭辞であることを python で確かめてから restore）。読み手によって「本体に 09-23/24 が入っているか」の記述が食い違っていたが、本セッションの grep で本体には無いことを確認済。
- <small>根拠（開発向け）: `git -C ~/.claude diff -- decisions-log.md | grep '^+## '` → 2026-09-09／09-12／09-17／09-18 の4見出しのみ（本セッション実測）／`grep -nE '^#+ .*2026-09-2[34]' ~/.claude/decisions-log.md` → 0件／wt-harness の同ファイル diff は +108行（4件＋09-23 ハーネス・09-23 画面作り直し・09-24 途中段階の公開）／RUNBOOK §6 手順3「本番のファイルは枝のファイルの接頭辞」</small>

### T-HN-05　~/.claude/settings.json の未コミットの変更（autoMode の環境説明・soft_deny 追記・通知 ON）を git に残すか決める
- **優先**: P2 そのあと　**担当**: 吉本さん＋Claude　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **止めているもの**: ハーネス変更＝慎重領域（§2.7-F 入口の承認）。決まるまで DEPLOY では退避して同じ内容を戻すだけ
- **次の一手**: 変更の中身（信頼するリポジトリ・force push/reset --hard の soft_deny 等）を平易な日本語で吉本さんに見せ、採用ならコミット、不採用なら手元だけに残す（決めること14）。
- <small>根拠（開発向け）: `git -C ~/.claude diff -- settings.json` → +35行: "agentPushNotifEnabled": true, "autoMode": { "environment": [...23項目], "soft_deny": ["$defaults", "Bash(git push --force:*)…", "Bash(git reset --hard:*)…"] }（未コミット・枝には無い）／RUNBOOK §6 手順5「autoMode は…コミットするかは吉本さんが決める」</small>

### T-HN-06　今の main では「危険な操作の注意喚起」が本体の置き場（日本語パス）で効いておらず、cd した後はフック自体が見つからない（枝で修正済・未マージ）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 途中　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-02
- **次の一手**: T-HN-02 の PR のマージで解消。マージまでは、日本語パスでの rm -rf・force push 等を守っているのは全体層の pre-bash-guard.py だけと承知しておく。
- <small>根拠（開発向け）: MaouCastle/.claude/hooks/pre-tool-guard.sh:11-12 は `json.load(sys.stdin)` のみで PYTHONIOENCODING なし（枝 wt-maou 版は :15 に `export PYTHONIOENCODING=utf-8`）／carenote-ai main の同ファイルは :20 で修正済／両リポの .claude/settings.json:9,20,31 が `bash .claude/hooks/…`（cwd 相対。枝は `"${CLAUDE_PROJECT_DIR}/.claude/hooks/…"`）／全体層 ~/.claude/hooks/pre-bash-guard.py:69 は bytes 読みに修正済（2e63501・push 済）</small>

### T-HN-07　Issue maoucastle-game #38（安全テストの見張り4ファイルを注意喚起の対象に加える）── 実装は枝にあるが入口の承認と台帳への記帳が無い。期限「redesign/a を本番へ出す前」は既に過ぎている
- **優先**: P1 次にやる　**担当**: Claude＋吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **次の一手**: 吉本さんが #38 の変更案（tools/run-tests.mjs・safety-tests.json・testManifest.mjs・testManifest.test.ts を Edit/Write 時の注意喚起に足す）を承認（決めること15）→ decisions-log に1行 → T-HN-02 の PR で #38 を閉じる。旧枝 harness/h3-safety-advisory（ab5e3ad）は wt-maou の版に置き換わったので後片付けへ。
- <small>根拠（開発向け）: `gh issue view 38 -R satoshiyoshimoto0426/maoucastle-game` = OPEN・needs-decision・「入口: 吉本さんが承認し decisions-log に記帳」／docs/CONTEXT-MAP.md:378-379「本番へ出す前に必須」／wt-maou/.claude/steering-log.md 追記 #28「issue #38 はこの変更で解消」／wt-harness/decisions-log.md の 09-23 ハーネスの項に #38 の記載なし／別枝 harness/h3-safety-advisory（ab5e3ad・未 push）との差 +683/-61</small>
- **追記（2026-09-25 第1段の独立審査・確定8）**: CONTEXT-MAP.md の「本番へ出す前に必須」とされた注意喚起（ab5e3ad）が、本番公開の後も main に入っておらず動いていない。PR にして独立審査→main、すぐ入れないなら吉本さんの承認を記帳して CONTEXT-MAP の文を直す（docs/reviews/2026-09-25-redesign-m1-doubt.md）

### T-HN-08　Issue maoucastle-game #37 自動レビューが大きい PR で完走しない（40ターン超過・再試行なし）── 3案から選ぶ
- **優先**: P1 次にやる　**担当**: 吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **次の一手**: (a) 自動レビューの上限回数を 40→60 に増やす (b) 審査の指示文を軽くする (c) API の一時エラーで1回やり直す、から選ぶ（決めること16。まず (a) を試すのがおすすめ）。本番に出す PR で再発したので「10月の健診まで様子見」はやめ、次の PR の前に (a) を入れる。
- <small>根拠（開発向け）: `gh issue view 37 -R satoshiyoshimoto0426/maoucastle-game` = OPEN・harness-checkup・needs-decision（2026-09-06 起票）／2026-09-24 に本番へ出した PR #15（18ファイル）で再発: review-pr は 2m25s で判定なしに終了。PR #16（小さい）は完了・APPROVE</small>
- **追記（2026-09-25 第1段の独立審査・確定7）**: PR #15 の自動レビューは 40 ターンの手前（26）で「成功」のまま判定を出さずに終わっていた＝#37 とは別の原因。自動レビューの最後に「判定が投稿されたか」を確かめて、無ければ失敗にする段を足す案（ハーネスの変更）（docs/reviews/2026-09-25-redesign-m1-doubt.md）

### T-HN-09　月1ハーネス健診の3回目（10月）と「3ヶ月試行を続けるか」の判断・DB バックアップ増加の原因特定（server #29）・steering-log:123 の整合
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 中(半日)
- **次の一手**: 10月初旬に健診5項目（Flywheel 診断・steering 修復・メモリ整理・要観察棚卸し・現在地更新）を回し、#29 の復元リハで増加テーブルを特定。MaouCastle/.claude/steering-log.md:123（SplitUserLines テスト化）が ROADMAP v1.9 では完了扱いなので「済」を書く整合も同時に。試行を続けるかを decisions-log に記帳。
- <small>根拠（開発向け）: ~/.claude/HARNESS-ROADMAP.md:111-113（B-⑧ 8〜10月試行）・:154（2回目=2026-09-01）／`gh issue list -R satoshiyoshimoto0426/maoucastle-server` #29「db-backup Artifact が毎日+約159KB」／MaouCastle/.claude/steering-log.md:123 vs HARNESS-ROADMAP v1.9（2026-09-06）「LINE 改行テスト（server PR#30）」完了</small>

### T-HN-10　~/.claude 自身に改行の約束（.gitattributes）が無く、作業ツリーの 37/83 ファイルが CRLF になっている
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-02
- **次の一手**: gitattributes.tmpl と同じ `* text=auto eol=lf` を ~/.claude の根に置き、`git add --renormalize .` で変わるファイルが0件なのを確かめて T-HN-02 の PR に含める。
- <small>根拠（開発向け）: `git -C ~/.claude ls-files .gitattributes` = 空／`git -C ~/.claude ls-files --eol | grep -c w/crlf` = 37（i/lf は 83）／`git config --system core.autocrlf` = true／枝の雛形 templates/common/gitattributes.tmpl は ~/.claude の根には未配置</small>

### T-HN-11　carenote-ai の改行 LF 固定（.gitattributes）を main に入れ、作り直しの枝へ取り込み、CLAUDE.md の「既知の落とし穴」の項目を消す（CRLF の見かけ上の変更は 2026-09-23 で3回目）
- **優先**: P1 次にやる　**担当**: Claude　**状態**: 途中　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-02
- **次の一手**: T-HN-02 の PR で main へ → redesign/a・redesign/a-restyle に main を取り込む（`git add --renormalize .` で0件を確認）→ carenote-ai/CLAUDE.md:76-85 の項目を消して steering-log に「済」。
- <small>根拠（開発向け）: carenote-ai main に .gitattributes 無し（`git ls-files .gitattributes` 空・`git show main:.gitattributes` → fatal）／wt-carenote で `A .gitattributes`（staged・`* text=auto eol=lf`＋ico/mp4/pdf binary）／carenote-ai/.claude/steering-log.md:431-436／carenote-ai/CLAUDE.md:84-85「main に入り…この項目は消す」</small>

### T-HN-12　作業エージェントの一時ページで .next/dev の古い型が残り終了時の tsc が落ちる（2回）── 見張りは枝に実装済、CLAUDE.md への追記が未了
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 途中　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-03
- **次の一手**: PR マージ後、carenote-ai/CLAUDE.md「既知の落とし穴」に「一時ページは app/ に作らない。作ったら消したあと .next/dev も消す」を追記し、作業エージェントへの指示文にも入れる。
- <small>根拠（開発向け）: memory feedback_agent_temp_pages.md（09-23 app/sign-in-shellcheck と 09-24 app/(verify-a6) の2回）／wt-carenote/.claude/hooks/stop-build-check.sh:43-48（.next/ だけの不合格は止めず systemMessage）／`grep -n '.next/dev|一時ページ' carenote-ai/CLAUDE.md` = 該当なし</small>

### T-HN-13　OneDrive の中の .next でビルドが EPERM になる件（3回）の根本対策を4案から選んで実施する
- **優先**: P2 そのあと　**担当**: 吉本さん＋Claude　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **次の一手**: （あ）repo を OneDrive の外へ（い）.next だけ同期から外す（う）next.config の cleanDistDir:false（え）今のガイドで回す、から選ぶ（決めること17）。決まったら Claude が decisions-log に記帳して実施し、直ったら CLAUDE.md の項目を消す。
- <small>根拠（開発向け）: carenote-ai/.claude/steering-log.md:489-497「未了（決めるのは吉本さん・動くのは lead）」／carenote-ai/CLAUDE.md:90-110（見分け方・OneDrive の外の写しでビルドする手順。2026-09-23〜24 に3回）</small>

### T-HN-14　HARNESS-ROADMAP の「現在地」を更新する（2026-09-01 のまま。Stop の見張り新設と自己テスト 163→335 件を未反映）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-03
- **次の一手**: DEPLOY 後に §現在地の Quality Gates 行（stop-ci-guard 新設・自己テスト335件）と Auto Review 行（#37）を書き換え、v2.0 を更新履歴に1行。
- <small>根拠（開発向け）: ~/.claude/HARNESS-ROADMAP.md:29「現在地（2026-09-01…）」・:37「46＋14＋32＋71＝163 assert」（今夜の実走は 63＋18＋111＋143＝335）・更新履歴の最新 v1.9=2026-09-06／steering #26 は枝の harness-steering-log.md にしか無い（本番は #25 まで）</small>

### T-HN-15　ロードマップの積み残し（カバレッジの分母を Core に絞る／Alert-Fix の修復ループが一度も実発火していない）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 中(半日)
- **先に要るもの**: T-HN-09
- **次の一手**: 10月健診で着手順を決める。着手時は閾値ゲートが §2.7-C の承認制であることを先に吉本さんへ。
- <small>根拠（開発向け）: ~/.claude/HARNESS-ROADMAP.md:37「①カバレッジ分母の適正化が未着手」・:39「①修復ループが一度も実発火していない」・:60</small>

### T-HN-16　Biome の規則（noExplicitAny・noArrayIndexKey・useSemanticElements）を warn から error へ戻す（K4）
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-UI-16・T-UI-12
- **次の一手**: K3・C9a が main に入ったら biome.json の3規則を error にし、残る違反を同じ PR で0にする。
- <small>根拠（開発向け）: carenote-ai/CLAUDE.md「次に取り組むべき改善」2／wt-harness/decisions-log.md 2026-09-23 決定4（K4 は今回やらない）／scratchpad/redesign-plan.md K4</small>

### T-HN-17　マニュアルに書いたボタン名が、アプリに本当にあるかを機械で確かめる見張り（作り直し計画 D4）── 今回はやらないと決めた分の保留
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-DOC-03
- **次の一手**: 作り直しの文言が落ち着いたら、いまあるズレは記録しておき、新しいズレだけを止める形（baseline 方式）で入れる。着手前に吉本さんの承認（ハーネスの変更）。
- <small>根拠（開発向け）: scratchpad/redesign-plan.md:462 D4／同 CRITIQUE minor「ズレはすでにある（content.ts:132 vs create/page.tsx）」／wt-harness/decisions-log.md 2026-09-23 決定4「D4 と K4 は今回やらない」</small>

## 10) 後片付け

> 消す操作は全部、吉本さんの了解を取ってから。作業中の枝（redesign/a-restyle・harness/stop-gates）と stash@{0}（A7）は残す。

### T-CL-01　旧い「公開」の保管庫（Blob ストア carenote-pdfs）に残っている PDF 1件（11.29MB・約半年前・点検に使った書類＝実名を含む可能性が高い）を今日消し、保管庫ごと削除する
- **優先**: P0 いま最優先　**担当**: 吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **止めているもの**: 公開の保管庫は URL を知る人なら認証なしで読める。個人情報の露出が続いている可能性
- **次の一手**: 吉本さんが Vercel → Storage → carenote-pdfs を開き、残っていれば Empty Store（1クリック）→ 続けて Delete Store。中身を開いて確かめる必要はなく、消すだけでよい。まだ残っているかは同じ画面で吉本さんが見る（Claude 側からは確認できない）。消したら Claude に一言。
- <small>根拠（開発向け）: docs/specs/call-pipeline.md:194／~/.claude/decisions-log.md 未コミット追記 2026-09-12 D6「旧ストアの残ファイル1件（11.29MB・197日前）の削除は吉本さん確認待ち」／memory project_carenote_call_pipeline.md:21「Vercel は空でないと Delete Store が押せない」</small>

### T-CL-02　carenote-ai 本体の checkout に「中身の差が無い M」が13ファイル残っている（改行だけ CRLF）── .gitattributes が入るまで git add しない
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-11
- **次の一手**: CLAUDE.md:81-83 の手順（行末の CR を消す → `git diff` が空を確認 → `git add`）で消す。中身は変えない。
- <small>根拠（開発向け）: `git -C carenote-ai status --short`（2026-09-25 実測）→ M が 13件: app/(dashboard)/create/page.tsx・guide/page.tsx・components/SharingStatus.tsx・components/drafts/ の AppointmentsPanel・AssessmentDraftView・AssessmentUpdatesPanel・CarePlanDraftView ほか／`git diff --numstat` = 空（中身の差なし）／`git config core.autocrlf` → true</small>

### T-CL-03　古い途中作業（stash）4本（A1／A4／B4 の途中分）を1本ずつ見て、取り込み済みなら捨てる
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: 4本とも main に取り込み済みの見込み。stash@{1}〜{4} の一覧（名前と日付）を吉本さんに見せ、了解をもらってから捨てる（消す操作なので確認必須）。stash@{0}（A7 の日付列）は残す。
- <small>根拠（開発向け）: `git stash list` → stash@{1} A4 fix1 partial・{2} B4 fix0 partial・{3} A4 fix0 partial・{4} A1 fix1 partial（本セッション再確認）／照合: {3}{4} の「.legacy-page > * { flex-shrink: 0 }」「TOUCH_ELEMENTS」は main に存在、{2} の getClientById の DB 失敗は main の lib/db/clients.ts:268-294 で対応済、{1} の primitives.test.tsx の検査も main の components/ui/primitives.test.tsx:197 に形を変えて入っている（4本とも取り込み済みの見込み）、{4} のテスト「Clerk の押す・入力する部品は…44px」は lib/clerkAppearance.test.ts に同名の describe あり</small>

### T-CL-04　マージ済みの枝を消す（ローカル7本: feat/manual・feat/org-scope・harness/guard-ownership-split・redesign/a・redesign/a-backend・tonight/polish・wip/rescue-clients-2026-07／GitHub 7本: feat/blob-private・feat/call-pipeline-phase1・feat/manual・feat/org-scope・redesign/a・tonight/polish・wip/rescue-clients-2026-07）
- **優先**: P3 いつか　**担当**: Claude＋吉本さん　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-CL-05
- **次の一手**: 吉本さんに「消してよいか」を一言確認→ `git branch -d`（redesign/a-backend は先に wt-cn-backend を外す）と `git push origin --delete`。redesign/a-restyle（未マージ3件）と harness/stop-gates（未保存の作業）は残す。
- <small>根拠（開発向け）: `git branch --merged main` → 上記7本＋main（`git rev-list --count main..<枝>` は7本とも 0）／harness/guard-ownership-split は `git branch -vv` で [origin/...: gone]／`git branch -r --merged main` → 上記7本／`gh pr list --state all` → #1/#9/#11/#12/#14/#15/#16 すべて MERGED・開いている PR 0件</small>

### T-CL-05　使い終わった作業用コピー（worktree）を撤去する: wt-cn-backend（マージ済・未保存なし）・.claude/worktrees/practical-boyd-78d29d（main と差なし）・wt-maou-h3（harness/h3-safety-advisory ab5e3ad。wt-maou の版に置き換わった）
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-HN-07
- **次の一手**: 吉本さんの了解後に `git worktree remove` で3つを外し、枝も削除。wt-cn-restyle（未公開3コミット）・wt-harness・wt-carenote・wt-maou は作業中なので残す。
- <small>根拠（開発向け）: `git worktree list`: carenote-ai = wt-cn-backend d97f365 [redesign/a-backend]（`git status --short` 0件・`git rev-list --count main..redesign/a-backend` → 0）／MaouCastle = wt-maou-h3（ab5e3ad・未 push）と .claude/worktrees/practical-boyd-78d29d（claude/sad-shaw-bd2224・main と差なし）</small>

### T-CL-06　MaouCastle 直下に競艇の DB（Data/kyotei.db）と古いログ2件（m3.log・p7.log）が置かれている ── 福祉プロジェクトから分離する
- **優先**: P2 そのあと　**担当**: Claude＋吉本さん　**状態**: 確認待ち　**大きさ**: 小(〜1時間)
- **次の一手**: kyotei.db を kyotei-lab 側へ移してよいか吉本さんに確認（移動・削除は確認必須）→ m3.log / p7.log（8/21）は削除。
- <small>根拠（開発向け）: MaouCastle `git status` → `?? Data/  ?? m3.log  ?? p7.log`／`ls Data` → kyotei.db（131,072B・08-19）／memory project_kyotei_lab.md:11,90「福祉事業と意図的に分離」・正本は デスクトップ/kyotei-lab と C:/kyotei-data/kyotei.db</small>

### T-CL-07　作業用の一時置き場（scratchpad）の残骸（*.bak 8本・HEAD_clients.ts・MUT_A/B.ts・PSP.orig・*.log・a1final〜a4verify2 のフォルダ）を片付ける
- **優先**: P3 いつか　**担当**: Claude　**状態**: 保留　**大きさ**: 小(〜1時間)
- **先に要るもの**: T-UI-01・T-UI-02・T-HN-02
- **次の一手**: 「3コミットを載せる」「A7 の続き」「ハーネス3巡目」が終わってから、一覧を吉本さんへ見せて一括削除。redesign-plan.md・redesign-maps.json・ledger-*.log は残す。
- <small>根拠（開発向け）: `ls <scratchpad>` → ClientPane.bak, ClientTable.tsx.bak, ClientsContext.tsx.bak, DocumentPanel.bak, RP.bak, ST.bak, SharingStatus.tsx.bak, PSP.orig, HEAD_clients.ts, MUT_A.ts, MUT_B.ts, M3/M4/M5.log, a2-*.log, a1final/ a1fix-crlf/ a3-retry/ a4final/ a4fix2/ a4fix3/ a4gates/ a4verify/ a4verify2/</small>

### T-CL-08　X1: 使わなくなった古い UI 部品（Card・PageHeader・SectionTitle・.legacy-page・recharts 等）の片付け
- **優先**: P3 いつか　**担当**: Claude　**状態**: 未着手　**大きさ**: 中(半日)
- **先に要るもの**: T-UI-15・T-UI-17・T-DOC-02
- **次の一手**: K2（グラフ外し）・G1・D3 が終わってから。import が0になった部品と CSS を消し、recharts を npm から外す。テストは1つも消さない。
- <small>根拠（開発向け）: components/ui/primitives.tsx:224 PageHeader・:271 Card・:284 SectionTitle が 12 ファイルで使用中／app/globals.css の .legacy-page 参照 28 か所／package.json:27 recharts ^3.7.0／計画 X1（redesign-plan.md:472-479）</small>

### T-CL-09　メモリ（MEMORY.md と project_carenote_* の3ファイル）を今夜の状態に更新する（次のセッションが古い「次の一手」を読まないように）
- **優先**: P2 そのあと　**担当**: Claude　**状態**: 未着手　**大きさ**: 小(〜1時間)
- **次の一手**: このタスク管理書を正本にして、3ファイルの「次の一手」と索引の1行を書き換える（動画は ch1〜4・6・7 収録済み・A案採用済み・09-24 に第1段を本番へ）。
- <small>根拠（開発向け）: memory MEMORY.md:19「次＝…動画収録」（実際は6章を 2026-09-16 に収録済み・残りは ch5）・:20「3方向案…選択待ち」（A案は 2026-09-23 に採用済み）／project_carenote_call_pipeline.md:19「動画は未収録」（古い）</small>

## 吉本さんが決めること（27件）

> 1問ずつで大丈夫です。返事は Claude が記帳します。番号は本文の「決めること N」と対応。

| # | 質問 | 選択肢 | Claude のおすすめ | 止めているもの |
|---|---|---|---|---|
| 1 ✅済（2026-09-25: ①→②→④。③は許諾の問い合わせだけ先に出して並行） | 新しい方向性（右腕）の段階の順番と、最初に取りかかる範囲。作り直しの残り（つくるの左右分割・点検・スマホ）と新方針（確認の箱・自動タスク）のどちらを先にするか | 段階①確認の箱と自動タスク／②公式資料でナレッジ第1版＋チャット／③出版社の本（許諾後）／④承認事例を匿名化して育てる。作り直しの残り（C4・K・M）を先にする案もある | 本線は ①→②→④、③は許諾待ちなので問い合わせだけ先に出して並行。作り直しは「段階1に直結する C8（つくるの結果を保存）」と「実名が本番の履歴に出ている点検 K2」だけ先に済ませ、C4 の左右分割は段階1の後に回す。最初に自動で回す会話は「電話の支援経過」1種類に絞り、確認待ちの箱は今の「下書き→承認」の仕組みの上に足す | T-DIR-02〜06・T-KN-*・T-UI-04 以降の着手順・ROADMAP 第5版 |
| 2 ✅済（2026-09-25: （ア）そのまま残す） | ログイン画面の「Secured by Clerk」（押す場所が 48×14px と小さい）の扱い | （ア）Clerk の表示として受け入れる（作業なし）／（イ）内部の名前を狙った CSS で隠す（更新で効かなくなる恐れ・規約未確認）／（ウ）有料 Pro（月 $25）で公式に消す | （ア）。44px の例外として SIGNOFF 行4に記録するだけで済む。事業所が増えて有料に上げるときに（ウ）へ | SIGNOFF 行4 |
| 3 | 利用者一覧の表の上の約束の1行「氏名は記号で表示」を残すか消すか | （ア）残す／（イ）アートボードどおり消す | （ア）残す。安心の約束は見えるほうが職員の信頼につながる。消すなら Claude が1行と検査（ClientTable.test.tsx）を外すだけ | SIGNOFF 行10 |
| 4 | 関係者名簿の下の説明文 | （あ）今の文のまま／（い）「カイポケの拡張機能から作るときと、録音を文字にするときは置き換わりません」を書き足す／（う）別の言い方 | （い）。拡張の経路と録音の文字起こしは名簿置換の対象外という事実（CONTEXT-MAP.md:157）と画面の説明を一致させる＝正直な説明 | SIGNOFF 行13 |
| 5 | AI の送り先（Anthropic／録音は米国 OpenAI）を画面のどこに出すか | 送るボタンの横に「送信先: Anthropic（Claude）」を出す／表示をなくす／録音の帯に「文字にする処理は米国 OpenAI に音声を送ります」を出すか | 送るボタンの横に送信先を出し、録音の帯にも OpenAI の一文を出す。説明書 §5 の再委託先と画面を一致させる（今は画面のどこにも OpenAI が出ていない） | C4・C6・C9b の送る帯の文言 |
| 6 | 点検の画面の3点: ①「PDF は原本のまま AI に送られます。名前の置き換えは効きません。」の文言でよいか ②履歴の表から利用者名・ファイル名の列を外してよいか ③点検の説明を新しい⑧章にするか①章に入れるか |  | ①その文言でよい（「AI による点検です。最終判断は人が行ってください。」も併記）②外す（表示だけ先に。保存済みの実名を消す・今後保存しないは別の判断として次に相談）③⑧章として独立させる | K2・K3・D1c |
| 7 | Excel 出力の部品 xlsx 0.18.5 の高リスク警告 ── そのまま使うか CSV に替えるか | ①このまま使う（書き出しだけなので影響は小さめ）／②CSV に置き換える | まず Claude が npm audit を再実行して事実を確かめる（計画作成時の情報のまま）。書き出しだけの利用なら当面①、K1 の Excel 強化のときに CSV 併設を検討 |  |
| 8 | 利用者を選んで「つくる」を開いたとき、基本情報（年齢・性別・要介護度・世帯）を自動で入れるか |  | 「属性から入れる」ボタン（押したときだけ入る）。勝手には入れない。入れると属性が AI に届く（名前は置き換わる）ので押す前に一言出す | C2 の細部 |
| 9 | 利用者の行を押したあと、さらに「実名を表示」を押すまで関係者の名前を隠す一手間を入れるか |  | 今は入れない。「開いた直後は誰も選ばない」で十分。実機サインオフで肩越しに困る場面が出たら小さな追加として足す |  |
| 10 | 確認待ちの箱を「自分の分だけ」で始めるか、最初から事業所で共有するか |  | まず「自分が保存した書類とタスクだけ」で始める（実装が小さい）。Clerk の組織が有効になったあとに事業所共有へ広げる（書類の org_id 対応は慎重領域として CoT を出す） | T-DIR-03 の仕様 |
| 11 | 保存した書類（documents）を事業所で共有するかどうか（今は作った職員にだけ見える） |  | 2026-09-23 の決定どおり今回はやらない。「自分が保存した書類だけ」で運用してみて困ったら Claude に CoT を出させてから決める |  |
| 12 | ブラウザ拡張の配り方 | zip＋手順書／Chrome ウェブストアの限定公開／組織ポリシー配布 | 研修の配布は zip＋手順書（すぐ可能・更新は手順書で案内）。事業所が増えたらウェブストア限定公開に移る。トークンは事業所ごとに発行し EXTENSION-TOKENS.md の手順で失効 | T-DOC-06・受講事業所への配布 |
| 13 | 旧い公開の保管庫（carenote-pdfs）に残る PDF 1件を今日消す（消してよいか、ではなく「今日消す」） |  | 今日消す。公開の保管庫に置いたままのほうが危ない。操作は吉本さんが Vercel の画面で行う（Empty Store → Delete Store） | T-CL-01 |
| 14 | ~/.claude/settings.json の autoMode ブロック（環境の説明23項目・soft_deny 3件）を git に残すか手元だけにするか |  | 手元だけ。吉本さんの環境の説明なので公開リポジトリ（vivid-claude-harness）に上げる必要がない。DEPLOY では退避して戻す | T-HN-03 の手順5 |
| 15 | Issue maoucastle-game #38（安全テストの見張り4ファイルを Edit/Write 時の注意喚起に足す）を承認するか |  | 承認。実装は枝に済んでいて自己テストも通っている。承認を decisions-log に1行記帳して PR で閉じる | T-HN-07・T-HN-02 |
| 16 | Issue maoucastle-game #37 自動レビューが大きい PR で完走しない件の対策 | (a) --max-turns 60／(b) 審査プロンプトの軽量化／(c) API 一時エラー時の1回リトライ | (a) を先に（最も安く試せる）。完走率を10月健診で集計して、足りなければ (c) を足す |  |
| 17 | OneDrive の中の .next でビルドが EPERM になる件の根本対策 | （あ）repo を OneDrive の外へ／（い）.next だけ同期から外す／（う）next.config の cleanDistDir:false／（え）今のガイドで回す | （い）。repo の移動より小さく、根本に効く。落ち着いたら（あ）も検討 | T-HN-13 |
| 18 | 実証で使う帳票を第5表（支援経過）にするか第1・2表にするか |  | 第5表（支援経過）。電話パイプラインの本命で件数も多く、根拠付き生成の試験（T-KN-03）とベースライン計測（T-OPS-12）を同じ帳票で回せる | T-KN-03・T-OPS-12 |
| 19 | 保存期限（5年）の起算点を作成日にするか「完結の日」にするか |  | 専門家レビューの争点3に含めて確定する（法解釈なので Claude は決めない）。確定まで自動削除は作らず、月1回の手動 SQL で運用 | T-OPS-06 |
| 20 | Vercel のエラー通知をどこで受けるか | メール／LINE | まずメール（確実・設定が簡単）。LINE は後で足せる | T-OPS-07 |
| 21 | 暗号鍵 CARENOTE_PII_KEY を誰が・どこに控えるか | 紙で金庫／パスワード管理ソフト／両方 | 両方（パスワード管理ソフト＋紙を金庫）。控える人は吉本さん＋予備1人。鍵の値は Claude に見せない | T-OPS-09 |
| 22 | 旧画面を映している使い方の動画6本を「準備中」に切り替えるか、旧画面のまま残すか |  | 「準備中」に切り替える。旧画面を「使い方」として見せ続けるより誤案内が少ない。撮り直しは新しい画面が本番にそろってから | T-DOC-01 |
| 23 | 作り直しの案に描いた新機能（Ctrl K・分割の常時プレビュー・手順レール）を作るか |  | 常時プレビューは C5 として計画に残す。Ctrl K と手順レールは見送り（作り過ぎない §2.5-F） |  |
| 24 | 本番のログイン（Clerk）を本番用の環境へ切り替えるか（自分のドメインが要る） | （ア）ドメインを取って切り替え、事業所づくり（T-NOW-04）はその後／（イ）当面は開発用のまま（100人まで・守りの水準が低い・データを移せない、を承知して記帳） | （ア）。職員を入れる前に切り替えないと、入れた後で作り直しになる。ドメインの費用と手順は Claude が調べて示す | T-NOW-04・T-NOW-05 |
| 25 | Clerk の事業所の人数の上限（今は5人）と、個人のアカウントを許すか | 上限を職員数に合わせて上げる／そのまま。個人のアカウントを許す／許さない | 上限は職員数に余裕を足して上げる。個人のアカウントは許さない（事業所で共有する前提をはっきりさせ、画面の「自分の登録分のみ」の状態を実態に合わせて直す） | T-NOW-04・T-NOW-06 |
| 26 | 本番へ出す前に、自動チェックの合格を必須にするか | 案A: main を PR 必須にし、検査の合格を必須に（説明書だけの変更を例外にするかも決める）／案B: 自動チェックが全部通った後だけ本番へ出す／案C: 本番の後にチェックが赤なら必ず通知（公開は止まらない） | 案A。いちばん単純で、今の「PR を出してから取り込む」流れと同じ | T-NOW-07 |
| 27 | carenote-ai のコードの保管場所（GitHub）が「公開」になっている。非公開にするか | （ア）非公開にする（自動チェックの無料の使用量に上限がかかる。量は要確認）／（イ）公開のまま | （ア）を検討。事業所向けの説明書・品質ルール（吉本さんの知見）・安全の仕組みの中身を誰でも読める状態。費用と手順は Claude が調べて示す | ── |

## これからの7日間（提案）

- 【9/25（木）】吉本さん: まず Vercel の Storage で旧い公開の保管庫 carenote-pdfs を空にして削除（T-CL-01・5分）。次に 本番にログインして確認表の9行を PC とスマホで確かめ（T-NOW-01）、決めること2・3・4（Clerk ロゴ・約束の1行・名簿の説明文）を Claude に返す。Claude: 第1段の独立審査 graph-doubt を回し、critical を同日に直す（T-NOW-02）。
- 【9/26（金）】吉本さん: Clerk の組織③→SQL④→2アカウント確認を同じ日に通す（T-NOW-04）。同じ Supabase 画面で client_transcripts の SQL も3分で（T-REC-01）。GitHub の Dependabot を ON（T-OPS-15）。Claude: 点検の壊れているモデル名を直して（本番で点検が止まっている） Issue #4・#10・#8 を小さな PR で直す（T-NOW-03・T-SEC-01・T-SEC-02）。
- 【9/27（土）】吉本さん: 説明書 v0.6 を弁護士／行政書士へ送り、争点3つ＋「市販書を AI の根拠に使ってよいか」を質問に添える（T-OPS-01。送る前に Claude が T-DOC-02 の古い記述を直しておく）。カイポケ照会文に一問足したものを送付（T-REC-03）。Claude: ハーネス3巡目の graph-doubt を最初から再実行し、指摘を直す（T-HN-01）。
- 【9/28（日）】Claude: 3つの作業ツリーをコミットして PR 3本（.gitattributes・#38・枝側 decisions-log を同梱）（T-HN-02・T-HN-04・T-HN-07・T-HN-11）。吉本さん: 決めること14・15・17（autoMode・#38・OneDrive）を返す。
- 【9/29（月）】Claude: redesign/a-restyle の3コミットを main へ（衝突6ファイル・PR・独立審査）（T-UI-01）。動画6本を「準備中」へ（T-DOC-01）。吉本さん: 決めること1（段階の順番と最初の範囲）を1行で返す（T-DIR-01）。
- 【9/30（火）】Claude: A7 の日付列を stash から仕上げて PR（T-UI-02）。C8（つくるの結果を保存）の CoT を提示→承認後に着手（T-DIR-02）。ハーネス PR がマージされていれば DEPLOY（T-HN-03）。吉本さん: 模擬の会議で60分の通し録音（T-REC-02）。
- 【10/1（水）】Claude: 確認待ちの箱と自動タスクの仕様1枚（T-DIR-03）と ROADMAP 第5版（T-DIR-06）。後片付け（stash 4本・マージ済みの枝・worktree・kyotei.db）を吉本さんの了解のうえ実施し、メモリを更新（T-CL-03〜06・T-CL-09）。吉本さん: カイポケ実機8項目（T-REC-04）のために来週の半日を予約する。

---
*作成: 2026-09-25 ／ 正本: この文書。変更が決まったら同じ日に直す（Doc-as-Code）。前の版に当たるもの: docs/ROADMAP.md 第4版（2026-09-12）・docs/DIRECTION-2026-09-24.md。*
