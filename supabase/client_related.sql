-- CareNote AI — 関係者名簿（D4・2026-09-10）。Supabase の SQL Editor で実行する。
-- なぜ: 黒塗り（lib/privacy/maskPii）は名簿にある名前しか消せない。電話メモに出る家族・他事業所の
--       担当者・主治医の名前を利用者ごとに登録し、「A様の長女」のような記号へ置き換える。
-- 実名は client_identities と同じくアプリ層で暗号化（lib/privacy/crypto）。Claude へは渡さない。

create table if not exists client_related_identities (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients (id) on delete cascade,
  org_id          text,
  relation        text not null,            -- 続柄・役割（例: 長女 / 担当ケアマネ / 主治医）。記号に使う
  name_encrypted  text not null,            -- アプリ層 AES-256-GCM
  created_by      text not null,            -- Clerk userId
  created_at      timestamptz not null default now()
);
create index if not exists client_related_owner_idx on client_related_identities (created_by, client_id);
-- 同じ利用者に同じ続柄を2つ登録しない（記号「A様の長女」が一意になるように）
create unique index if not exists client_related_unique_idx
  on client_related_identities (client_id, relation);

alter table client_related_identities enable row level security;
-- service role はRLSをバイパスするため、明示の anon ポリシーは置かない（サーバ経由のみ）。
