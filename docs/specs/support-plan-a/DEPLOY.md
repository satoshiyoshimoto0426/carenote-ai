# 就労A型の計画書 ── ログインなしの試行版を公開する手順（PowerShell に貼るだけ）

> だれが: 吉本さん。下の枠を**まるごと**コピーして Windows PowerShell に貼り、Enter を押すだけ（書き換える所は無い）。
> 枠の中で「置き場づくり → Vercel への公開 → 8点の確認 → ブラウザで開く」まで進む。
> なぜ吉本さんの PC で: Claude の `vercel deploy --prod` はアプリの安全装置が止める。Claude のクラウドの開発環境は
> `vercel.app` に届かない（2026-10-05 確認）。
> 仕様（印の値・道の開け閉め・回数の上限）の正本は [`README.md`](README.md) §3・§4。

## 1. 貼る前に

- **公開する版は GitHub の `main` の最新**（本番と同じコード）。それに印 `NEXT_PUBLIC_SUPPORT_PLAN_A=open` を付けて、本番とは別の URL に出す。
  `main` にログインなしの試行版がまだ入っていなければ、枠が「2/5」で止まって知らせる（何も公開しない）。
- AI の残高は CareNote 本番と同じ財布。人に見せる前に Anthropic の残高を確かめる。

## 2. 貼る枠

