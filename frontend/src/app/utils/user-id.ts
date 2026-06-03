/** MongoDB ObjectId string for API routes — never the HR employee code (e.g. NINJA0017). */
export function resolveMongoUserId(user: any): string {
  if (!user) return '';
  const candidates = [user._id, user.id, user.uid, user.userId];
  for (const raw of candidates) {
    const id = String(raw || '').trim();
    if (/^[a-fA-F0-9]{24}$/.test(id)) return id;
  }
  return '';
}

export function resolveEmployeeCode(user: any): string {
  return String(user?.employeeId || user?.employeeCode || user?.employee_code || '').trim();
}
