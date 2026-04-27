-- customer_visitsに初来店フラグを追加
ALTER TABLE customer_visits ADD COLUMN IF NOT EXISTS is_first_visit BOOLEAN DEFAULT false;
