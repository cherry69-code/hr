export type DlqQueuesResponse = {
  name: string;
  original: string;
  counts: Record<string, number>;
};

export type DlqListQuery = {
  status?: string;
  page?: string;
  limit?: string;
};

