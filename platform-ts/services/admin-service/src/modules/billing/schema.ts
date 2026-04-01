export type CreatePlanBody = {
  code: string;
  name: string;
  price_cents?: number;
  active?: boolean;
  limits?: Record<string, number>;
};

export type SetSubscriptionBody = {
  tenant_id: string;
  plan_code: string;
  status?: string;
};

export type UsageQuery = {
  date?: string;
};

export type UsageMonthQuery = {
  year?: string;
  month?: string;
};
