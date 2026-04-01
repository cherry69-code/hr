export type AuditQuery = {
  actor_user_id?: string;
  actor_email?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  before?: string;
  limit?: string;
};

