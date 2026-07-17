-- CareNote AI — G4 承認モデル移行（docs/ROADMAP.md P-LAUNCH ★G4）
-- 目的: 人間承認をデータモデルで強制する。documents.status を draft|approved の2状態にし、
--       「いつ・誰が承認したか」の監査証跡（approved_at / approved_by）を持たせる。
-- 実行: Supabase の SQL Editor で実行する（冪等 = 何度実行しても安全）。
-- 承認は PATCH /api/documents/[id] {action:"approve"} のみ（人間操作なしに approved にならない）。

alter table documents add column if not exists approved_at timestamptz;
alter table documents add column if not exists approved_by text;

-- 旧 'complete' は人間承認を経ていないため draft へ戻す（approved は人間の承認操作でのみ付く）
update documents set status = 'draft' where status not in ('draft', 'approved');
