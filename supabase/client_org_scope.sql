-- CareNote AI — 名簿を事業所（Clerk 組織）単位で共有するための追補（G3b・2026-09-12）
-- Supabase の SQL Editor で実行する。**client_related.sql を先に実行しておくこと。**
--
-- なぜ:
--   黒塗り（lib/privacy/maskPii）は名簿にある名前しか消せない。名簿の読み出しが「登録した職員本人」
--   だけだと、職員Bが職員Aの登録した利用者の実名をメモに書いたとき、置換も漏れ検査も反応せず
--   実名がそのまま AI へ出る（docs/ROADMAP.md G3b / Issue #13）。
--   アプリ側は lib/db/clients.ts の scopeExpr で「事業所の行 ＋ 組織に入る前の自分の行」を読むようにした。
--
-- ここで足すもの:
--   記号（A様・B様…）は**名簿を共有する範囲で一意**でなければならない。職員ごとに採番したままだと、
--   共有した瞬間に別人が同じ「A様」になり、黒塗りが取り違える。
--   既存の (created_by, code) の一意制約は残したまま、事業所ぶんの一意制約を足す。

-- 事業所に属する行は、事業所の中で記号が一意
create unique index if not exists clients_org_code_idx
  on clients (org_id, code)
  where org_id is not null;

-- 事業所ぶんの読み出しが速くなるように
create index if not exists clients_org_idx on clients (org_id, created_at desc);
create index if not exists client_identities_org_idx on client_identities (org_id);
create index if not exists client_related_org_idx on client_related_identities (org_id);

-- ここまでで完了。実行後に確かめること:
--   select org_id, code, count(*) from clients where org_id is not null group by 1,2 having count(*) > 1;
--   → 0件であること（1件でも出たら、同じ事業所に同じ記号の利用者がいる＝黒塗りが取り違える）
