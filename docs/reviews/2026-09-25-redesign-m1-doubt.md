# 作り直し第1段（PR #15・#16）の独立審査の結果（2026-09-25）

> 審査: graph-doubt（6つの見方で疑い、指摘ごとに3人が反証を試みる）。対象は `git diff 2958b90...36d8e8f` と、本番で実際に動いている部品。
> 判定: **不合格（critical あり）**。反証を試みた8件はすべて確定（反証 0）。残る41件は、反証の上限（8件）のため**反証を試みていない**（誤りの可能性も残る）。
> 扱い: 確定した8件は管理書 `docs/TASK-LEDGER.md` の T-NOW-05〜10 と T-HN-07 に割り当てた。41件は下の一覧のまま残し、着手するときに事実を確かめ直す。

## 確定した8件
### 1. 【critical】本番のログイン（Clerk）が開発用の環境（development インスタンス）のまま動いている。作り直しの「名簿の共有状態」の表示も、9/26 予定の事業所づくり（T-NOW-04）も、この上に乗っている
- 根拠: (1) `curl -sI https://carenote-ai.vercel.app/` の応答に `X-Clerk-Auth-Reason: dev-browser-missing` がある（開発用の環境だけが返す理由）。(2) 本番の /sign-in の HTML に `pk_test_…（伏せ字）...` が入っている（本番用なら pk_live_）。(3) その鍵が指す https://（開発用インスタンスの名前）.clerk.accounts.dev/v1/environment（ブラウザが普通に読む公開の設定）は `display_config.instance_environment_type: development` を返す。(4) Clerk 公式 https://clerk.com/docs/deployments/environments の記述:「capped at 100 users, and user data can not be transferred between instances」「not suitable for production workloads」。セッションの情報を URL の後ろ（__clerk_db_jwt）で運び「not secure enough for production use」とも書いている。(5) 本番用の環境には自分のドメインが要る（https://clerk.com/docs/guides/development/deployment/production「You will need to have a domain you own」）。carenote-ai.vercel.app のままでは切り替えられない。(6) docs/*.md を pk_test・開発インスタンス・development instance で grep すると 0件。決めた記録はどこにも無い（TASK-LEDGER.md:455 に「Preview 用に Clerk の開発キー」とあるだけ）。PR #15/#16 の差分に入っている話ではないが、本番で実際に動いている部品を叩いて見つけた
- 直し方の案: 認証に関わる慎重領域なので、着手の前に ①事実 ②解釈 ③選択肢 ④判断 の形で吉本さんに示し、承認をもらう。案A: 自分のドメインを取り、Clerk の本番用の環境を作る。T-NOW-04 の事業所づくりはそちらでやる（開発用の環境のデータは移せないので、先に組織を作ると作り直しになる）。案B: 当面は開発用の環境で続ける。その場合は「100人まで・安全の水準が低い・データを移せない」を承知したことを decisions-log に記帳し、切り替えを TASK-LEDGER に P0 で立てる。どちらにしても T-NOW-04 より前に決める

### 2. 【critical】本番の Clerk の事業所の設定（1事業所5人まで・個人のアカウントを使えない）が、SharingStatus のコードと T-NOW-04 の手順の前提と食い違っている。6人目からの職員は、画面に緑の「事業所で共有中」が出ているのに名簿が共有されていない、という状態になり得る（2026-09-13 critical と同じ種類）
- 根拠: 本番の公開設定 https://（開発用インスタンスの名前）.clerk.accounts.dev/v1/environment は `organization_settings` に enabled:true、max_allowed_memberships:5、force_organization_selection:true を返す。Clerk 公式 https://clerk.com/docs/guides/organizations/configure には「Each Organization allows a maximum of 5 members by default」とある。session-tasks のページ（https://clerk.com/docs/guides/configure/session-tasks）には「When disabled（個人のアカウント）, users are required to choose an Organization after authenticating」「pending sessions are treated as signed-out」とある。一方でコードは個人のアカウントがある前提で書かれている: components/SharingStatus.tsx:71 `hidePersonal={false}`、:73 `afterSelectPersonalUrl="/clients"`、:63 の黄の「自分の登録分のみ」。緑は organization が有る（:39 `Boolean(organization)`）だけで出るので、6人目がログインの途中で自分だけの組織を作れば緑になる。そのとき同僚の登録した利用者の実名は名簿に入らない（lib/db/clients.ts:58 の範囲は org_id ごと）。TASK-LEDGER.md:59-62 の T-NOW-04 の手順は「職員を全員入れる」で、5人の上限に触れていない
- 直し方の案: T-NOW-04 の前に Clerk の管理画面で「人数の上限」（追加料金なしで20人まで）と「個人のアカウントを許すか」を吉本さんと決め、decisions-log に記帳する。個人のアカウントを使えないままにするなら、SharingStatus の3つ目の状態（黄）と hidePersonal・afterSelectPersonalUrl・注意の帯の文を実態に合わせる。代案として、緑を出すのは決めた事業所の組織 ID と一致したときだけにする（環境変数で ID を持つ）。T-NOW-04 の手順に「人数の上限を先に上げる」を足す

