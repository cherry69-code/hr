export type BiometricLogBody = {
  employee_code: string;
  timestamp: string;
  device_id: string;
  punch_type?: string;
  verification_type?: string;
  raw_payload?: unknown;
};

