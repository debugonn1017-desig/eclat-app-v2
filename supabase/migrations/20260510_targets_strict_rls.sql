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