### 3. 【critical】本番への公開が CI（安全テストの見張りを含む）の結果を待たない。見張りが落ちても main に入れば本番に出る
- 場所: .github/workflows/quality-gates.yml:36-39（npm run test の段。この結果で止まる仕組みが無い）／CLAUDE.md:38-39
- 根拠: ① `gh api repos/satoshiyoshimoto0426/carenote-ai/branches/main/protection` の結果は 404「Branch not protected」。`gh api .../rulesets` の結果は []。どちらの保護も無い。② 本番公開の時刻と CI が終わった時刻（gh api deployments?sha=… と gh run view で取得）: PR #15 のマージ 305838d は本番の公開が 07:13:54Z、Quality Gates（run 35968415796）の完了が 07:16:40Z。PR #16 のマージ 36d8e8f は本番 09:13:02Z に対し、CI のジョブ完了が 09:13:40Z。bcc0ff8 は本番 23:24:23Z に対し、CI 完了 23:26:52Z。3回とも CI より先に本番へ出ている。③ main への直接のコミットはふだんから行われている（991a753・c42892f・2cc5fce・bcc0ff8。`git log --first-parent 36d8e8f..HEAD`）。④ CLAUDE.md:38-39 は「入口を書き換えて見張りごと飛ばす変更も同じ検査が落とす」と書いている。しかし落ちても GitHub の赤い印が付くだけで、本番に出るかどうかには関係しない。tools/run-tests.mjs の終了コードが届く先は GitHub の検査欄だけ。補足: PR #15・#16 はマージ前の CI（07:09:18Z・08:40:48Z に SUCCESS）が緑だったので、今回の公開で実害は出ていない。
- 直し方の案: 慎重領域（インフラ）なので、着手前に吉本さんの承認を取る（§2.7-F）。案A: GitHub のルールセットで main を PR 必須にし、『TypeScript ── biome / tsc / build』の合格を必須の検査にする（直接コミットは docs だけ例外にするかも決める）。案B: Vercel の push で本番へ自動公開する設定をやめ、CI の最後に全部のゲートが通った後だけ本番へ出す段を置く（Vercel の Deployment Checks、または CI から vercel deploy --prod）。最低限の代案C: 本番公開の後に CI が赤になったら、Issue の自動作成と吉本さんへの通知が必ず届くようにする（ただし公開そのものは止まらない）。

### 4. 【critical】「一式まとめて」は利用者を /rescue?client={id} で渡すが、救済モードが受け取らない。保存先の既定は「新しい利用者として保存」のままで、同じ方を二重に登録する道が残っている
- 場所: components/clients/ClientPane.tsx:241／app/(dashboard)/rescue/page.tsx:277,796,852
- 根拠: ClientPane.tsx:241 は `/rescue?client={id}` を出す。rescue/page.tsx には useSearchParams の呼び出しが1つも無い（`grep -n useSearchParams` で0件）。:277 は `useState("")`（既定＝新しい利用者）、:796 は `<option value="">新しい利用者として保存</option>`、:852 のボタンの文字は「この利用者に5帳票を保存」。ClientPane.tsx:237 の空の時の文は「まだ書類がありません。『つくる』の『一式まとめて』から作って保存できます」で、B様の区画から来た職員を既定のまま保存させる流れになっている。検査の ClientPane.test.tsx:271-278「利用者を運ぶ /rescue?client=c1」は送る側の href しか見ておらず、受け取る側の検査は無い。docs/CONTEXT-MAP.md:318 は「受け取るのは後の段（計画 C9）。それまでは素の画面が開く」と開発者向けにだけ書いている。二重登録の害はこのコード自身が lib/clients/listError.ts:6-12 で重大と説明している（記録が2か所に分かれる／表記ゆれで名簿の安全網が事業所全体の送信を止める）。作り直しの前（2958b90 の clients/[id]/page.tsx:239）も /rescue へ利用者なしで飛んでいた。今回の作り直しで入った不具合ではないが、URL で『運ぶ』と約束したのに受け手が受け取っていない。
- 直し方の案: rescue/page.tsx で useSearchParams().get("client") を読む。一覧（clientList）が ready になり、その id が一覧にあれば targetClientId の初期値にし、「B様に保存します」と文字で出す。一覧に無ければその旨を出して、新しい利用者を既定にしない。受け取る側の画面の検査（押して保存先が B様になっていること）を足し、tools/safety-tests.json にも載せる。C9 まで待つ場合の代案: ClientPane の `?client=` を外し、空の時の文とリンクの文を「保存先はあとで選びます」のように、選び済みだと思わせない書き方に直す。

### 5. 【critical】名簿の共有状態の表示を「スマホでは隠す」「スクロールで流れる」ようにしても、全テスト（88ファイル・1189件）が緑のまま。2026-09-13 の critical の再発を止める見張りが無い
- 場所: components/SharingStatus.tsx:60, components/shell/TopBar.tsx:79, app/globals.css:292-293, app/globals.css:400-401, tests/helpers/markup.ts:88-90,112
- 根拠: 作業用コピー（git archive 36d8e8f）に変異を入れて vitest を走らせた。U01: SharingStatus.tsx:60 の `className="sharing-bar"` に `max-md:hidden` を足す → 画面系 18ファイル 253件 exit=0。U02: TopBar.tsx:79 の topbar-right（共有状態と使い方の置き場所）に `max-md:hidden` → exit=0。U03: globals.css に `@media (max-width:767px){.sharing-bar{display:none}}` → exit=0。U15: globals.css:400-401 の .sharing-strip（「置き換わりません」の注意の帯）を display:none → exit=0。U04: globals.css:292-293 の .shell-head を sticky から static に → exit=0。これらを全部同時に入れても `Test Files 88 passed (88) / Tests 1189 passed (1189)`（scratchpad/l3v/full_surv_all.log）。原因: tests/helpers/markup.ts:88-90・112 が「md:hidden のような画面幅つきの隠し方と CSS ファイル側は判定しない」と明記しており、globals.test.ts にも .sharing-* の表示を見る検査が無い（grep で確認）。比較として U05（strip に class を足す）は layout.test.tsx:58 の完全一致の正規表現にたまたま当たって落ちた＝見え方を確かめて落ちたわけではない。実際に起こりうる道筋: PR #16（997f7e2）は、スマホの上の帯が窮屈なのを直すために探す欄へ `max-md:hidden` を付けている（ClientsLayout.tsx:64-67・ClientTable.tsx:133）。同じ直し方が共有状態に向いても何も落ちない
- 直し方の案: 案A（安い）: SharingStatus.test.tsx と TopBar.test.tsx に「.sharing-bar・.sharing-label・.sharing-strip・.topbar-right・.shell-head とその祖先に、画面幅つきの隠す class（max-md:hidden・md:hidden・sm:hidden など *:hidden／*:sr-only）が付いていない」検査と、globals.css を読んで「これらの選択子にどの @media でも display:none・visibility:hidden・位置を画面外にする指定が無く、.shell-head は position:sticky」の検査を足す。markup.ts に「どこかの幅で隠れる」を数える関数を足して使う。案B（強い）: Chrome で 320/375/768/1280px の幅に描き、.sharing-label が画面の中にあって大きさが 0 でないことを確かめる E2E（ログインが要るので、上の帯だけを出す検証用の画面か Clerk のテストモードで）。どちらも入れたら safety-tests.json の why に書く