```powershell
& {
  $branch = 'main'
  $ref  = "origin/$branch"
  $repo = Join-Path $env:USERPROFILE 'OneDrive\デスクトップ\MaouCastle\carenote-ai'
  $prod = 'https://carenote-ai.vercel.app'
  if (-not (Test-Path (Join-Path $repo '.vercel\project.json'))) { Write-Host '止めました: carenote-ai のフォルダ（.vercel 入り）が見つかりません。この画面をClaudeに貼ってください。' -ForegroundColor Red; return }
  Write-Host "1/5 フォルダ: $repo"

  git -C $repo fetch origin $branch
  if ($LASTEXITCODE -ne 0) { Write-Host '止めました: GitHub から最新を取れませんでした。この画面をClaudeに貼ってください。' -ForegroundColor Red; return }
  $sha = "$(git -C $repo rev-parse $ref)".Trim()
  git -C $repo cat-file -e ($sha + ':lib/supportPlan/guestAccess.ts') 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "止めました: $branch にまだログインなしの試行版が入っていません（Pull Request が入ってから貼ってください）。" -ForegroundColor Red; return }
  Write-Host "2/5 公開する版: $($sha.Substring(0, 7))（$branch の最新・$(git -C $repo log -1 --format=%ci $sha)）"

  $work = Join-Path $env:TEMP ('spa-open-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $work | Out-Null
  git -c core.autocrlf=false -C $repo archive --format=zip -o "$work.zip" $sha
  if ($LASTEXITCODE -ne 0) { Write-Host '止めました: 版の取り出しに失敗しました。この画面をClaudeに貼ってください。' -ForegroundColor Red; return }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  try {
    [System.IO.Compression.ZipFile]::ExtractToDirectory("$work.zip", $work, [System.Text.Encoding]::UTF8)
    $zip = [System.IO.Compression.ZipFile]::Open("$work.zip", 'Read', [System.Text.Encoding]::UTF8)
    $missing = @($zip.Entries | Where-Object { $_.Name -and -not (Test-Path -LiteralPath (Join-Path $work $_.FullName)) }).Count
    $zip.Dispose()
  } catch { Write-Host "止めました: 版の展開に失敗しました（$($_.Exception.Message)）。この画面をClaudeに貼ってください。" -ForegroundColor Red; return }
  if ($missing -ne 0) { Write-Host "止めました: 展開できなかったファイルが $missing 個あります。この画面をClaudeに貼ってください。" -ForegroundColor Red; return }
  Copy-Item (Join-Path $repo '.vercel') -Destination $work -Recurse
  Write-Host "3/5 置き場: $work"

  Write-Host '4/5 Vercel へ公開します（数分かかります）...'
  $out = @(npx.cmd --yes vercel@48.10.10 deploy --cwd $work --prod --skip-domain -b NEXT_PUBLIC_SUPPORT_PLAN_A=open -b SUPPORT_PLAN_A_PILOT_BUILD=1 -y)
  $code = $LASTEXITCODE
  $u = $null
  foreach ($line in $out) { if ("$line" -match '(https://)?([A-Za-z0-9.-]+\.vercel\.app)') { $u = 'https://' + $Matches[2] } }
  if ($code -ne 0 -or -not $u) { Write-Host '公開で止まったか、URL が読めませんでした。この画面をそのままClaudeに貼ってください。' -ForegroundColor Red; return }
  Write-Host "    試行版の URL: $u （公開のリポジトリや SNS には書かない）" -ForegroundColor Green

  Write-Host '5/5 確かめます（AI は呼ばないので1日30回の枠は減りません）...'
  $json = '{"documentType":"supportPlanA","interviewNotes":"（架空の面談・動作確認）本人は週5日の勤務を続けたいと話した。"}'
  function Get-Final($url, $method = 'Get', $body = $null) {
    $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
      if ($body) { $r = Invoke-WebRequest -Uri $url -Method $method -WebSession $s -UseBasicParsing -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) }
      else { $r = Invoke-WebRequest -Uri $url -Method $method -WebSession $s -UseBasicParsing }
      [pscustomobject]@{ Code = [int]$r.StatusCode; Host = $r.BaseResponse.ResponseUri.Host; Path = $r.BaseResponse.ResponseUri.AbsolutePath; Body = [string]$r.Content }
    } catch {
      $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
      [pscustomobject]@{ Code = $c; Host = ''; Path = ''; Body = [string]$_.Exception.Message }
    }
  }
  function Show($ok, $label, $r) {
    if ($ok) { Write-Host "OK  $label" -ForegroundColor Green } else { Write-Host "NG  $label  (code=$($r.Code) host=$($r.Host) path=$($r.Path))" -ForegroundColor Red }
    return $ok
  }
  $all = $true
  $r = Get-Final "$u/support-plan-a"
  $all = (Show ($r.Code -eq 200 -and $r.Path -eq '/support-plan-a' -and $r.Body.Contains('試行版（ログインなし）')) '試しの版: 計画書の画面がログインなしで開き、「架空のデータだけで」の注意が出る' $r) -and $all
  if ($r.Code -eq 401 -or $r.Host -like '*vercel.com') { Write-Host '    → Vercel の「デプロイの保護」がかかっていて、外の人は開けない状態です' -ForegroundColor Yellow }
  $r = Get-Final "$u/clients"
  $all = (Show ($r.Path -eq '/support-plan-a') '試しの版: CareNote の画面へ来た人は計画書の画面へ送られる' $r) -and $all
  $r = Get-Final "$u/api/clients"
  $all = (Show (($r.Path -like '/sign-in*') -or $r.Code -eq 401) '試しの版: CareNote の名簿の道はログインが要るまま' $r) -and $all
  $r = Get-Final "$u/api/preview" 'Post' $json
  $all = (Show ($r.Code -eq 200 -and $r.Path -eq '/api/preview' -and $r.Body.Contains('"fields"')) '試しの版: ログインなしで「送る前の確認」が動く（AI は呼ばない）' $r) -and $all
  $big = '{"documentType":"supportPlanA","interviewNotes":"' + ('a' * 70000) + '"}'
  $r = Get-Final "$u/api/preview" 'Post' $big
  $all = (Show ($r.Code -eq 413) '試しの版: 上限を超える長さの文は、黒塗りの前に断る（413）' $r) -and $all
  $r = $null
  try { $x = Invoke-WebRequest -Uri "$u/api/preview" -Method Post -UseBasicParsing -Headers @{ Origin = 'https://evil.example' } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)); $r = [pscustomobject]@{ Code = [int]$x.StatusCode; Host = ''; Path = '' } }
  catch { $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }; $r = [pscustomobject]@{ Code = $c; Host = ''; Path = '' } }
  $all = (Show ($r.Code -eq 403) '試しの版: 別のサイトからの頼みは断る（403）' $r) -and $all
  $r = Get-Final "$prod/support-plan-a"
  $all = (Show ($r.Path -like '/sign-in*') '本番: 計画書の画面はログインが要るまま（今までどおり）' $r) -and $all
  $r = Get-Final "$prod/api/preview" 'Post' $json
  $all = (Show (-not ($r.Code -eq 200 -and $r.Path -eq '/api/preview')) '本番: ログインなしの「送る前の確認」は通らない（今までどおり）' $r) -and $all
  if ($all) { Write-Host '全部 OK です。ブラウザで試しの版を開きます。' -ForegroundColor Green; Start-Process "$u/support-plan-a" }
  else { Write-Host 'NG があります。この画面をそのままClaudeに貼ってください。' -ForegroundColor Red }
}
```

