-- CareNote AI — 名簿を事業所（Clerk 組織）単位で共有するための追補（G3b・2026-09-12）
-- Supabase の SQL Editor で実行する。**client_related.sql を先に実行しておくこと。**
--
-- なぜ:
--   黒塗り（lib/privacy/maskPii）は名簿にある名前しか消せない。名簿の読み出しが「登録した職員本人」
--   だけだと、職員Bが職員Aの登録した利用者の実名をメモに書いたとき、置換も漏れ検査も反応せず
--   実名がそのまま AI へ出る（docs/ROADMAP.md G3b / Issue #13）。
--   アプリ側は lib/db/clients.ts の scopeExpr で「事業所の行 ＋ 組織に入る前の自分の行」を読むようにした。
--
-- ⚠ 大事な前提:
--   アプリは **org_id が入っている行**を「事業所のもの」として共有する。
--   組織を有効にする前に登録した利用者は org_id が空（null）なので、**登録した本人にしか見えない**。
--   同僚にも見えるようにするには、下の【手順3】の移行（backfill）が要る。
--   移行しないまま複数人で使うと、同僚が登録した利用者の実名は黒塗りされない。

-- ============================================================
-- 【手順1】索引を作る（先に実行。ここは何度実行しても安全）
-- ============================================================

-- 事業所に属する行は、事業所の中で記号（A・B・…）が一意
create unique index if not exists clients_org_code_idx
  on clients (org_id, code)
  where org_id is not null;

-- 事業所ぶんの読み出しが速くなるように
create index if not exists clients_org_idx on clients (org_id, created_at desc);
create index if not exists client_identities_org_idx on client_identities (org_id);
create index if not exists client_related_org_idx on client_related_identities (org_id);

-- ============================================================
-- 【手順2】移行しても記号がぶつからないか、先に確かめる（読むだけ・変更しない）
-- ============================================================
-- ここで 0 件でなければ【手順3】を実行しないこと。
-- 同じ記号の利用者が2人できると、黒塗りを戻すときに**他人の氏名**が帳票に入る。

select code, count(*) as 同じ記号の数
from clients
where org_id is null
group by code
having count(*) > 1;

-- → 1件でも出たら手順3へ進まず、開発者に連絡すること（記号の振り直しが必要）。
--   なお、振り直しをすると過去に保存した帳票の「A様」が別人を指すようになるため、
--   振り直しは保存済み帳票の確認とセットで行う必要がある。

-- ============================================================
-- 【手順3】既存の利用者を事業所のものにする（移行・backfill）
-- ============================================================
-- ⚠ 手順2が 0 件だったときだけ実行する。
-- ⚠ '<ここに Clerk の組織IDを入れる>' を実際の値（org_ で始まる文字列）に置き換えてから実行する。
--    組織IDは Clerk のダッシュボード → Organizations → 対象の組織 → ID で確認できる。
--
-- 3つの表を**同じ組織IDで**そろえる（1つでも漏れると名簿が半分だけ共有される）。

-- begin;  -- ← まとめて取り消せるようにしたい場合は、この行と末尾の commit; のコメントを外す

update clients
   set org_id = '<ここに Clerk の組織IDを入れる>'
 where org_id is null;

update client_identities
   set org_id = '<ここに Clerk の組織IDを入れる>'
 where org_id is null;

update client_related_identities
   set org_id = '<ここに Clerk の組織IDを入れる>'
 where org_id is null;

-- commit;

-- ============================================================
-- 【手順4】終わったら確かめる
-- ============================================================
-- (a) 同じ事業所に同じ記号がいないこと（0件であること）
select org_id, code, count(*)
from clients
where org_id is not null
group by 1, 2
having count(*) > 1;

-- (b) 取り残しが無いこと（3つとも 0 であること）
select
  (select count(*) from clients where org_id is null) as 利用者の未移行,
  (select count(*) from client_identities where org_id is null) as 氏名の未移行,
  (select count(*) from client_related_identities where org_id is null) as 関係者の未移行;

-- (a) が 1 件でも出た場合、アプリは送信時に
--     「同じ記号に違う氏名が割り当たっています」で生成を止める（lib/db/clients.ts の安全網）。
--     止まったら開発者に連絡すること。