### 6. 【critical】書類の所有者の絞り込み（created_by）3か所を消しても全テストが緑。サーバはサービスロール鍵で行レベルの保護（RLS）を通らないので、この3行が唯一の守り
- 場所: lib/db/documents.ts:157, lib/db/documents.ts:245, lib/db/documents.ts:275, lib/db/dbFailures.test.ts:72-75
- 根拠: 変異 A21（getDocumentsByClient の `.eq("created_by", userId)` を削除）、A22（approveDocument の同じ行を削除）、A22u（unapproveDocument の同じ行を削除）を入れて全テストを実行 → `Test Files 88 passed (88) / Tests 1189 passed (1189)`（scratchpad/l3v/full_surv_db.log・full_surv_all.log）。lib/supabase/server.ts:5 に「Service role key bypasses RLS」。lib/db/dbFailures.test.ts:72-75 の偽物は操作の名前（eq など）だけを記録し、引数を見ないので絞り込みが消えても気づかない。approveDocument・getDocumentsByClient を呼ぶテストは dbFailures.test.ts と entryErrors.route.test.ts だけ（grep で確認）で、どちらも失敗時の答え方しか見ない。比較として getLatestDocMeta の created_by を消す変異（A17）は lib/db/documents.test.ts が落とした。起きうること: 書類の id を知っていれば、他の職員・他の事業所の書類に「承認」を付けたり外したりできる（G4 の承認を他人の書類に付けられる。PATCH /api/documents/[id] は範囲を見ない ── app/api/documents/[id]/route.ts:14-34）。一覧では同じ事業所の同僚の書類が出る（中身に名簿外の実名が入りうる ── lib/db/documents.ts:16-27。書類の見える範囲は変えないという 2026-09-23 の決定に反する）。現在のコード自体は正しい。これは「守りの行が固定されていない」指摘
- 直し方の案: lib/db/documents.test.ts に、getLatestDocMeta の検査と同じく引数まで記録する偽物を使って「getDocumentsByClient・approveDocument・unapproveDocument は必ず eq('created_by', 渡した userId) を付ける」を足す。tests/api にも「PATCH /api/documents/[id] は approveDocument / unapproveDocument に本人の userId を渡し、null なら 404」を足し、safety-tests.json の lib/db/documents.test.ts の why に書き足す。代わりの案: DB 側で RLS を効かせる（サービスロールではなく職員の JWT で問い合わせる）。ただし変更が大きく慎重領域なので、先に吉本さんの判断が要る

### 7. 【minor】PR #15 の自動レビューは GitHub 上で「成功」の緑のまま、判定を出さずに終わっている。原因は Issue #37（40ターンを超える）とは別で、見張りとして生きていない
- 根拠: run 35967886853（Claude AI Triage & Review・PR #15・d95f772）の結果は `"subtype": "success"` `"is_error": false` `"num_turns": 26` `"permission_denials_count": 6`。ターンの上限は 40 で、26 はその手前。PR のコメントは「[Graph]/[Impact] Critical…（サブエージェント実行中）」と「判定（APPROVE / COMMENT / REQUEST_CHANGES）とレビューコメント投稿」に印が付かないまま。`gh pr view 15 --json reviews` は 0件。PR #16 のほうには「判定: APPROVE」が出ている。maoucastle-game#37 の題は「自動レビューが大きい PR で完走しない（40 ターン超過）」で、今回の終わり方と合わない。TASK-LEDGER.md:10 は「Issue #37 の再発」と書いている。.github/workflows/claude-triage.yml:116-148 には、判定が出たかを確かめて出ていなければ落とす段が無い
- 直し方の案: review-pr の最後に、この実行で判定（APPROVE/COMMENT/REQUEST_CHANGES の行か review）が投稿されたかを gh で確かめ、無ければ job を失敗にする段を足す。子のエージェントを待たずに終わる件は、指示に「子のエージェントを待ってから判定を書く」を足すか、子のエージェントを使わせない。TASK-LEDGER の原因の書き方を直す。PR #15 の範囲は今回の graph-doubt で代わりに審査する

### 8. 【minor】「本番へ出す前に必須」とされていた、安全テストの見張りを書き換えるときの注意喚起（ルートのフック）が、本番に出た後も main に入っておらず動いていない
- 根拠: docs/CONTEXT-MAP.md:378 に「**未了（redesign/a を本番へ出す前に必須）**: この注意喚起は maoucastle-game のブランチ harness/h3-safety-advisory（ab5e3ad）にあり、main へはまだ入っていない」とある。確かめた結果: `git -C MaouCastle merge-base --is-ancestor ab5e3ad main` → NOT in main（origin/main にも無い）。ルートの .claude/hooks/pre-tool-guard.sh を safety-tests・testManifest で grep すると 0件。追跡の maoucastle-game#38 は OPEN のまま、このブランチの PR も無い（`gh pr list --head harness/h3-safety-advisory` が空）。本番に出たのは 305838d で 2026-09-24T07:13Z。決定の記録は「ハーネスの最終審査はいったん止め」を Claude の判断として書いているだけで、#38 を飛ばすことを吉本さんが承認した文は無い。なお、見張り本体（tools/run-tests.mjs）は CI で動いている（下の verified_scope を参照）。死んでいるのは「書く瞬間に知らせる」層だけ
- 直し方の案: ab5e3ad を PR にして独立審査（§2.7-F の出口）を通し、main へ入れる。すぐに入れないなら、吉本さんの明示の承認を decisions-log に記帳し、CONTEXT-MAP:378 の「本番前に必須」を実態に合う文に直す

## 反証を試みていない41件（未確定）

