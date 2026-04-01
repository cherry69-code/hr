CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_user_roles (
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  joining_date date,
  department_id uuid REFERENCES departments(id),
  team_id uuid REFERENCES teams(id),
  manager_id uuid REFERENCES employees(id),
  level text NOT NULL DEFAULT 'n0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_manager_idx ON employees(manager_id);
CREATE INDEX IF NOT EXISTS employees_department_idx ON employees(department_id);
CREATE INDEX IF NOT EXISTS employees_team_idx ON employees(team_id);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  grace_minutes int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  radius_meters int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS locations_active_idx ON locations(active);

CREATE TABLE IF NOT EXISTS biometric_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  sensor_id text,
  location_id uuid REFERENCES locations(id),
  token_hash text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS biometric_devices_sensor_idx ON biometric_devices(sensor_id);

CREATE TABLE IF NOT EXISTS biometric_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  punch_time timestamptz NOT NULL,
  device_id text,
  punch_type text,
  verification_type text,
  source text NOT NULL DEFAULT 'etime',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_code, punch_time)
) PARTITION BY RANGE (punch_time);

CREATE INDEX IF NOT EXISTS biometric_logs_time_idx ON biometric_logs(punch_time DESC);

DO $$
DECLARE
  m date;
  m_start timestamptz;
  m_end timestamptz;
  part_name text;
BEGIN
  m := date_trunc('month', now())::date;
  FOR i IN 0..12 LOOP
    m_start := (m + (i || ' months')::interval);
    m_end := (m + ((i+1) || ' months')::interval);
    part_name := format('biometric_logs_%s', to_char(m_start, 'YYYY_MM'));
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF biometric_logs FOR VALUES FROM (%L) TO (%L)', part_name, m_start, m_end);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS attendance_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_days_date_idx ON attendance_days(date);
CREATE INDEX IF NOT EXISTS attendance_days_emp_date_idx ON attendance_days(employee_id, date DESC);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  old_status text,
  new_status text NOT NULL,
  reason text,
  requested_by uuid REFERENCES auth_users(id),
  approved_by uuid REFERENCES auth_users(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_corrections_emp_date_idx ON attendance_corrections(employee_id, date DESC);

CREATE TABLE IF NOT EXISTS leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  type text NOT NULL DEFAULT 'annual',
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leaves_emp_range_idx ON leaves(employee_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS salary_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  salary numeric(14,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date
);

CREATE INDEX IF NOT EXISTS salary_profiles_emp_idx ON salary_profiles(employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month int NOT NULL,
  year int NOT NULL,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month int NOT NULL,
  year int NOT NULL,
  gross numeric(14,2) NOT NULL DEFAULT 0,
  deductions numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS payslips_month_idx ON payslips(year DESC, month DESC);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month int NOT NULL,
  year int NOT NULL,
  type text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_adjustments_emp_month_idx ON payroll_adjustments(employee_id, year DESC, month DESC);

CREATE TABLE IF NOT EXISTS incentive_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slabs jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incentive_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month int NOT NULL,
  year int NOT NULL,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  incentive_amount numeric(14,2) NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incentive_calcs_emp_month_idx ON incentive_calculations(employee_id, year DESC, month DESC);

