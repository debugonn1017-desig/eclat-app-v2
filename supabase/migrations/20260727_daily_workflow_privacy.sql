-- v0.3.56-A: 日常業務UI + キャスト間データ分離の強化

-- 追いかけリストで「次に何をするか」を明示する。
alter table public.customer_follow_ups
  add column if not exists next_action text;

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_next_action_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_next_action_check
  check (
    next_action is null
    or next_action in ('LINE', '電話', '来店相談', '同伴相談', 'その他')
  );

comment on column public.customer_follow_ups.next_action is
  'キャストが次回行う予定の連絡方法・目的。自動実行はしない。';

-- 本番監査で見つかった旧ポリシーを閉じる。
-- allow_insert_for_all_users は担当キャストを問わず顧客を登録できるため、
-- customers_cast_insert（自分の cast_name のみ）に一本化する。
drop policy if exists "allow_insert_for_all_users" on public.customers;

-- customer_contacts / customer_bottles の旧 all_access は
-- USING=true / WITH CHECK=true で、認証済みキャスト間の分離がなかった。
-- 顧客テーブルの現在の担当を毎回照合し、担当変更後も旧キャストから見えないようにする。
alter table public.customer_contacts enable row level security;

drop policy if exists "contacts_all_access" on public.customer_contacts;
drop policy if exists "contacts_admin_all" on public.customer_contacts;
create policy "contacts_admin_all"
  on public.customer_contacts for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "contacts_cast_own" on public.customer_contacts;
create policy "contacts_cast_own"
  on public.customer_contacts for all
  using (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_contacts.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_contacts.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

alter table public.customer_bottles enable row level security;

drop policy if exists "bottles_all_access" on public.customer_bottles;
drop policy if exists "bottles_admin_all" on public.customer_bottles;
create policy "bottles_admin_all"
  on public.customer_bottles for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "bottles_cast_own" on public.customer_bottles;
create policy "bottles_cast_own"
  on public.customer_bottles for all
  using (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_bottles.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_bottles.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

-- 売上入力権限用の旧 admin ポリシーは current_role() != 'admin' を許可条件に
-- 含んでいたため、PostgreSQL の permissive policy（OR 合成）ではキャストの
-- 担当顧客制限を迂回できた。admin と cast をそれぞれ独立した条件に作り直す。
drop policy if exists "visits_admin_read" on public.customer_visits;
drop policy if exists "visits_admin_perm_write" on public.customer_visits;
drop policy if exists "visits_admin_perm_update" on public.customer_visits;
drop policy if exists "visits_admin_perm_delete" on public.customer_visits;
drop policy if exists "visits_cast_all" on public.customer_visits;

create policy "visits_admin_read"
  on public.customer_visits for select
  using (public.current_role() = 'admin');

create policy "visits_admin_perm_write"
  on public.customer_visits for insert
  with check (
    public.current_role() = 'admin'
    and public.has_perm_sales_input()
  );

create policy "visits_admin_perm_update"
  on public.customer_visits for update
  using (
    public.current_role() = 'admin'
    and public.has_perm_sales_input()
  )
  with check (
    public.current_role() = 'admin'
    and public.has_perm_sales_input()
  );

create policy "visits_admin_perm_delete"
  on public.customer_visits for delete
  using (
    public.current_role() = 'admin'
    and public.has_perm_sales_input()
  );

create policy "visits_cast_all"
  on public.customer_visits for all
  using (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_visits.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_visits.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

-- 来店予定は cast_id=self だけでなく、紐づく顧客も自分の担当であることを必須にする。
drop policy if exists "planned_visits_admin_all" on public.planned_visits;
create policy "planned_visits_admin_all"
  on public.planned_visits for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "planned_visits_cast_own" on public.planned_visits;
create policy "planned_visits_cast_own"
  on public.planned_visits for all
  using (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = planned_visits.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = planned_visits.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

-- 指名履歴も cast_id=self だけでは他キャストの customer_id を指定できるため、
-- 現在の担当顧客との一致を追加する。
drop policy if exists "nomination_history_cast_own" on public.nomination_history;
create policy "nomination_history_cast_own"
  on public.nomination_history for all
  using (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = nomination_history.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = nomination_history.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

-- customer_memos の旧ポリシーは profiles.display_name と customers.cast_name を
-- 比較していた。表示名が別キャストの源氏名と一致した場合の誤開示を避けるため、
-- すべて current_cast_name() に統一し、WITH CHECK も明示する。
drop policy if exists "memos_admin_all" on public.customer_memos;
create policy "memos_admin_all"
  on public.customer_memos for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "memos_cast_all" on public.customer_memos;
create policy "memos_cast_all"
  on public.customer_memos for all
  using (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_memos.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_memos.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

-- 旧 customer_photos_authenticated_all は認証済みユーザー全員にバケット全体を
-- 許可していた。フォルダ先頭の customer_id と担当顧客を照合し、
-- キャストは自分の顧客写真だけ、管理者は全件とする。
drop policy if exists "customer_photos_authenticated_all" on storage.objects;
drop policy if exists "customer_photos_admin_all" on storage.objects;
create policy "customer_photos_admin_all"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'customer-photos'
    and public.current_role() = 'admin'
  )
  with check (
    bucket_id = 'customer-photos'
    and public.current_role() = 'admin'
  );

drop policy if exists "customer_photos_cast_own" on storage.objects;
create policy "customer_photos_cast_own"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'customer-photos'
    and public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id::text = split_part(storage.objects.name, '/', 1)
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    bucket_id = 'customer-photos'
    and public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id::text = split_part(storage.objects.name, '/', 1)
        and c.cast_name = public.current_cast_name()
    )
  );