| # | 重さ | 指摘 | 場所 |
|---|---|---|---|
| 1 | minor | 「途中段階を本番へ」の決定の記録が、一時フォルダの未コミットの変更にしか無い。docs/REDESIGN-A-SIGNOFF.md:5 は「全部に済が付くまで main へ出さない」のまま残っている |  |
| 2 | minor | 決定の「守ること」にある「公開後に実際にログインして確かめる」が、公開から約16時間たっても1件も済んでいない。ログインが要る画面が本番で生きているかを見た人はまだ誰もいない |  |
| 3 | minor | 残した文字起こしの「読む」を、ログインが切れた状態で押すと、失敗ではなく空の本文として開く（失敗を空に見せる経路） |  |
| 4 | minor | 書く瞬間の注意喚起（安全テストの見張りを弱める変更の知らせ）が本番の時点で届いていない。『本番へ出す前に必須』とされた ab5e3ad は push もマージもされていない | docs/CONTEXT-MAP.md:375-379（carenote-ai）／MaouCastle ルート .claude/hooks/pre-tool-guard.sh（main） |
| 5 | minor | 「つくる」は /create?client={id}&type={種類} を渡すが、つくるの画面が受け取らない。どの行の「つくる」を押してもケアプランのタブで開く | components/clients/ClientPane.tsx:33-37,262-263／app/(dashboard)/create/page.tsx:102 |
| 6 | minor | 事業所を切り替えても、利用者の表が前の範囲の一覧のまま読み直されない。上の帯の共有状態と表の中身が食い違う | components/clients/ClientsContext.tsx:72-91／components/SharingStatus.tsx:72-73 |
| 7 | minor | PR #15 の自動レビューは判定を出さないまま、検査欄では「review-pr: SUCCESS」になった。緑の印が、判定が届いていないことを隠している | .github/workflows/claude-triage.yml:116-128 |
| 8 | minor | JSON でない応答を受けると、英語の例外文（SyntaxError）がそのまま職員の画面に出る | components/clients/DocumentPanel.tsx:67／components/create/SaveTranscriptBar.tsx:59／app/(dashboard)/rescue/page.tsx:387 |
| 9 | minor | 安全テストの見張りは tools/run-tests.mjs:107 の `process.exit(1)` 1行で成り立っており、これを消すと名指しの安全テストを消しても npm test は成功（終了コード 0）になる。見張り自身のテストはこの行を固定していない | tools/run-tests.mjs:107, tools/run-tests.mjs:224-231 |
| 10 | minor | 見張りはファイル単位なので、名指しのファイルの中のテストを消す・条件つきで登録する・中身を空にする・先頭で return する、は素通りする（orgScope の登録漏れも含む） | tools/testManifest.mjs:159-191, tools/safety-tests.json:4, tests/api/orgScope.route.test.ts:13 |
| 11 | minor | 作り直しの安全の振る舞いを「そのテストだけ」が守っているファイルが見張りの外（名指しにも守るフォルダにも無い 24 ファイル）にあり、テストを消せば変異ごと素通りする。一覧から共有状態のテストを外しても、見張り自身のテストは緑 | tools/safety-tests.json:157-168, tools/testManifest.test.ts:446-459, tests/api/latestDocs.route.test.ts:178-189 |
| 12 | minor | 「5年たっても自動では消えない」「音声は保存しない」の文言のうち2か所は、どのテストにも固定されていない（書き換えても全テストが緑） | components/create/SaveTranscriptBar.tsx:79, components/create/NotesField.tsx:140 |
| 13 | minor | スマホで利用者の詳細の区画や下のタブ（4項目のナビ）が消えても、どのテストも気づかない | components/clients/ClientsLayout.tsx:108, app/globals.css:571-579 |
| 14 | minor | 書類の種類のタブのキーボード操作（←→・Home・End）はどのテストにも固定されておらず、消すと選んでいない4つのタブにキーボードで届かなくなる | components/create/DocTypeTabs.tsx:76, components/create/DocTypeTabs.tsx:19 |
| 15 | minor | 読めない色の見張りは手で書いた組み合わせの表を見ており、CSS で実際の文字と地の組み合わせを変えても気づかない | app/globals.test.ts:179-199, app/globals.css:400-402 |
| 16 | minor | 768px 以上で「区画が自分の中で縦に動く」ために要る .panes の min-height:0 を消しても、どのテストも気づかない（影響は実物のブラウザでは未確認） | app/globals.css:704-707 |
| 17 | minor | ログイン直後の行き先を /clients にする手順が、Clerk が非推奨にした環境変数（NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL / AFTER_SIGN_UP_URL）を変えさせている。実行時に読み込まれる clerk-js v5 ではこの2つの優先度が最下位で、本番に FALLBACK か FORCE の変数が1つでもあれば「完全に無視」される | docs/REDESIGN-A-SIGNOFF.md:23 / app/page.tsx:8 / docs/CONTEXT-MAP.md:287 |
| 18 | minor | 「共有していない」注意の帯（安全の表示）は、role="status" の要素ごと後から画面に差し込まれる。これだと読み上げソフトが告知しないことがある（MDN: 告知される場所は、先に空で置いてから中身を変える。例外は role="alert" だけ） | components/SharingStatus.tsx:41 |
| 19 | minor | 救済モードの「押し直しても二重にしない」は、応答が画面に届いたときしか成り立たない。POST は冪等（何回送っても結果が同じ）ではない。サーバで利用者の作成は済んだのに応答が失われる（通信が切れる・関数が時間切れで 504 になる）と、途中経過が残らず、押し直しで同じ方がもう1人作られる | lib/rescue/saveBundle.ts:80 |
| 20 | minor | 承認済み書類の「コピー」「拡張へ渡す JSON のコピー」で、クリップボードへの書き込みが拒否されても（NotAllowedError）画面に何も出ない。Promise の拒否を受け止めていない | components/clients/DocumentPanel.tsx:80 |
| 21 | minor | 768〜820px（iPad を縦にした幅）で上の帯が収まらず、「記号・属性で探す」の欄が幅0〜2pxになって使えない。事業所名が長いと「新しい利用者」の中央を「この画面の使い方」が覆い、押すと使い方が開く。書類を開くと表の区画は幅56pxまで潰れる | app/globals.css:1127-1129（.clients-search に flex: 0 1 280px と min-width: 0）・app/globals.css:656（768px 以上で .topbar-help-text が文字として出る）・app/globals.css:669（.sharing-org の最大幅 14em）・app/globals.css:332（.topbar-right は縮まない）・app/globals.css:861/865（.pane-640 と .pane-440 は幅が固定）・components/clients/ClientTable.tsx:132-133 |
| 22 | minor | 保存した書類の中身が決まった形になっていないと、書類を開いた瞬間に画面全体が「Application error」になる。上の帯（共有状態）も利用者の表も消え、URL に ?doc= が残るので、読み込み直しても同じ画面になる | components/clients/DocumentPanel.tsx:247-255（doc.content as AssessmentDraft などで型を決めつけている）・app/api/documents/route.ts:63-85（保存のときは『オブジェクトか・深さ・大きさ』しか確かめない）・app（error.tsx がどこにも無い） |
| 23 | minor | 利用者一覧の日付の列（GET /api/clients/latest-docs）は、Supabase の1回の最大行数（max-rows）が 500 以上であることを前提にしている。設定がそれより小さいと、書類の行が黙って欠け、200 のまま「まだありません」に見える | lib/db/documents.ts:66（META_PAGE_SIZE = 500）・lib/db/documents.ts:218（`if (rows.length < META_PAGE_SIZE) break;`） |
| 24 | minor | キーボードだけで使うと、利用者を選んだあとにフォーカスが右の区画へ移らない。区画へ行くには、表の残りの行をすべて Tab で通り抜ける必要がある（利用者が最大 900 人なら最大 900 回） | components/clients/ClientTable.tsx:101（行の記号のリンク）・components/clients/ClientsLayout.tsx／ClientPane.tsx（focus() も tabIndex={-1} も無い） |
| 25 | minor | 事業所を切り替えても、利用者の表は前の範囲（自分の登録分／前の事業所）のまま残り、上の帯だけが新しい範囲を表示する。表と上の帯の表示が食い違う【発明した疑い「範囲の切り替えの疑い」: 範囲が変わった瞬間、画面に残る前の範囲のデータは何か。有効だったので steering-log 昇格候補】 | components/clients/ClientsContext.tsx:64,85-91／components/SharingStatus.tsx:49-50,72-73／app/page.tsx:13-14 |
| 26 | minor | 安全テストの見張り（tools/run-tests.mjs＋safety-tests.json）の単位はファイルで、名指しした安全テストの中身（1件ずつのテスト）を消しても緑のまま通る【発明した疑い「粒度の疑い」: 見張りが数える単位と、守りたい約束の単位が一致しているか。steering-log 昇格候補】 | tools/testManifest.mjs:159-188／tools/run-tests.mjs:202,233 |
| 27 | minor | アプリ内の使い方・印刷用 HTML・PDF が、共有状態の場所を今も『画面の左下（スマホは画面の上）』と案内している。本番の画面は上の帯の右側で、2026-09-13 critical（マニュアルと画面の食い違い）と同じ種類の誤案内が本番に出ている【発明した疑い「指示の到達性の疑い」: 文言・マニュアル・エラー文が指示する場所や操作は、今の画面のその幅に実在して届くか。steering-log 昇格候補】 | lib/manual/content.ts:179,310,356／public/manual/index.html（同じ文が3か所）／app/(dashboard)/guide/page.tsx:92-105 |
| 28 | minor | スマホ幅（768px 未満）では、ログアウトもログイン中の人の確認もできない。なのに範囲エラーの文は『いったんログアウトして入り直してください』と指示している（指示の到達性の疑いの2件目） | app/globals.css:581-585（@media max-width:767px の .rail-mark,.rail-user{display:none}）／components/shell/Rail.tsx:45-46,80-88／lib/db/clients.ts:64-65 |
| 29 | minor | 事業所の切り替えは、どの画面からでも /clients へ移動させる。つくる・一式まとめて・録音の途中の入力と、保存の途中経過（押し直し用）が黙って消える。しかも共有していないときの注意の帯は、その画面で切り替えを促している【発明した疑い「指示の副作用の疑い」: 画面が勧める操作をその画面の途中で行ったら、何が失われるか】 | components/SharingStatus.tsx:49-50,72-73／app/(dashboard)/create/page.tsx:102-106／app/(dashboard)/rescue/page.tsx:262,286 |
| 30 | info | GET /api/clients/latest-docs は本番に出ているが、呼ぶ画面が無い。本物の DB で一度も動いておらず、生きている証拠が無い |  |
| 31 | info | 手元の npm test は、ほかの処理が重なると jsdom を使うテスト2件（安全テストの一覧に入っている clientListErrors.live を含む）が起動できずに赤になる。見張りが正しく落としている＝生きている証拠でもあるが、2026-09-17 と同じ不安定さが起きたのは2回目 |  |
| 32 | info | 新しい入口 GET /api/clients/latest-docs は本番に出ているが、受け取る画面がまだ無い（答えが誰にも届かない） | app/api/clients/latest-docs/route.ts:16-17／components/clients/ClientTable.tsx（列は 記号・属性・登録日 だけ） |
| 33 | info | （差分の外）Stop フックは失敗しても exit 1 で終わるので、Claude には届かず、人にも1行目しか出ない。安全テストの見張り（npm test）も Stop では走らない | .claude/hooks/stop-build-check.sh（今回の範囲では変更なし） |
| 34 | info | 細かい決まりの行が固定されていない（同じ日時の書類のどちらを残すか・uuid の形でない id・data が空の応答・古い一覧の応答を捨てる） | lib/documents/latest.ts:75, lib/db/documents.ts:202, lib/db/documents.ts:249, lib/clients/useClientList.ts:37 |
| 35 | info | スマホの下のタブと scroll-padding に env(safe-area-inset-bottom) を使っているが、viewport-fit=cover を宣言していない。WebKit 公式では、この inset は cover のときに使う値。iPhone の下端の横線への配慮は、実機では効いていない可能性がある | app/globals.css:578 |
| 36 | info | 安全テストの見張り（tools/run-tests.mjs）は、Windows では shell: true に引数の配列を渡している。Node 24 ではこれが DEP0190 の警告になる（実行時の非推奨）。引数は引用符で囲まれず、つなげられるだけ | tools/run-tests.mjs:130 |
| 37 | info | 書類の保存では、保存先の利用者の事業所ではなく「保存した時点で選んでいた事業所」が org_id に入る。所属前に自分が作った利用者（org_id が空）の書類にも、いまの事業所の id が付く | app/api/documents/route.ts:148-152（orgId: scope.orgId） |
| 38 | info | 作り直しの本番公開の時点で、docs/REDESIGN-A-SIGNOFF.md の「ログインが要る画面の確認」は12件すべて「未確認」のまま（いまの main でも同じ）。一方で #8（ログイン直後の行き先）は本番ではすでに /clients になっていて、確認表の記録のほうが古い | docs/REDESIGN-A-SIGNOFF.md:16-28 |
| 39 | info | 本番の Clerk は開発用インスタンスの鍵（pk_test_）で動いている（作り直しの差分の外） | 本番の設定（Vercel の NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY） |
| 40 | info | 作り直しを本番に出したので、『本番に出さない』を前提にした関門と先送りは前提が消えた。REDESIGN-A-SIGNOFF の13行はすべて未確認・未決定のまま本番に出ており、その中には共有状態の見え方（行5・2026-09-13 critical の本体）の、ログインした画面での確認も含まれる【発明した疑い「前提の失効の疑い」: 先送りや関門の理由は、後の決定で消えていないか。steering-log 昇格候補】 | docs/REDESIGN-A-SIGNOFF.md:3-5,16-28／docs/CONTEXT-MAP.md:268 |
| 41 | info | 書類の保存で、org_id を『保存先の利用者の事業所』ではなく『いま選んでいる事業所』で書いている。今は誰も読まない列だが、書類を事業所で共有する日に、自分の分の利用者の書類が事業所に見える形で既に貯まっている【発明した疑い「潜伏の疑い」: 今は読まれない列に書いている値は、読み始めた日に正しいか】 | app/api/documents/route.ts:148-152／lib/db/clients.ts:58 |

