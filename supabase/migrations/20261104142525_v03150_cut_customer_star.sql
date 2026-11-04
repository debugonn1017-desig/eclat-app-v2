-- 切れたのお客様は⭐️対象から外す。月別目標・備考・過去の確認記録は保持する。
begin;
set local lock_timeout = '5s';
-- 先にDDL用ロックを確保し、再開RPCの顧客行ロックと後段のUPDATEの相互待ちを避ける。
lock table public.customers in access exclusive mode;

create or replace function public.enforce_cut_customer_star()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.customer_rank = '切れた' and new.is_starred is true then
    -- 既に切れたの顧客への再付与は失敗させる。再開RPCも新しい期間を作れない。
    -- 切れたへの遷移と、移行前から残る切れた⭐️の更新は同じ行更新で解除する。
    if tg_op = 'UPDATE' then
      if old.customer_rank = '切れた' and old.is_starred is not true then
        raise exception 'CUT_CUSTOMER_CANNOT_BE_STARRED' using errcode = '23514';
      end if;
    end if;
    new.is_starred := false;
  end if;
  return new;
end $$;
revoke all on function public.enforce_cut_customer_star() from public, anon, authenticated;
drop trigger if exists enforce_cut_customer_star on public.customers;
create trigger enforce_cut_customer_star before insert or update on public.customers
for each row execute function public.enforce_cut_customer_star();

-- UPDATE OF is_starredでは、ランクだけの更新をBEFOREトリガーが解除した場合を拾えない。
-- 既存関数の同値ガードを保ち、実際に⭐️が変わった場合だけ期間・終了ログを記録する。
drop trigger if exists capture_customer_star_cycle on public.customers;
create trigger capture_customer_star_cycle after insert or update on public.customers
for each row execute function public.capture_customer_star_cycle();

-- ランク由来・revision・履歴・月別目標・備考には触れない。終了処理は既存トリガーに任せる。
update public.customers set is_starred = false
where customer_rank = '切れた' and is_starred is true;

comment on function public.enforce_cut_customer_star() is
  '切れたへの遷移と既存の切れた⭐️を解除し、切れたのままの再付与を拒否する。ランク復帰時は自動再付与しない。';
commit;
