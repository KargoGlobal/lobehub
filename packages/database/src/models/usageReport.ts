import { type SQL, sql } from 'drizzle-orm';

import type { LobeChatDatabase } from '../type';

export type UsageReportMediaType = 'image' | 'video';
export type UsageReportOutcome = 'success' | 'error' | 'cancelled' | 'active';

export interface UsageReportRange {
  /** exclusive */
  end: Date;
  /** inclusive */
  start: Date;
}

export interface UsageReportFilters extends UsageReportRange {
  mediaType?: UsageReportMediaType;
  models?: string[];
  status?: UsageReportOutcome;
  userIds?: string[];
}

export interface UsageReportSummaryCounts {
  active: number;
  activeUsers: number;
  cancelled: number;
  error: number;
  generatingUsers: number;
  generations: number;
  newSignups: number;
  success: number;
  totalUsers: number;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/**
 * One row per generation with the derived columns every report query needs.
 * Kept as a SQL fragment (not a view) so tests run on the migrated schema as-is.
 */
const generationRows = (range: UsageReportRange): SQL => sql`
  select
    g.id,
    g.created_at,
    b.user_id,
    b.model,
    b.provider,
    b.prompt,
    b.width,
    b.height,
    b.config,
    t.error,
    case
      when t.type = 'video_generation' then 'video'
      when t.type = 'image_generation' then 'image'
      when b.config ? 'duration' then 'video'
      else 'image'
    end as media_type,
    case
      when t.status = 'success' then 'success'
      when t.status = 'error' and t.error->>'name' = 'TaskCancelled' then 'cancelled'
      when t.status = 'error' then 'error'
      when t.status in ('pending', 'processing') then 'active'
      when t.id is null and g.asset is not null then 'success'
      else 'active'
    end as outcome
  from generations g
  join generation_batches b on b.id = g.generation_batch_id
  left join async_tasks t on t.id = g.async_task_id
  where g.created_at >= ${range.start.toISOString()}::timestamptz
    and g.created_at < ${range.end.toISOString()}::timestamptz
`;

/**
 * `auth_sessions.created_at` / `updated_at` are `timestamp without time zone`
 * (see `packages/database/src/schemas/betterAuth.ts`), unlike every other
 * timestamp column this query touches. Comparing a naive value straight
 * against a `timestamptz` bound lets Postgres apply the session's `TimeZone`
 * setting, silently shifting results on a non-UTC connection. `at time zone
 * 'UTC'` instead reinterprets the naive value explicitly as UTC wall-clock
 * time, matching how every other timestamp in this report is treated.
 * Exported so Task 4's `activeUsersByDay` can reuse the same expression.
 */
export const authSessionActivityAt: SQL = sql`(greatest(auth_sessions.created_at, coalesce(auth_sessions.updated_at, auth_sessions.created_at)) at time zone 'UTC')`;

const rowFilters = (f: UsageReportFilters): SQL => {
  const parts: SQL[] = [sql`true`];
  if (f.mediaType) parts.push(sql`r.media_type = ${f.mediaType}`);
  if (f.status) parts.push(sql`r.outcome = ${f.status}`);
  if (f.models && f.models.length > 0)
    parts.push(
      sql`r.model in (${sql.join(
        f.models.map((m) => sql`${m}`),
        sql`, `,
      )})`,
    );
  if (f.userIds && f.userIds.length > 0)
    parts.push(
      sql`r.user_id in (${sql.join(
        f.userIds.map((u) => sql`${u}`),
        sql`, `,
      )})`,
    );
  return sql.join(parts, sql` and `);
};

export class UsageReportModel {
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase) {
    this.db = db;
  }

  private async rows<T>(query: SQL): Promise<T[]> {
    const result = await this.db.execute(query);
    return (result as unknown as { rows: T[] }).rows;
  }

  summaryCounts = async (f: UsageReportFilters): Promise<UsageReportSummaryCounts> => {
    const start = f.start.toISOString();
    const end = f.end.toISOString();

    const [row] = await this.rows<Record<string, unknown>>(sql`
      with r as (${generationRows(f)}),
      fr as (select * from r where ${rowFilters(f)}),
      act as (
        select user_id from generation_batches
          where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz
        union
        select user_id from auth_sessions
          where ${authSessionActivityAt} >= ${start}::timestamptz
            and ${authSessionActivityAt} < ${end}::timestamptz
        union
        select id from users where last_active_at >= ${start}::timestamptz and last_active_at < ${end}::timestamptz
      )
      select
        (select count(*) from users) as total_users,
        (select count(distinct user_id) from act where user_id is not null) as active_users,
        (select count(distinct user_id) from fr) as generating_users,
        (select count(*) from users where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz) as new_signups,
        (select count(*) from fr) as generations,
        (select count(*) from fr where outcome = 'success') as success,
        (select count(*) from fr where outcome = 'error') as error,
        (select count(*) from fr where outcome = 'cancelled') as cancelled,
        (select count(*) from fr where outcome = 'active') as active
    `);

    return {
      active: num(row.active),
      activeUsers: num(row.active_users),
      cancelled: num(row.cancelled),
      error: num(row.error),
      generatingUsers: num(row.generating_users),
      generations: num(row.generations),
      newSignups: num(row.new_signups),
      success: num(row.success),
      totalUsers: num(row.total_users),
    };
  };
}