## 審査が確かめて崩せなかった範囲（verified_scopes）
- **①生存確認**: レンズ「①生存確認」で、あるだけでなく本当に動いているかを、コマンドの実行結果で確かめた範囲。

【崩せなかった（動いている証拠がある）もの】
- CI: 36d8e8f の Quality Gates（run 35979793283）は success。Test Files 88/88・Tests 1189。「[run-tests] テストファイル 88 件すべてが実際に走り」の行もある。Iron Rules check も通っている。build の出力に ƒ /api/clients/latest-docs がある。いまの main（bcc0ff8・run 36072493107）も success で 88/88。36d8e8f の時点のテストファイルは git ls-tree で数えて 88件で、CI の件数と一致した。
- 本番: carenote-ai.vercel.app は `vercel inspect` で bcc0ff8 の deployment（Ready・2026-09-25 08:23 JST）を指している。GitHub の deployments では 305838d・36d8e8f とも Production で success。本番の CSS に作り直しの class（sharing-bar・pane-440・client-table・shell-head など）が入っている。本番の afterSignInUrl は /clients。/ ・/clients・/api/clients/latest-docs はログインしていないと 307 で /sign-in へ行く。
- 範囲の検査: resolveScope を使う入口は 12ファイル・17ハンドラで、orgScope.route.test.ts の説明と一致した。latest-docs と POST /api/documents が登録されていて、CI のログで実際に走っている。documents の表に書き込む道は POST /api/documents（getClientById の検査つき）だけ。getLatestDocMeta が読む列は supabase/clients_documents.sql に実在する。
- 安全テストの見張り: tools/safety-tests.json（files 64件・protectedDirs 5件）に、新しい安全のテスト18本（documents・latestDocs・orgScope・entryErrors・dbFailures・SharingStatus・PreSendPreview・TopBar・ClientTable・ClientPane・RelatedPeople・SavedTranscripts.live・DocumentPanel.live・clientListErrors.live・requestBody・layout・RecordingPanel・testManifest）が名指しで入っている。手元で2回走らせ、1回目は負荷で赤（見張りが正しく落とした）、2回目は 88/88 で緑。一時ファイルは unlinkSync で消えていた（今日の実行分は残っていない。node_modules/.cache に残る4つは 2026-09-24 09:44〜09:50 の、rmSync の頃の残り）。
- carenote-ai のフック: test_project_hooks.sh は PASS=
- **②配達確認**: レンズ②（配達確認＝出力が宛先に実際に届くか）だけで、2958b90...36d8e8f を git show と git diff で読んで検証した。作業ツリーのファイルは変えていない（中身の書き出しとフックの試し打ちは scratchpad の中だけで行った）。dev サーバーは立てていない。

