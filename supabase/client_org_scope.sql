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
--
-- ⚠ 'org_ここを置き換える' は手順3と同じ値に直してから実行すること。
--   （すでに事業所へ移した行と、これから移す行の**両方**をまとめて見る必要があるため。
--     職員が1人ずつ順番に組織へ入る場合、あとから入る職員の記号が既存とぶつかる）

select code, count(*) as 同じ記号の数
from clients
where org_id is null or org_id = 'org_ここを置き換える'
group by code
having count(*) > 1;

-- → 1件でも出たら手順3へ進まず、開発者に連絡すること（記号の振り直しが必要）。
--   なお、振り直しをすると過去に保存した帳票の「A様」が別人を指すようになるため、
--   振り直しは保存済み帳票の確認とセットで行う必要がある。

-- ============================================================
-- 【手順3】既存の利用者を事業所のものにする（移行・backfill）
-- ============================================================
-- ⚠ 直したのは**1か所だけ**です。下の 'org_ここを置き換える' を実際の組織IDにしてから、
--    このブロックをまるごとコピーして実行してください。
--    組織IDは Clerk のダッシュボード → Organizations → 対象の組織 → ID で確認できます（org_ で始まります）。
--
-- ※ 事業所（組織）が2つ以上ある場合は、このブロックを事業所ごとに繰り返してください。
--    そのときは「どの利用者をどちらの事業所に移すか」の条件（where 句）も足す必要があるので、
--    自分で判断せず開発者に相談してください。いまは事業所は1つの想定です。
--
-- このブロックは**まとめて1つ**として実行されます。途中で問題が見つかったら何も変更せずに止まります:
--   - 組織IDを置き換え忘れていたら止まる
--   - 手順2の重複（同じ記号の利用者が2人）が残っていたら止まる
--   - 3つの表のどれかで失敗したら、3つとも元に戻る（半分だけ移行された状態にならない）

do $$
declare
  org text := 'org_ここを置き換える';
  moved_clients int;
  moved_names int;
  moved_related int;
begin
  if org !~ '^org_[A-Za-z0-9_-]+$' or org = 'org_ここを置き換える' then
    raise exception '組織IDを実際の値に置き換えてから実行してください（いまの値: %）', org;
  end if;

  -- すでに事業所にある行と、これから移す行を**合わせて**見る
  -- （職員が1人ずつ順番に組織へ入るとき、あとの職員の記号が既存とぶつかる）
  if exists (
    select 1 from clients
     where org_id is null or org_id = org
     group by code having count(*) > 1
  ) then
    raise exception '同じ記号の利用者が複数います（手順2を見てください）。移行を中止しました。';
  end if;

  update clients set org_id = org where org_id is null;
  get diagnostics moved_clients = row_count;

  update client_identities set org_id = org where org_id is null;
  get diagnostics moved_names = row_count;

  update client_related_identities set org_id = org where org_id is null;
  get diagnostics moved_related = row_count;

  raise notice '移行しました: 利用者 % 件 / 氏名 % 件 / 関係者 % 件', moved_clients, moved_names, moved_related;
end $$;

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
