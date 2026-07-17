# 拡張トークンの発行・失効ガイド（G3・運用）

> 拡張API（`/api/extension/generate`）の認可運用。DBを使わず **環境変数**で管理する（1社実証規模・§2.5-F）。
> 実体: `lib/extensionAuth.ts` / `app/api/extension/generate/route.ts`。

## 環境変数

| 変数 | 用途 | 例 |
|---|---|---|
| `CARENOTE_EXTENSION_TOKENS` | 利用者別トークン（推奨）。`ラベル:トークン` をカンマ区切り。**ラベルは擬名/コード（実名は使わない＝ログに残る）** | `cm01:9f3k...,office-a:a1b2...` |
| `CARENOTE_EXTENSION_TOKEN` | 旧・単一トークン（後方互換。ラベル `default`） | `9f3k...` |
| `CARENOTE_EXTENSION_ORIGINS` | CORS許可する追加オリジン（任意・カンマ区切り。拡張は自動許可なので通常不要） | `https://carenote.example.com` |

- どちらも**未設定なら全リクエスト拒否**（fail-closed）。
- トークンは推測されない十分な長さで。生成例:
  `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

## 発行（利用者を1人増やす）

1. 上のコマンドでトークンを1つ生成
2. `CARENOTE_EXTENSION_TOKENS` に `擬名ラベル:生成した値` を追記（例 `..., cm03:xxxxx`。**実名は使わない**＝ログに残る）
   - ローカル: `.env.local` / 本番: Vercel の Environment Variables
3. 本番は再デプロイ（env変更の反映）
4. その値を該当ケアマネへ渡し、拡張の「設定」に貼ってもらう（拡張側は各自のトークンを保存）

## 失効（漏洩・退職時）

1. `CARENOTE_EXTENSION_TOKENS` から該当の `名前:値` を削除
2. 再デプロイ → そのトークンは即無効（他の人は影響なし）

## 監査ログ

各リクエストは Vercel のログに `[extension/generate] {"result":"ok","label":"tanaka",...}` の形で残る
（**氏名・メモ本文などPIIは含めない**＝ラベル・結果・帳票種別のみ）。異常な回数・unauthorized の多発を監視できる。

## 既知の限界（設計判断として受容）

- レート制限はサーバレスの**インスタンス単位**（ウォームな間）。全体上限が要るようになったら Vercel KV 等へ昇格（§2.5-F）。
- トークンは env のため、追加・失効に**再デプロイ**が要る（DBレスの代償。1社実証では許容）。
