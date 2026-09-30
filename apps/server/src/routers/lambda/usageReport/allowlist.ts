export const parseUsageReportAdmins = (raw: string | undefined): Set<string> =>
  new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

export const isUsageReportAdmin = (
  email: string | null | undefined,
  raw: string | undefined = process.env.USAGE_REPORT_ADMINS,
): boolean => {
  if (!email) return false;
  return parseUsageReportAdmins(raw).has(email.trim().toLowerCase());
};