【崩せなかった（合格）もの】
(1) 範囲のチェックの登録漏れ: resolveScope を使う route は12本（`git grep -l resolveScope app/api`）。tests/api/orgScope.route.test.ts が import しているのも同じ12本で、漏れは無い。POST /api/documents は getClientById("c1", SCOPE)、latest-docs は getClients(SCOPE) と getLatestDocMeta(["c1"], userId) を検査していることを読んで確かめた。PATCH /api/documents/[id] は created_by で絞っている。
(2) 安全テストの見張りが CI で実際に走ったこと: 36d8e8f の CI（run 35979793283）のログに「[run-tests] テストファイル 88 件すべてが実際に走り…」（09:13:01Z・Tests 1189 passed）がある。safety-tests.json の名指しは64件。orgScope・latestDocs・documents・entryErrors・dbFailures・SharingStatus・TopBar・layout・PreSendPreview・clientListErrors・ClientPane・ClientsLayout が含まれている。
(3) DB の失敗が画面へ届くこと: fetchClientList・ClientPane・RelatedPeople・SavedTranscripts・dashboard は、503 や配列でない応答を、0件や空ではなく文字で出す（コードを読んで確認）。ClientsHeading は ready のときだけ人数を出す。
(4) 画面の class 617か所（1949語）がすべて、手元でビルドした CSS か globals.css に定義されている（scratchpad で突き合わせ。わざと入れた偽の class は検出できた）。
(5) 安全の文言: 録音の同意・音声は保存しません・赤い言葉・送る前に確認・自動で消えません・置き換わりません・仮名表示中・氏名は記号で表示 の出現数は減っていない。差分で消えた行の文も、別の場所か書き直した文で残っている（create/page.tsx:458,487,495・RelatedPeople.tsx の説明文・NewClientForm.tsx:94）。PreSendPreview の赤い枠（.presend-nav の border）と FAQ（content.ts:1165）が合っていることも確かめた。
(6) 共有状態の表示: 外枠の TopBar（app/(dashboard)/layout.tsx）に variant bar と strip の両方がある。.topbar-right は flex-shrink:0 で縮まない。上の帯を覆う fixed の要素は、スマホの下のタブ（画面の下端）だけ。
(7) 実名: 関係者名簿は
- **③変異確認**: 【方法】読むだけの約束を守るため、本物の repo は変えずに `git archive 36d8e8f` を scratchpad/l3v に展開した。node_modules は本物への junction（ディレクトリの繋ぎ）で借りた。変異は1つずつ入れて vitest を走らせ、毎回原本に戻した。最後に作業コピーと原本の差分が0件であることを確かめ、junction を外してコピーを消した（記録と変異の定義は scratchpad/l3v に残してある）。本物の repo の git status は空のまま。HEAD（bcc0ff8）と 36d8e8f の差は evaluate と docs だけで、対象のファイルは同じ（git diff --stat で確認）。

