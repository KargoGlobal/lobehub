import {
  type UsageReportActiveDayRow,
  type UsageReportFailureReasonRow,
  type UsageReportFilterOptions,
  type UsageReportFilters,
  UsageReportModel,
  type UsageReportModelRow,
  type UsageReportRange,
  type UsageReportRecentFailureRow,
  type UsageReportSummaryCounts,
  type UsageReportUserRow,
} from '@/database/models/usageReport';
import type { LobeChatDatabase } from '@/database/type';

import { buildPricingIndex, estimateCost, type PricingIndex } from './pricing';

export interface UsageReportSummary extends UsageReportSummaryCounts {
  estimatedCostUsd: number;
  successRate: number | null;
  unpricedGenerations: number;
}

export interface UsageReportDayPoint {
  active: number;
  cancelled: number;
  day: string;
  error: number;
  success: number;
}

export interface UsageReportGenerationsByDay {
  all: UsageReportDayPoint[];
  image: UsageReportDayPoint[];
  video: UsageReportDayPoint[];
}

export interface UsageReportUser extends UsageReportUserRow {
  estimatedCostUsd: number;
  failRate: number | null;
}

export interface UsageReportModelStat extends UsageReportModelRow {
  estimatedCostUsd: number;
  failRate: number | null;
}

const DAY_MS = 86_400_000;

export const eachUtcDay = (range: UsageReportRange): string[] => {
  const days: string[] = [];
  for (
    let t = Date.UTC(
      range.start.getUTCFullYear(),
      range.start.getUTCMonth(),
      range.start.getUTCDate(),
    );
    t < range.end.getTime();
    t += DAY_MS
  ) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
};

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);

const emptyPoint = (day: string): UsageReportDayPoint => ({
  active: 0,
  cancelled: 0,
  day,
  error: 0,
  success: 0,
});

export class UsageReportService {
  private model: UsageReportModel;
  private pricing: PricingIndex;

  constructor(db: LobeChatDatabase, pricing: PricingIndex = buildPricingIndex()) {
    this.model = new UsageReportModel(db);
    this.pricing = pricing;
  }

  summary = async (f: UsageReportFilters): Promise<UsageReportSummary> => {
    const [counts, cost] = await Promise.all([
      this.model.summaryCounts(f),
      this.model.costInputs(f),
    ]);
    const { usd, unpricedGenerations } = estimateCost(cost, this.pricing);
    return {
      ...counts,
      estimatedCostUsd: usd,
      successRate: rate(counts.success, counts.success + counts.error),
      unpricedGenerations,
    };
  };

  activeUsersByDay = async (f: UsageReportFilters): Promise<UsageReportActiveDayRow[]> => {
    const rows = await this.model.activeUsersByDay(f);
    const byDay = new Map(rows.map((r) => [r.day, r]));
    return eachUtcDay(f).map(
      (day) => byDay.get(day) ?? { activeUsers: 0, day, generatingUsers: 0 },
    );
  };

  generationsByDay = async (f: UsageReportFilters): Promise<UsageReportGenerationsByDay> => {
    const rows = await this.model.generationsByDay(f);
    const days = eachUtcDay(f);
    const series = {
      all: new Map<string, UsageReportDayPoint>(),
      image: new Map<string, UsageReportDayPoint>(),
      video: new Map<string, UsageReportDayPoint>(),
    };
    for (const key of Object.keys(series) as (keyof typeof series)[]) {
      for (const day of days) series[key].set(day, emptyPoint(day));
    }
    for (const r of rows) {
      const targets = [series.all.get(r.day), series[r.mediaType].get(r.day)];
      for (const point of targets) if (point) point[r.outcome] += r.count;
    }
    return {
      all: [...series.all.values()],
      image: [...series.image.values()],
      video: [...series.video.values()],
    };
  };

  byUser = async (f: UsageReportFilters): Promise<UsageReportUser[]> => {
    const [users, cost] = await Promise.all([this.model.byUser(f), this.model.costInputs(f)]);
    return users.map((u) => ({
      ...u,
      estimatedCostUsd: estimateCost(
        cost.filter((c) => c.userId === u.userId),
        this.pricing,
      ).usd,
      failRate: rate(u.error, u.success + u.error),
    }));
  };

  byModel = async (f: UsageReportFilters): Promise<UsageReportModelStat[]> => {
    const [models, cost] = await Promise.all([this.model.byModel(f), this.model.costInputs(f)]);
    return models.map((m) => ({
      ...m,
      estimatedCostUsd: estimateCost(
        cost.filter((c) => c.model === m.model && c.mediaType === m.mediaType),
        this.pricing,
      ).usd,
      failRate: rate(m.error, m.success + m.error),
    }));
  };

  failureReasons = (f: UsageReportFilters): Promise<UsageReportFailureReasonRow[]> =>
    this.model.failureReasons(f);

  recentFailures = (
    f: UsageReportFilters,
    limit?: number,
  ): Promise<UsageReportRecentFailureRow[]> => this.model.recentFailures(f, limit);

  filterOptions = (range: UsageReportRange): Promise<UsageReportFilterOptions> =>
    this.model.filterOptions(range);
}
