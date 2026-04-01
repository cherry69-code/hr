CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'default') THEN
    INSERT INTO tenants (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default');
  END IF;
END $$;

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE auth_users SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE auth_users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE auth_users DROP CONSTRAINT IF EXISTS auth_users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_tenant_email_uq ON auth_users (tenant_id, email);
CREATE INDEX IF NOT EXISTS auth_users_tenant_idx ON auth_users (tenant_id);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE employees SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE employees ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_code_uq ON employees (tenant_id, employee_code);
CREATE INDEX IF NOT EXISTS employees_tenant_idx ON employees (tenant_id);

ALTER TABLE attendance_days ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE attendance_days SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE attendance_days ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_days_tenant_date_idx ON attendance_days (tenant_id, date DESC);

ALTER TABLE salary_profiles ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE salary_profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE salary_profiles ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS salary_profiles_tenant_idx ON salary_profiles (tenant_id);

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE payslips SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE payslips ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payslips DROP CONSTRAINT IF EXISTS payslips_employee_id_year_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS payslips_tenant_emp_month_uq ON payslips (tenant_id, employee_id, year, month);
CREATE INDEX IF NOT EXISTS payslips_tenant_month_idx ON payslips (tenant_id, year DESC, month DESC);

ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE payroll_adjustments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE payroll_adjustments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS payroll_adjustments_tenant_idx ON payroll_adjustments (tenant_id);

DO $$
BEGIN
  IF to_regclass('public.dashboard_daily_stats') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dashboard_daily_stats' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE dashboard_daily_stats RENAME TO dashboard_daily_stats_old;
    END IF;
  END IF;

  IF to_regclass('public.dashboard_daily_stats') IS NULL THEN
    CREATE TABLE dashboard_daily_stats (
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      date date NOT NULL,
      total_employees int NOT NULL DEFAULT 0,
      present_count int NOT NULL DEFAULT 0,
      half_day_count int NOT NULL DEFAULT 0,
      absent_count int NOT NULL DEFAULT 0,
      lop_count int NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, date)
    );
    CREATE INDEX dashboard_daily_stats_tenant_date_idx ON dashboard_daily_stats (tenant_id, date DESC);
  END IF;

  IF to_regclass('public.dashboard_daily_stats_old') IS NOT NULL THEN
    INSERT INTO dashboard_daily_stats (tenant_id, date, total_employees, present_count, half_day_count, absent_count, lop_count, updated_at)
    SELECT '00000000-0000-0000-0000-000000000001', date, total_employees, present_count, half_day_count, absent_count, lop_count, updated_at
    FROM dashboard_daily_stats_old
    ON CONFLICT (tenant_id, date) DO UPDATE SET
      total_employees = EXCLUDED.total_employees,
      present_count = EXCLUDED.present_count,
      half_day_count = EXCLUDED.half_day_count,
      absent_count = EXCLUDED.absent_count,
      lop_count = EXCLUDED.lop_count,
      updated_at = EXCLUDED.updated_at;
    DROP TABLE dashboard_daily_stats_old;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.leaderboard_stats') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='leaderboard_stats' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE leaderboard_stats RENAME TO leaderboard_stats_old;
    END IF;
  END IF;

  IF to_regclass('public.leaderboard_stats') IS NULL THEN
    CREATE TABLE leaderboard_stats (
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      year int NOT NULL,
      month int NOT NULL,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      score numeric(14, 2) NOT NULL DEFAULT 0,
      rank int NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, year, month, employee_id)
    );
    CREATE INDEX leaderboard_stats_tenant_rank_idx ON leaderboard_stats (tenant_id, year DESC, month DESC, rank ASC);
  END IF;

  IF to_regclass('public.leaderboard_stats_old') IS NOT NULL THEN
    INSERT INTO leaderboard_stats (tenant_id, year, month, employee_id, score, rank, updated_at)
    SELECT '00000000-0000-0000-0000-000000000001', year, month, employee_id, score, rank, updated_at
    FROM leaderboard_stats_old
    ON CONFLICT (tenant_id, year, month, employee_id) DO UPDATE SET
      score = EXCLUDED.score,
      rank = EXCLUDED.rank,
      updated_at = EXCLUDED.updated_at;
    DROP TABLE leaderboard_stats_old;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.event_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='event_logs' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE event_logs RENAME TO event_logs_old;
    END IF;
  END IF;

  IF to_regclass('public.event_logs') IS NULL THEN
    CREATE TABLE event_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      service text NOT NULL,
      type text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX event_logs_created_id_idx ON event_logs (created_at DESC, id DESC);
    CREATE INDEX event_logs_type_idx ON event_logs (type);
    CREATE INDEX event_logs_service_created_idx ON event_logs (service, created_at DESC);
    CREATE INDEX event_logs_tenant_created_idx ON event_logs (tenant_id, created_at DESC);
  END IF;

  IF to_regclass('public.event_logs_old') IS NOT NULL THEN
    INSERT INTO event_logs (id, tenant_id, service, type, payload, created_at)
    SELECT id, '00000000-0000-0000-0000-000000000001', service, type, payload, created_at
    FROM event_logs_old
    ON CONFLICT (id) DO NOTHING;
    DROP TABLE event_logs_old;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='audit_logs' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE audit_logs RENAME TO audit_logs_old;
    END IF;
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      actor_user_id uuid,
      actor_email text,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
    CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
    CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
    CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);
    CREATE INDEX audit_logs_tenant_created_idx ON audit_logs (tenant_id, created_at DESC);
  END IF;

  IF to_regclass('public.audit_logs_old') IS NOT NULL THEN
    INSERT INTO audit_logs (id, tenant_id, actor_user_id, actor_email, action, entity_type, entity_id, meta, created_at)
    SELECT id, '00000000-0000-0000-0000-000000000001', actor_user_id, actor_email, action, entity_type, entity_id, meta, created_at
    FROM audit_logs_old
    ON CONFLICT (id) DO NOTHING;
    DROP TABLE audit_logs_old;
  END IF;
END $$;

