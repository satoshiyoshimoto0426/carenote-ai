-- CareNote AI — 利用者・書類スキーマ（機能仕様: docs/specs/ui-redesign-and-client-storage.md）
-- Supabase の SQL Editor で実行する。
-- アクセス制御は既存 evaluations と同様：サーバ専用クライアント(service role)＋アプリ層で
-- created_by(Clerk userId) スコープ。RLS は多層防御として付与（Clerk-Supabase JWT 連携は未配線）。

-- 利用者（実名は持たない＝記号 code で表示）
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      text,                       -- Clerk org id（null可・org共有はフェーズ2）
  code        text not null,              -- 表示記号（例 "A"。UIは「A様」）
  attributes  jsonb not null default '{}'::jsonb,  -- 非識別属性（年齢・性別・要介護度・世帯）
  created_by  text not null,              -- Clerk userId
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists clients_owner_idx on clients (created_by, created_at desc);
create unique index if not exists clients_owner_code_idx on clients (created_by, code);

-- 実名（対応表・分離・暗号化保存）。Claudeへは絶対に渡さない。
create table if not exists client_identities (
  client_id      uuid primary key references clients (id) on delete cascade,
  org_id         text,
  name_encrypted text not null,           -- アプリ層 AES-256-GCM（lib/privacy/crypto）
  created_by     text not null,
  created_at     timestamptz not null default now()
);

-- 保存された帳票（下書きJSON・記号で保持）
create table if not exists documents (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients (id) on delete cascade,
  org_id          text,
  doc_type        text not null,          -- assessment|carePlan|meetingSummary|supportLog|monitoring
  status          text not null default 'draft',  -- draft|complete
  content         jsonb not null,         -- 帳票ごとの下書きJSON
  source          text not null default 'rescue', -- rescue|create
  retention_until timestamptz not null,   -- created_at + 5年（保存義務に合わせ長め）
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists documents_client_idx on documents (client_id, created_at desc);
create index if not exists documents_owner_idx on documents (created_by, created_at desc);

-- Row Level Security（多層防御。実効的なスコープはアプリ層で行う）
alter table clients enable row level security;
alter table client_identities enable row level security;
alter table documents enable row level security;

-- service role はRLSをバイパスするため、明示の anon ポリシーは置かない
-- （anonキーからの直接アクセスは許可しない＝サーバ経由のみ）。
