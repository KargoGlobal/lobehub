import { lambdaClient } from '@/libs/trpc/client';

export type UsageReportMediaType = 'image' | 'video';
export type UsageReportOutcome = 'success' | 'error' | 'cancelled' | 'active';

export interface UsageReportFiltersInput {
  endAt: string;
  mediaType?: UsageReportMediaType;
  models?: string[];
  startAt: string;
  status?: UsageReportOutcome;
  userIds?: string[];
}

class UsageReportService {
  access = () => lambdaClient.usageReport.access.query();
  summary = (f: UsageReportFiltersInput) => lambdaClient.usageReport.summary.query(f);
  activeUsersByDay = (f: UsageReportFiltersInput) =>
    lambdaClient.usageReport.activeUsersByDay.query(f);
  generationsByDay = (f: UsageReportFiltersInput) =>
    lambdaClient.usageReport.generationsByDay.query(f);
  byUser = (f: UsageReportFiltersInput) => lambdaClient.usageReport.byUser.query(f);
  byModel = (f: UsageReportFiltersInput) => lambdaClient.usageReport.byModel.query(f);
  failureReasons = (f: UsageReportFiltersInput) => lambdaClient.usageReport.failureReasons.query(f);
  recentFailures = (f: UsageReportFiltersInput, limit = 50) =>
    lambdaClient.usageReport.recentFailures.query({ ...f, limit });
  filterOptions = (range: { endAt: string; startAt: string }) =>
    lambdaClient.usageReport.filterOptions.query(range);
}

export const usageReportService = new UsageReportService();