### 2b. （急ぎ）main に入る前の直しを出す枠 ── 作業用の枝 `feat/support-plan-a` の最新を出す

独立審査で見つかった直し（2026-10-08 の重大1など）のように、Pull Request が main に入るのを待てないときだけ使う。
上の枠との違いは、1行目の `$branch` と、**審査を通った版（`$pin`）に固定して出す**こと（枝に審査の後から足された記録は出さない）。
書き換える所は無い。main に入ったら、上の枠に戻る。

```powershell
& {
  $branch = 'feat/support-plan-a'
  $ref  = "origin/$branch"
  $repo = Join-Path $env:USERPROFILE 'OneDrive\デスクトップ\MaouCastle\carenote-ai'
  $prod = 'https://carenote-ai.vercel.app'
  if (-not (Test-Path (Join-Path $repo '.vercel\project.json'))) { Write-Host '止めました: carenote-ai のフォルダ（.vercel 入り）が見つかりません。この画面をClaudeに貼ってください。' -ForegroundColor Red; return }
  Write-Host "1/5 フォルダ: $repo"

  git -C $repo fetch origin $branch
  if ($LASTEXITCODE -ne 0) { Write-Host '止めました: GitHub から最新を取れませんでした。この画面をClaudeに貼ってください。' -ForegroundColor Red; return }
  # 審査を通った版に固定する（枝のその時の最新ではなく ── 独立審査 2026-10-08 再審査 中3）。新しく審査を通したら、Claude がこの行を直す
  $pin = 'PINNED_SHA_PLACEHOLDER'
  git -C $repo merge-base --is-ancestor $pin $ref 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "止めました: 審査を通った版（$($pin.Substring(0, 7))）が $branch に見つかりません。この画面をClaudeに貼ってください。" -ForegroundColor Red; return }
  $sha = $pin
  git -C $repo cat-file -e ($sha + ':lib/supportPlan/guestAccess.ts') 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "止めました: $branch にまだログインなしの試行版が入っていません（Pull Request が入ってから貼ってください）。" -ForegroundColor Red; return }
  Write-Host "2/5 公開する版: $($sha.Substring(0, 7))（$branch の最新・$(git -C $repo log -1 --format=%ci $sha)）"

  $work = Join-Path $env:TEMP ('spa-open-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $work | Out-Null
  git -c core.autocrlf=false -C $repo archive --format=zip -o "$work.zip" $sha
  if ($LASTEXITCODE -ne 0) { Write-Host '止めました: 版の取り出しに失敗しました。この画面をClaudeに貼ってください。' -ForegroundColor Red; return }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  try {
    [System.IO.Compression.ZipFile]::ExtractToDirectory("$work.zip", $work, [System.Text.Encoding]::UTF8)
    $zip = [System.IO.Compression.ZipFile]::Open("$work.zip", 'Read', [System.Text.Encoding]::UTF8)
    $missing = @($zip.Entries | Where-Object { $_.Name -and -not (Test-Path -LiteralPath (Join-Path $work $_.FullName)) }).Count
    $zip.Dispose()
  } catch { Write-Host "止めました: 版の展開に失敗しました（$($_.Exception.Message)）。この画面をClaudeに貼ってください。" -ForegroundColor Red; return }
  if ($missing -ne 0) { Write-Host "止めました: 展開できなかったファイルが $missing 個あります。この画面をClaudeに貼ってください。" -ForegroundColor Red; return }
  Copy-Item (Join-Path $repo '.vercel') -Destination $work -Recurse
  Write-Host "3/5 置き場: $work"

  Write-Host '4/5 Vercel へ公開します（数分かかります）...'
  $out = @(npx.cmd --yes vercel@48.10.10 deploy --cwd $work --prod --skip-domain -b NEXT_PUBLIC_SUPPORT_PLAN_A=open -b SUPPORT_PLAN_A_PILOT_BUILD=1 -y)
  $code = $LASTEXITCODE
  $u = $null
  foreach ($line in $out) { if ("$line" -match '(https://)?([A-Za-z0-9.-]+\.vercel\.app)') { $u = 'https://' + $Matches[2] } }
  if ($code -ne 0 -or -not $u) { Write-Host '公開で止まったか、URL が読めませんでした。この画面をそのままClaudeに貼ってください。' -ForegroundColor Red; return }
  Write-Host "    試行版の URL: $u （公開のリポジトリや SNS には書かない）" -ForegroundColor Green

  Write-Host '5/5 確かめます（AI は呼ばないので1日30回の枠は減りません）...'
  $json = '{"documentType":"supportPlanA","interviewNotes":"（架空の面談・動作確認）本人は週5日の勤務を続けたいと話した。"}'
  function Get-Final($url, $method = 'Get', $body = $null) {
    $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
      if ($body) { $r = Invoke-WebRequest -Uri $url -Method $method -WebSession $s -UseBasicParsing -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) }
      else { $r = Invoke-WebRequest -Uri $url -Method $method -WebSession $s -UseBasicParsing }
      [pscustomobject]@{ Code = [int]$r.StatusCode; Host = $r.BaseResponse.ResponseUri.Host; Path = $r.BaseResponse.ResponseUri.AbsolutePath; Body = [string]$r.Content }
    } catch {
      $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
      [pscustomobject]@{ Code = $c; Host = ''; Path = ''; Body = [string]$_.Exception.Message }
    }
  }
  function Show($ok, $label, $r) {
    if ($ok) { Write-Host "OK  $label" -ForegroundColor Green } else { Write-Host "NG  $label  (code=$($r.Code) host=$($r.Host) path=$($r.Path))" -ForegroundColor Red }
    return $ok
  }
  $all = $true
  $r = Get-Final "$u/support-plan-a"
  $all = (Show ($r.Code -eq 200 -and $r.Path -eq '/support-plan-a' -and $r.Body.Contains('試行版（ログインなし）')) '試しの版: 計画書の画面がログインなしで開き、「架空のデータだけで」の注意が出る' $r) -and $all
  if ($r.Code -eq 401 -or $r.Host -like '*vercel.com') { Write-Host '    → Vercel の「デプロイの保護」がかかっていて、外の人は開けない状態です' -ForegroundColor Yellow }
  $r = Get-Final "$u/clients"
  $all = (Show ($r.Path -eq '/support-plan-a') '試しの版: CareNote の画面へ来た人は計画書の画面へ送られる' $r) -and $all
  $r = Get-Final "$u/api/clients"
  $all = (Show (($r.Path -like '/sign-in*') -or $r.Code -eq 401) '試しの版: CareNote の名簿の道はログインが要るまま' $r) -and $all
  $r = Get-Final "$u/api/preview" 'Post' $json
  $all = (Show ($r.Code -eq 200 -and $r.Path -eq '/api/preview' -and $r.Body.Contains('"fields"')) '試しの版: ログインなしで「送る前の確認」が動く（AI は呼ばない）' $r) -and $all
  $big = '{"documentType":"supportPlanA","interviewNotes":"' + ('a' * 70000) + '"}'
  $r = Get-Final "$u/api/preview" 'Post' $big
  $all = (Show ($r.Code -eq 413) '試しの版: 上限を超える長さの文は、黒塗りの前に断る（413）' $r) -and $all
  $r = $null
  try { $x = Invoke-WebRequest -Uri "$u/api/preview" -Method Post -UseBasicParsing -Headers @{ Origin = 'https://evil.example' } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)); $r = [pscustomobject]@{ Code = [int]$x.StatusCode; Host = ''; Path = '' } }
  catch { $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }; $r = [pscustomobject]@{ Code = $c; Host = ''; Path = '' } }
  $all = (Show ($r.Code -eq 403) '試しの版: 別のサイトからの頼みは断る（403）' $r) -and $all
  $r = Get-Final "$prod/support-plan-a"
  $all = (Show ($r.Path -like '/sign-in*') '本番: 計画書の画面はログインが要るまま（今までどおり）' $r) -and $all
  $r = Get-Final "$prod/api/preview" 'Post' $json
  $all = (Show (-not ($r.Code -eq 200 -and $r.Path -eq '/api/preview')) '本番: ログインなしの「送る前の確認」は通らない（今までどおり）' $r) -and $all
  if ($all) { Write-Host '全部 OK です。ブラウザで試しの版を開きます。' -ForegroundColor Green; Start-Process "$u/support-plan-a" }
  else { Write-Host 'NG があります。この画面をそのままClaudeに貼ってください。' -ForegroundColor Red }
}
```

