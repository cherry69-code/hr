export type ReindexBody = {
  index: 'employees' | 'event_logs' | 'audit_logs';
  limit?: number;
};

