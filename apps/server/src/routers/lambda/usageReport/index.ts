import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { UserModel } from '@/database/models/user';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { UsageReportService } from '@/server/services/usageReport';

import { isUsageReportAdmin } from './allowlist';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const rangeSchema = z.object({ endAt: isoDay, startAt: isoDay });

export const usageReportFiltersSchema = rangeSchema.extend({
  mediaType: z.enum(['image', 'video']).optional(),
  models: z.array(z.string()).max(50).optional(),
  status: z.enum(['success', 'error', 'cancelled', 'active']).optional(),
  userIds: z.array(z.string()).max(200).optional(),
});

type FiltersInput = z.infer<typeof usageReportFiltersSchema>;

const toRange = ({ startAt, endAt }: z.infer<typeof rangeSchema>) => {
  const start = new Date(`${startAt}T00:00:00.000Z`);
  const end = new Date(new Date(`${endAt}T00:00:00.000Z`).getTime() + DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'invalid date range' });
  }
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `range exceeds ${MAX_RANGE_DAYS} days` });
  }
  return { end, start };
};

const toFilters = ({ startAt, endAt, ...rest }: FiltersInput) => ({
  ...toRange({ endAt, startAt }),
  ...rest,
});

const withEmail = authedProcedure.use(serverDatabase).use(async ({ ctx, next }) => {
  const user = await UserModel.findById(ctx.serverDB, ctx.userId);
  return next({ ctx: { allowed: isUsageReportAdmin(user?.email) } });
});

const adminProcedure = withEmail.use(async ({ ctx, next }) => {
  if (!ctx.allowed)
    throw new TRPCError({ code: 'FORBIDDEN', message: 'usage report access denied' });
  return next({ ctx: { usageReportService: new UsageReportService(ctx.serverDB) } });
});

export const usageReportRouter = router({
  access: withEmail.query(async ({ ctx }) => ({ allowed: ctx.allowed })),

  activeUsersByDay: adminProcedure
    .input(usageReportFiltersSchema)
    .query(({ ctx, input }) => ctx.usageReportService.activeUsersByDay(toFilters(input))),

  byModel: adminProcedure
    .input(usageReportFiltersSchema)
    .query(({ ctx, input }) => ctx.usageReportService.byModel(toFilters(input))),

  byUser: adminProcedure
    .input(usageReportFiltersSchema)
    .query(({ ctx, input }) => ctx.usageReportService.byUser(toFilters(input))),

  failureReasons: adminProcedure
    .input(usageReportFiltersSchema)
    .query(({ ctx, input }) => ctx.usageReportService.failureReasons(toFilters(input))),

  filterOptions: adminProcedure
    .input(rangeSchema)
    .query(({ ctx, input }) => ctx.usageReportService.filterOptions(toRange(input))),

  generationsByDay: adminProcedure
    .input(usageReportFiltersSchema)
    .query(({ ctx, input }) => ctx.usageReportService.generationsByDay(toFilters(input))),

  recentFailures: adminProcedure
    .input(usageReportFiltersSchema.extend({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(({ ctx, input }) => {
      const { limit, ...filters } = input;
      return ctx.usageReportService.recentFailures(toFilters(filters), limit);
    }),

  summary: adminProcedure
    .input(usageReportFiltersSchema)
    .query(({ ctx, input }) => ctx.usageReportService.summary(toFilters(input))),
});