貼っても動き出さない（行の頭に `>>` が出たまま）ときは、Enter をもう1回押す。

## 3. 出てくる行の読み方

- `1/5`〜`5/5` が順に出て、8つの確かめがすべて緑の「OK」になり、最後に「全部 OK です」が出れば完了。ブラウザで試行版の画面が開く。
- 赤い「止めました」「NG」が出たら、そこで止まっている。画面の文字をそのまま Claude に貼る。
- 試行版の URL（`https://carenote-….vercel.app`）は**公開のリポジトリ・SNS・資料の配布版に書かない**。carenote-ai は公開のリポジトリで、
  URL が広まると知らない人が AI を使い、残高（CareNote 本番と共用）が減る。回数の上限（1日30回）は目安の歯止め（README §3）。
  人に渡すのは営業の場で直接。
- **前の試行版は、消すまでずっと動く**（同じ鍵で・回数の記憶もデプロイごとに別なので、残る数だけ1日の枠が増える）。新しく出して
  「全部 OK」になったら、前の試行版の URL を Claude に伝える。Claude が `vercel inspect` で番号（`dpl_…`）を調べて消す命令
  （`vercel@48.10.10 remove dpl_… --safe --yes`）を作るので、吉本さんが PowerShell で実行する（消す操作は吉本さんの確認のうえ）。
  **番号（`dpl_…`）で指定し、プロジェクトの名前（`carenote-ai`）は絶対に渡さない** ── `vercel remove <プロジェクト名>` は
  そのプロジェクトの**全部のデプロイ**を消す（CLI 48.10.10 の help の例「Remove all deployments with Project name」）。
  `--safe` は、本番の名前が付いているデプロイを消さずに飛ばす印。

