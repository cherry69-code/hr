CREATE TABLE IF NOT EXISTS security_settings (
  id int PRIMARY KEY DEFAULT 1,
  enable_rls boolean NOT NULL DEFAULT false
);

INSERT INTO security_settings (id, enable_rls)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees',
    'attendance_days',
    'salary_profiles',
    'payslips',
    'payroll_adjustments',
    'dashboard_daily_stats',
    'leaderboard_stats',
    'event_logs',
    'audit_logs',
    'feature_flags',
    'tenant_usage_daily',
    'biometric_devices',
    'biometric_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (tenant_id = app_tenant_id())', t);
    EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (tenant_id = app_tenant_id())', t);
    EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
    EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (tenant_id = app_tenant_id())', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM security_settings WHERE id = 1 AND enable_rls = true) THEN
    FOREACH t IN ARRAY ARRAY[
      'employees',
      'attendance_days',
      'salary_profiles',
      'payslips',
      'payroll_adjustments',
      'dashboard_daily_stats',
      'leaderboard_stats',
      'event_logs',
      'audit_logs',
      'feature_flags',
      'tenant_usage_daily',
      'biometric_devices',
      'biometric_logs'
    ]
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END IF;
END $$;