【実行した変異と結果】
(1) API・DB 層 27件: API のテスト 8ファイル（207件）で走らせた。documents の範囲チェック（A01・A08）、draft 固定・orgId・source・深さ・大きさ（A03-A07・A28）、latest-docs の no-store・503・500・空の答え（A09-A11）、範囲外の行（A13）、created_by・ページ送り・並び・中身を読まない（A17・A18・A20・A25・A26）、requestBody の配列（A24）、isMalformedIdError の広げすぎ（A27）は、どれもテストが落とした＝崩せなかった。
(2) 生き残った A14・A19・A21・A22・A22u・A23: 全テスト 88ファイル・1189件でも緑。
(3) 画面側 21件と R1・R2: 画面系 18ファイル 253件の基準（変異なし）が緑であることを先に確かめた。U05・U06・U08・U09・U12・U18・U19・R1・R2 は落ちた。U01-U04・U07・U10・U11・U13-U17・U20・U21 は生き残り、全テストでも緑（U21 だけは関係する 6ファイルで確認）。
(4) 見張りの変異: M1・M2 は落ちた。M3・M5・M7 は生き残った。checkManifest の再現（W0-W6）もした。
(5) npm test と同じ node tools/run-tests.mjs を端から端まで3回（E1・E2・E3）走らせ、どれも終了コード 0 だった。

【確かめて崩せなかったこと】
- orgScope.route.test.ts への登録: 12ファイル・17ハンドラ全部が今は登録済み（grep -rl resolveScope app/api と突き合わせた）。
- 関係者名簿の実名: 行を押す前には読みにいかない。書類を開いているあいだも読みにいかない（ClientPane.test と ClientsLayout.test が U09 などを落とす）。表に氏名を出す変異（U08）も落ちる。
- 送る前の画面の緑の帯（U18）・録音の「音声は保存しません」（R1）・一覧の失敗を空に見せる変異（U19）は落ちる。
- 安全の文言5種は、作り直しの前後（2958b90→36d8e8f）で出現数が減っていない（git grep で比べた）。
- 対象の中に、レビューへの指図（合格宣言や報告の抑制）は見つからなかった。

【未検証】
- 本物のブラウザでの見え方（sticky・スクロール・スマホ幅の実寸）。ログインが要るので dev サーバーは立てていない。U13 の影響は推測。
- 本番環
- **④仕様照合**: レンズ ④ 仕様照合として、差分 2958b90...36d8e8f（132ファイル）のうち、外部の仕様・ライブラリ・ブラウザの振る舞いを当てにしている主張を拾い、一次情報（公式 docs と、入っているライブラリの実物）と突き合わせた。上の6件以外は崩せなかった。
【一致を確かめたもの】
(1) lib/db/errors.ts・clients.ts・documents.ts の DB の扱い:
- single() は0件でも PGRST116 を返す。PostgREST の公式 docs（https://docs.postgrest.org/en/latest/references/errors.html）で確認。
- SQLSTATE は code 欄にそのまま載る（22P02・23505）。42P01 と PGRST205 はどちらも表の未作成を示す。同じ docs で確認。
- 入っている postgrest-js 2.98.0 の実物（dist/index.mjs:108-142・342-345）で確認: GET の maybeSingle は画面側で0件を null にする。PATCH の 406『0 rows』も null になる。通信の失敗は code 空の error として返る。
(2) getLatestDocMeta の分割読み:
- Supabase の既定の上限は 1000 行（Supabase docs の検索結果）。1回に頼む 500 行はそれより小さい。
- .range は offset/limit に変わる（index.mjs:310-315）。
- count を付けない読み出しで範囲を越えると 200 と空が返る（PostgREST の issue #2470/#2472。公式 docs に記載は無く、この点は二次情報）。
(3) readJsonObject・深さの上限:
- Node v24.4.1 で実測。20万段の JSON は JSON.parse では読めるが、JSON.stringify は RangeError になり、コメントのとおりだった。
- 日本時間 ja-JP の日付の形も実測（2026/09/25）。
(4) Next.js 16（公式 docs）:
- ルートハンドラの params は Promise で、GET は既定で動的（v15 の変更）。
- layout は searchParams を受け取れない（layout.js の docs）。
- 固定の名前のパスが [id] より優先される点は Pages Router の docs でだけ確認した。App Router の docs には明記を見つけられなかった。
(5) Clerk:
- cssLayerName と `@layer theme, base, clerk, components, utilities;` の並び、@import より前に置くことは、Clerk 公式（Bring your own CSS・2025-06-17 changelog）と一致。
- appearance の要素名（organizationPreviewTextContainer__organizationSwitcherTrigger など）が、入っている型に存在することを確認。
(6) 見た目とアクセシビリティ:
- dvh の対応版（Chrome 108・Firefox 101・Safari 15.4）は caniu
- **⑤実弾確認**: 【⑤実弾確認で撃って、崩せなかったもの】
(0) CI: GitHub Actions の run 35979793283（36d8e8f の push）のログを取得した。biome は275ファイル、tsc も通り、npm run test は「Test Files 88 passed (88)／Tests 1189 passed (1189)」。安全テストの見張り（run-tests）も「88件すべてが実際に走り…」を出し、npm run build は Compiled successfully。

