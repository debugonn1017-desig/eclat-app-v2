-- cast_shiftsのstatusに「来客出勤」を追加
ALTER TABLE cast_shifts DROP CONSTRAINT IF EXISTS cast_shifts_status_check;
ALTER TABLE cast_shifts ADD CONSTRAINT cast_shifts_status_check CHECK (status IN ('出勤', '休み', '希望出勤', '希望休み', '来客出勤', '未定'));
