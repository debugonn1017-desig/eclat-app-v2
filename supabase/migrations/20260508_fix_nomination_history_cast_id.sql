-- nomination_history.cast_id の正規化
--   2026-05-08 までの実装では「操作したユーザーの ID」が cast_id に入っていた。
--   useCasts.getCastKPI は「担当キャストの ID」で集計するため、
--   管理者やスタッフが場内→本指名の書き換えを行ったレコードが
--   担当キャストの転換カウントから漏れていた。
--
--   このマイグレーションは、各履歴レコードについて
--     customers.cast_name → profiles.id を逆引きし、
--     ズレている場合のみ cast_id を担当キャストの ID に書き換える。
--
--   APIコード側もこの日付で修正済み（route.ts の cast_name 逆引き）。

UPDATE public.nomination_history nh
SET    cast_id = p.id
FROM   public.customers c
JOIN   public.profiles p
  ON   p.role = 'cast'
  AND  p.cast_name = c.cast_name
WHERE  nh.customer_id = c.id
  AND  nh.cast_id <> p.id
  AND  c.cast_name IS NOT NULL
  AND  c.cast_name <> '';

-- 完了チェック: 修正後に残った担当ズレ件数（基本0になるはず）
SELECT
  COUNT(*) AS remaining_mismatch
FROM   public.nomination_history nh
JOIN   public.customers c ON c.id = nh.customer_id
JOIN   public.profiles p
  ON   p.role = 'cast'
  AND  p.cast_name = c.cast_name
WHERE  nh.cast_id <> p.id
  AND  c.cast_name IS NOT NULL
  AND  c.cast_name <> '';
