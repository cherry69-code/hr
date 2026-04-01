DO $$
DECLARE
  is_partitioned boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'attendance_days'
  ) INTO is_partitioned;

  CREATE OR REPLACE FUNCTION ensure_attendance_days_partition(p_date date)
  RETURNS void
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    m_start date;
    m_end date;
    p_name text;
  BEGIN
    m_start := date_trunc('month', p_date)::date;
    m_end := (m_start + interval '1 month')::date;
    p_name := format('attendance_days_%s', to_char(m_start, 'YYYY_MM'));

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF attendance_days FOR VALUES FROM (%L) TO (%L)',
      p_name,
      m_start,
      m_end
    );
  END;
  $fn$;

  IF NOT is_partitioned THEN
    IF to_regclass('public.attendance_days') IS NOT NULL THEN
      ALTER TABLE attendance_days RENAME TO attendance_days_old;
    END IF;

    CREATE TABLE IF NOT EXISTS attendance_days (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date date NOT NULL,
      check_in timestamptz,
      check_out timestamptz,
      working_minutes int NOT NULL DEFAULT 0,
      late_flag boolean NOT NULL DEFAULT false,
      late_minutes int NOT NULL DEFAULT 0,
      early_exit_minutes int NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'absent',
      source text NOT NULL DEFAULT 'biometric',
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (employee_id, date)
    ) PARTITION BY RANGE (date);

    CREATE INDEX IF NOT EXISTS attendance_days_date_idx ON attendance_days(date);
    CREATE INDEX IF NOT EXISTS attendance_days_emp_date_idx ON attendance_days(employee_id, date DESC);

    FOR i IN -3..12 LOOP
      PERFORM ensure_attendance_days_partition((date_trunc('month', now())::date + (i || ' months')::interval)::date);
    END LOOP;

    IF to_regclass('public.attendance_days_old') IS NOT NULL THEN
      INSERT INTO attendance_days (
        id, employee_id, date, check_in, check_out, working_minutes, late_flag, late_minutes, early_exit_minutes, status, source, updated_at
      )
      SELECT
        id, employee_id, date, check_in, check_out, working_minutes, late_flag, late_minutes, early_exit_minutes, status, source, updated_at
      FROM attendance_days_old
      ON CONFLICT (employee_id, date) DO UPDATE SET
        check_in = EXCLUDED.check_in,
        check_out = EXCLUDED.check_out,
        working_minutes = EXCLUDED.working_minutes,
        late_flag = EXCLUDED.late_flag,
        late_minutes = EXCLUDED.late_minutes,
        early_exit_minutes = EXCLUDED.early_exit_minutes,
        status = EXCLUDED.status,
        source = EXCLUDED.source,
        updated_at = now();

      DROP TABLE attendance_days_old;
    END IF;
  END IF;
END $$;