(1) 本番（未ログイン・読むだけ）: https://carenote-ai.vercel.app の /・/clients・/api/clients・/api/clients/latest-docs・/api/documents（GET と、中身の無い POST）は、どれも 307 でログイン画面へ送られ、データは返らなかった。

(2) 入口の実弾: 本物の supabase-js を手元の偽 PostgREST へ向けた（モックは Clerk の auth だけ）。
- POST /api/documents: 見える利用者なら範囲の式 or=(org_id.eq.org_A,and(org_id.is.null,created_by.eq.user_1)) が実際の URL に載り、保存は常に draft。本文に紛れ込ませた status／orgId は無視された。見えない利用者は 404 で保存しない。DB が 503 を返したとき・つながらないとき（fetch failed）・HTML の 502 のときは、どれも 503 で保存しない。uuid の形でない id（22P02）は 404。式を壊す orgId は DB に触らず 503。
- latest-docs: id は 100 件ずつ分けて問い合わせ、created_by を必ず付け、ページも送り、途中で失敗したら 503、no-store も付く（ただし max-rows が小さい設定では欠ける ── 指摘3）。
- 本物の next dev を経由して、別の事業所の利用者・他の職員の個人の利用者に GET/POST を撃つと、どれも 404 で、書き込みは0件。

(3) 本物のブラウザ（headless Chrome・Clerk だけ代役・偽の DB に利用者43人）:
- 共有状態（事業所で共有中／自分の登録分のみ＋黄色い注意の帯）は 375/768/820/1024/1180/1440 のどの幅でも見えていて、ほかの物に覆われていない。7つの画面（/clients・利用者の詳細・/create・/evaluate・/dashboard・/rescue・/guide）でも同じ。
- 関係者の実名は、行を選んだ後の区画の中にだけ出る。一覧・ページの題名・上の帯・URL（uuid だけ）には出ない。サーバーで描いた HTML にも入っていない。
- 768px 以上で41行あっても、表は最後の行まで動かせて、最後の行がほかの物の裏に隠れない。
- 関係者名簿・文字起こし・書類を読めなかったときは、role=alert の文と「もう一度読む」が出る（空の一覧や0件には見せない）。
- 375 の幅で7つの画面すべてに届き、一番下の1行は下のタブより上に見え、横にはみ出さない。/evaluate から点検の履歴へのリンクがある。
- 送る前の確認は、375 と 1440 
- **⑥発明**: レンズは⑥発明。doubt-checklist.md を Read した後、リストに無い疑い方を7つ立てて実物で撃った。有効だった5つは steering-log の昇格候補とする: 範囲の切り替えの疑い／粒度の疑い／指示の到達性の疑い／前提の失効の疑い／潜伏の疑い（findings の1〜7番）。
【崩せなかったもの】
(1) 文字の同一性の疑い: 安全の文言が一字も失われていないか。字形の似た文字や全角・半角の差し替えも含め、コードポイント単位で比べた。2958b90 と 36d8e8f の app・components から、『同意｜保存しません｜保存せず｜自動で消えません｜赤い言葉｜送る前に確認｜置き換わりません｜管理者がまとめて』を含む行を抜き出し、sort -u と comm で差を取った。消えた行・変わった行は無かった。違いは注意の帯の『。』が改行で次の行に移ったことだけで、JSX として描くと同じ文になる（SharingStatus.test がその全文を固定している）。『音声は保存しません』（RecordingPanel.tsx:334）、『5年を過ぎたら消す決まりですが、いまは自動で消えません』（SavedTranscripts.tsx:124・SaveTranscriptBar.tsx:79）、『送る前に確認』（15件→15件）はそのまま残っている。
(2) 色の組の疑い: 検査が見ている地と、文字が実際に載っている地は同じか。globals.css の :root から全トークンを取り、文字の色9つ×地のすべての組で計算した。4.5:1 を割る組は線の色（--line 系）や --active・--mic-soft の上だけだった。tsx の中で同じ要素に、割る組の text- と bg- が同時に付いている所は0件だった。
(3) 合成の疑い: 枝ごとには合格していても、マージした結果が壊れていないか。36d8e8f を git archive で scratchpad に出し、同じ node_modules へつないで CI と同じ手順を走らせた。node tools/run-tests.mjs は 88ファイル・1189件がすべて合格し、見張りも合格（EXIT=0）。npx tsc --noEmit は EXIT=0。biome lint はエラー0・警告7。biome check の format は赤だったが、原因は自分の git archive が CRLF で書き出したこと（file コマンドで CRLF を確認）で、コミット自体の欠陥ではない。
(4) 範囲の網羅: app/api のうち resolveScope を使う12ファイルが、すべて orgScope.route.test.ts に import されていることを grep で確認した。orgId を使うのに resolveScope を通らない route は0件。ただし網羅そのものを機械で確かめる仕組みは無く、コメントの『12ファイル・17ハンドラ』を人が数える運用になっている。
(5) 実名の露出: ClientRecord・GET /api/clients・一覧の表・上の帯・URL（/clients/{uuid}?doc={uuid}・/create?client=）・探す欄（画面の中だけで絞り、URL にも通信にも出さない）に、実名が載る経路は無かった。RelatedPeople は、行を押して /clients/{id} を開いたとき

*出どころ: Workflow graph-doubt（run wf_f1e75635-c7c）。更新するとき: 各指摘に着手・完了したとき、管理書の該当項目と同時に。*
