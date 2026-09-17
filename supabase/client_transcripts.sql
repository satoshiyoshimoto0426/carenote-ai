-- CareNote AI — 文字起こし全文の保存（D-R3・2026-09-17）。Supabase の SQL Editor で実行する。
--
-- なぜ: 吉本さん決定「会議の文字起こし全文を残す」（あとから「言った・言わない」を確かめられるように）。
--       ただし全文には利用者・ご家族・他事業所職員・主治医の実名が**そのまま**入る。黒塗りは
--       文字にしたあとの AI 送信時にしか効かないため、保存するものは生の個人情報そのものになる。
--       そこで client_identities / client_related_identities と同じく**アプリ層で暗号化**して保存し、
--       復号はサーバ側だけで行う（lib/privacy/crypto・鍵は CARENOTE_PII_KEY）。
--
-- 誰が見られるか: 親の利用者（clients）が見える人だけ。スコープの判定は lib/db/clients.getClientById
--       （org_id または created_by）に一本化し、この表には独自のスコープ判定を持たせない。
--       ── 判定が2か所に分かれると、片方だけ直したときに静かに漏れる。
--
-- いつ消えるか: retention_until（作成から5年。介護記録の保存義務に合わせる）。
--       期限切れの自動削除はフェーズ2。それまでは手動（手順4）。

create table if not exists client_transcripts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients (id) on delete cascade,
  org_id          text,
  kind            text not null,            -- assessment|meeting|monitoring|support|call
  title           text,                     -- 職員がつける短い見出し（実名を書かない運用）
  text_encrypted  text not null,            -- アプリ層 AES-256-GCM（平文はDBに置かない）
  chars           integer not null,         -- 復号しなくても長さが分かるように
  retention_until timestamptz not null,     -- created_at + 5年
  created_by      text not null,            -- Clerk userId
  created_at      timestamptz not null default now()
);

create index if not exists client_transcripts_client_idx
  on client_transcripts (client_id, created_at desc);
create index if not exists client_transcripts_owner_idx
  on client_transcripts (created_by, created_at desc);
-- 期限切れの掃除（フェーズ2の自動削除で使う）
create index if not exists client_transcripts_retention_idx
  on client_transcripts (retention_until);

alter table client_transcripts enable row level security;
-- service role はRLSをバイパスするため、明示の anon ポリシーは置かない（サーバ経由のみ）。

-- ────────────────────────────────────────────────────────────────
-- 手順1: 上の表を作る（このファイルをそのまま実行）
--
-- 手順2: 入ったか確かめる
--   select count(*) as 件数 from client_transcripts;
--   → 0 件で返れば成功（まだ何も保存していないので0が正しい）
--
-- 手順3: 保存されたものの一覧を見る（**中身は暗号化されているので読めません**。これが正常）
--   select id, client_id, kind, title, chars, created_at, retention_until
--     from client_transcripts order by created_at desc limit 20;
--
-- 手順4: 保存期限の切れたものを消す（当面は手動。月1回を目安に）
--   delete from client_transcripts where retention_until < now();
--   → 消した件数が返ります。0 件なら期限切れはまだありません
--
-- 手順5: ある利用者ぶんをまとめて消す（開示・削除の請求に応じるとき）
--   delete from client_transcripts where client_id = '＜利用者のID＞';
-- ────────────────────────────────────────────────────────────────
