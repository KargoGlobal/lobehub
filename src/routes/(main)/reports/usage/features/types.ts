import type { usageReportService } from '@/services/usageReport';

type Result<K extends keyof typeof usageReportService> = Awaited<
  ReturnType<(typeof usageReportService)[K]>
>;

export type Summary = Result<'summary'>;
export type ActiveDayRow = Result<'activeUsersByDay'>[number];
export type GenerationsByDay = Result<'generationsByDay'>;
export type UserRow = Result<'byUser'>[number];
export type ModelStat = Result<'byModel'>[number];
export type FailureReasonRow = Result<'failureReasons'>[number];
export type RecentFailureRow = Result<'recentFailures'>[number];
export type FilterOptions = Result<'filterOptions'>;
