-- 顧客プロフィール写真ストレージ用のバケット作成 + RLS
--   バケット名: customer-photos
--   公開: いったん private、署名付きURLでフロントから読み込む方針

-- バケット作成（既にあればスキップ）
insert into storage.buckets (id, name, public)
values ('customer-photos', 'customer-photos', false)
on conflict (id) do nothing;

-- 認証済みユーザーは自由に SELECT/INSERT/UPDATE/DELETE できる
-- （admin / cast の業務利用前提。社外公開しない）
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'customer_photos_authenticated_all'
  ) then
    create policy "customer_photos_authenticated_all"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'customer-photos')
      with check (bucket_id = 'customer-photos');
  end if;
end $$;
