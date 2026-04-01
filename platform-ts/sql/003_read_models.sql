CREATE TABLE IF NOT EXISTS dashboard_daily_stats (
  date date PRIMARY KEY,
  total_employees int NOT NULL DEFAULT 0,
  present_count int NOT NULL DEFAULT 0,
  half_day_count int NOT NULL DEFAULT 0,
  absent_count int NOT NULL DEFAULT 0,
  lop_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_daily_stats_date_idx ON dashboard_daily_stats (date DESC);

CREATE TABLE IF NOT EXISTS leaderboard_stats (
  year int NOT NULL,
  month int NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  score numeric(14, 2) NOT NULL DEFAULT 0,
  rank int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month, employee_id)
);

CREATE INDEX IF NOT EXISTS leaderboard_stats_rank_idx ON leaderboard_stats (year DESC, month DESC, rank ASC);

