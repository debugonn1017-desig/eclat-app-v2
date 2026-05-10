-- ─────────────────────────────────────────────────────────────────
-- cast_targets / cast_tier_targets の書き込みをオーナー or 「ノルマ.設定」
-- 権限保持者のみに限定する。
-- ─────────────────────────────────────────────────────────────────
-- 旧: admin role 全員に書き込み許可 → スタッフが DevTools 等で直叩きで
--     ノルマを書き換えられる穴があった。
-- 新: フロントの権限ゲート（ノルマ.設定）と DB 側を一致させる。
-- ─────────────────────────────────────────────────────────────────

-- 「ノルマ.設定」権限保持者か判定する関数
create or replace function public.has_perm_norm_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_owner = true
  )
  or exists (
    select 1 from public.staff_permissions
    where staff_id = auth.uid()
      and permission = 'ノルマ.設定'
      and enabled = true
  );
$$;

-- ─── cast_targets ─────────────────────────────────────────────
drop policy if exists "cast_targets_admin_all" on public.cast_targets;

-- 読み取り: admin（旧と同じ）/ cast 自分のみ（旧と同じ）
create policy "cast_targets_admin_read"
  on public.cast_targets for select
  using (public.current_role() = 'admin');

-- 書き込み: オーナー or ノルマ.設定 権限保持者のみ
create policy "cast_targets_norm_write"
  on public.cast_targets
  for insert
  with check (public.has_perm_norm_settings());

create policy "cast_targets_norm_update"
  on public.cast_targets
  for update
  using (public.has_perm_norm_settings())
  with check (public.has_perm_norm_settings());

create policy "cast_targets_norm_delete"
  on public.cast_targets
  for delete
  using (public.has_perm_norm_settings());

-- ─── cast_tier_targets ────────────────────────────────────────
drop policy if exists "tier_targets_admin_all" on public.cast_tier_targets;

create policy "tier_targets_admin_read"
  on public.cast_tier_targets for select
  using (public.current_role() = 'admin');

create policy "tier_targets_norm_write"
  on public.cast_tier_targets
  for insert
  with check (public.has_perm_norm_settings());

create policy "tier_targets_norm_update"
  on public.cast_tier_targets
  for update
  using (public.has_perm_norm_settings())
  with check (public.has_perm_norm_settings());

create policy "tier_targets_norm_delete"
  on public.cast_tier_targets
  for delete
  using (public.has_perm_norm_settings());

-- ─── rank_criteria（既にオーナーのみだが念のため確認）────────
-- 書き込みは update のみだが、insert もブロック対象に追加。
-- 「ランク基準.設定」権限保持者にも開放する。
create or replace function public.has_perm_rank_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_owner = true
  )
  or exists (
    select 1 from public.staff_permissions
    where staff_id = auth.uid()
      and permission = 'ランク基準.設定'
      and enabled = true
  );
$$;

drop policy if exists rank_criteria_update_owner on public.rank_criteria;

create policy rank_criteria_update_perm
  on public.rank_criteria
  for update
  using (public.has_perm_rank_settings())
  with check (public.has_perm_rank_settings());

create policy rank_criteria_insert_perm
  on public.rank_criteria
  for insert
  with check (public.has_perm_rank_settings());

create policy rank_criteria_delete_perm
  on public.rank_criteria
  for delete
  using (public.has_perm_rank_settings());

-- ─── cast_shifts: 書き込みを「シフト.管理」権限保持者のみに限定 ──
-- 旧: admin role 全員に許可 → 例: 「顧客.閲覧」だけ持つスタッフが DevTools で
--    cast_shifts を書き換え可能だった
create or replace function public.has_perm_shift_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_owner = true
  )
  or exists (
    select 1 from public.staff_permissions
    where staff_id = auth.uid()
      and permission = 'シフト.管理'
      and enabled = true
  );
$$;

drop policy if exists "shifts_admin_all" on public.cast_shifts;

-- 読み取り: admin 全員、cast は自分のみ（既存と同じ）
create policy "shifts_admin_read"
  on public.cast_shifts for select
  using (public.current_role() = 'admin');

-- 書き込み: シフト.管理 保持者のみ
create policy "shifts_perm_write"
  on public.cast_shifts for insert
  with check (public.has_perm_shift_manage());

create policy "shifts_perm_update"
  on public.cast_shifts for update
  using (public.has_perm_shift_manage())
  with check (public.has_perm_shift_manage());

create policy "shifts_perm_delete"
  on public.cast_shifts for delete
  using (public.has_perm_shift_manage());

-- ─── customer_visits: 書き込みを「売上.入力」権限保持者のみに ─────
-- キャストは自分の顧客のみ insert / update（cast_name 一致、既存 RLS で対応されてる）
-- ここでは admin/staff 側の書き込みを「売上.入力」に絞る
create or replace function public.has_perm_sales_input()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_owner = true
  )
  or exists (
    select 1 from public.staff_permissions
    where staff_id = auth.uid()
      and permission = '売上.入力'
      and enabled = true
  );
$$;

-- 既存の admin 全権限ポリシーを削除（あれば）
drop policy if exists "visits_admin_all" on public.customer_visits;

-- admin 読み取り（既存と同じ）
create policy "visits_admin_read"
  on public.customer_visits for select
  using (public.current_role() = 'admin');

-- admin 書き込みは「売上.入力」のみ
-- ※ キャストの書き込みは別ポリシー（customers の cast_name 一致）で対応される想定
--    キャスト用ポリシーが別に存在するならそのまま残ること
create policy "visits_admin_perm_write"
  on public.customer_visits for insert
  with check (
    public.current_role() != 'admin'
    OR public.has_perm_sales_input()
  );

create policy "visits_admin_perm_update"
  on public.customer_visits for update
  using (
    public.current_role() != 'admin'
    OR public.has_perm_sales_input()
  )
  with check (
    public.current_role() != 'admin'
    OR public.has_perm_sales_input()
  );

create policy "visits_admin_perm_delete"
  on public.customer_visits for delete
  using (
    public.current_role() != 'admin'
    OR public.has_perm_sales_input()
  );

-- ─── cast_extension_sales: 同様に「売上.入力」のみ ─────────────
drop policy if exists "ext_sales_admin_all" on public.cast_extension_sales;

create policy "ext_sales_admin_read"
  on public.cast_extension_sales for select
  using (public.current_role() = 'admin');

create policy "ext_sales_perm_write"
  on public.cast_extension_sales for insert
  with check (public.has_perm_sales_input());

create policy "ext_sales_perm_update"
  on public.cast_extension_sales for update
  using (public.has_perm_sales_input())
  with check (public.has_perm_sales_input());

create policy "ext_sales_perm_delete"
  on public.cast_extension_sales for delete
  using (public.has_perm_sales_input());
