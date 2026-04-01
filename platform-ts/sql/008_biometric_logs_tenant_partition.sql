DO $$
DECLARE
  is_partitioned boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'biometric_logs'
  ) INTO is_partitioned;

  CREATE OR REPLACE FUNCTION ensure_biometric_logs_partition(p_ts timestamptz)
  RETURNS void
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    m_start timestamptz;
    m_end timestamptz;
    p_name text;
  BEGIN
    m_start := date_trunc('month', p_ts);
    m_end := m_start + interval '1 month';
    p_name := format('biometric_logs_%s', to_char(m_start, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF biometric_logs FOR VALUES FROM (%L) TO (%L)',
      p_name,
      m_start,
      m_end
    );
  END;
  $fn$;

  IF is_partitioned THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='biometric_logs' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE biometric_logs RENAME TO biometric_logs_old;
      is_partitioned := false;
    END IF;
  END IF;

  IF NOT is_partitioned THEN
    IF to_regclass('public.biometric_logs') IS NOT NULL THEN
      ALTER TABLE biometric_logs RENAME TO biometric_logs_old;
    END IF;

    CREATE TABLE biometric_logs (
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      employee_code text NOT NULL,
      punch_time timestamptz NOT NULL,
      device_id text,
      punch_type text,
      verification_type text,
      source text NOT NULL DEFAULT 'etime',
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, employee_code, punch_time)
    ) PARTITION BY RANGE (punch_time);

    CREATE INDEX biometric_logs_time_idx ON biometric_logs(punch_time DESC);
    CREATE INDEX biometric_logs_tenant_time_idx ON biometric_logs(tenant_id, punch_time DESC);

    FOR i IN -3..12 LOOP
      PERFORM ensure_biometric_logs_partition(date_trunc('month', now()) + (i || ' months')::interval);
    END LOOP;

    IF to_regclass('public.biometric_logs_old') IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='biometric_logs_old' AND column_name='tenant_id'
      ) THEN
        EXECUTE $q$
          INSERT INTO biometric_logs (
            tenant_id, id, employee_code, punch_time, device_id, punch_type, verification_type, source, raw_payload, created_at
          )
          SELECT
            tenant_id,
            id,
            employee_code,
            punch_time,
            device_id,
            punch_type,
            verification_type,
            source,
            raw_payload,
            created_at
          FROM biometric_logs_old
          ON CONFLICT (tenant_id, employee_code, punch_time) DO NOTHING
        $q$;
      ELSE
        EXECUTE $q$
          INSERT INTO biometric_logs (
            tenant_id, id, employee_code, punch_time, device_id, punch_type, verification_type, source, raw_payload, created_at
          )
          SELECT
            '00000000-0000-0000-0000-000000000001'::uuid,
            id,
            employee_code,
            punch_time,
            device_id,
            punch_type,
            verification_type,
            source,
            raw_payload,
            created_at
          FROM biometric_logs_old
          ON CONFLICT (tenant_id, employee_code, punch_time) DO NOTHING
        $q$;
      END IF;

      DROP TABLE biometric_logs_old;
    END IF;
  END IF;
END $$;
