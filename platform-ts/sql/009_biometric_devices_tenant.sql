ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE biometric_devices SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE biometric_devices ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS biometric_devices_tenant_idx ON biometric_devices (tenant_id);

