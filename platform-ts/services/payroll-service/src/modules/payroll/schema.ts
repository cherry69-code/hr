export type RecalculateBody = {
  employee_id: string;
  month: number;
  year: number;
};

export type IncentiveBody = {
  revenue: number;
};

export type PayslipQuery = {
  year?: string;
  month?: string;
};

export type SimulationBody = {
  employee_id?: string;
  employee_ids?: string[];
  month: number;
  year: number;
};
