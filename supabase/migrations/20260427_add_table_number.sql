-- customer_visitsに卓番カラムを追加
ALTER TABLE customer_visits ADD COLUMN IF NOT EXISTS table_number TEXT DEFAULT '';
