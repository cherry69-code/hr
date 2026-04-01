export type CreateEmployeeBody = {
  employee_code: string;
  full_name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  team_id?: string;
  manager_id?: string;
  level?: string;
  joining_date?: string;
};

export type UpdateEmployeeBody = Partial<CreateEmployeeBody>;