## 4. してはいけないこと

- Vercel の管理画面で、試行版のデプロイ（「Production Staged」）を **Promote**・**Instant Rollback の行き先**に選ぶ ── 本番の URL
  （carenote-ai.vercel.app）が計画書だけの版に変わり、CareNote の画面が使えなくなる（本番の名前ではログインなしにはならない
  ── `lib/supportPlan/edition.ts` の `isOpenPilotAt` が、許した名前でだけ開くため）。
- 印 `NEXT_PUBLIC_SUPPORT_PLAN_A` を Vercel のプロジェクト設定の環境の値に入れる ── 次に `main` へ push したとき本番がその版になる。
  印は枠の中の `-b`（このデプロイだけのビルドの値）で付ける。

## 5. なぜこの形か（つまずいた所）

| 枠の中の形 | なぜ |
|---|---|
| `-b SUPPORT_PLAN_A_PILOT_BUILD=1` の目印を付ける | 印があるのに目印の無いビルド（GitHub からの本番の自動公開など）は、`next.config.ts` がビルドを止める（印をプロジェクトの環境の値に入れてしまった事故で本番が計画書の版になるのを防ぐ・独立審査 2026-10-08 再審査 中4） |
| `.git` の無い置き場を作り、そこから公開する | Vercel の Hobby は、作者のメールが GitHub に登録されていない記録からの公開を「Deployment Blocked」で差し止める（2026-10-04 に2回） |
| `git archive` は **zip** で書き出し、UTF-8 として展開する | Windows の `tar.exe` は `git archive` の tar の日本語のファイル名（`public/manual/CareNote-AI-操作マニュアル.pdf`）を化かし、「Invalid empty pathname」で止まる（2026-10-05）。zip は名前に UTF-8 の印が付く。PowerShell の `|` で tar を渡す形も、中身を文字として扱うので使わない |
| `core.autocrlf=false` で取り出す | この PC の Git は `core.autocrlf=true`（CLAUDE.md「既知の落とし穴」）。公開する中身の改行を repo と同じ LF にそろえる |
| 書き換える所が無い完成形にする | 置き場の名前を `<置き場>` の印のまま書いた手順を、そのまま貼って「指定されたファイルが見つかりません」で止まった（2026-10-05） |
| 公開した URL をそのまま使って8点を確かめる | Claude の開発環境からは `vercel.app` に届かず、外から確かめられない。確かめは本番の側（今までどおりログインが要るか）も含める |

---
*2026-10-08 / 再審査の直し: 目印 SUPPORT_PLAN_A_PILOT_BUILD=1 を付けた・2b は審査を通った版（$pin）に固定・Promote したときの結果を今の作りに直した・6点→8点*
*2026-10-08 / 独立審査の直し: 公開の道具の版を 48.10.10 に固定（小5）・前の試行版を消す手順（小6）・確かめに「長すぎる文は 413」「別のサイトは 403」の2点を足した・作業用の枝から出す枠（2b）を足した*
*2026-10-05 新設 / 試行版（e8f2bcf）を吉本さんの PC から公開して6点とも OK だった枠を、`main` の最新を出す形にして残した*
