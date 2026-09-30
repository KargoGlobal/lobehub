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

export interface UsageReportDayOutcomeRow {
  count: number;
  day: string;
  mediaType: UsageReportMediaType;
  outcome: UsageReportOutcome;
}

export interface UsageReportActiveDayRow {
  activeUsers: number;
  day: string;
  generatingUsers: number;
}

export interface UsageReportUserRow {
  active: number;
  avatar: string | null;
  cancelled: number;
  createdAt: string;
  email: string | null;
  error: number;
  generations: number;
  images: number;
  lastActiveAt: string;
  name: string;
  success: number;
  topModel: string | null;
  userId: string;
  videos: number;
}

export interface UsageReportModelRow {
  error: number;
  generations: number;
  mediaType: UsageReportMediaType;
  model: string;
  provider: string;
  success: number;
}

export interface UsageReportCostInputRow {
  mediaType: UsageReportMediaType;
  megapixels: number;
  model: string;
  seconds: number;
  successCount: number;
  userId: string;
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

  generationsByDay = async (f: UsageReportFilters): Promise<UsageReportDayOutcomeRow[]> => {
    const rows = await this.rows<Record<string, unknown>>(sql`
      with r as (${generationRows(f)})
      select to_char(date_trunc('day', r.created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
             r.media_type, r.outcome, count(*) as count
      from r where ${rowFilters(f)}
      group by 1, 2, 3
      order by 1
    `);
    return rows.map((r) => ({
      count: num(r.count),
      day: String(r.day),
      mediaType: r.media_type as UsageReportMediaType,
      outcome: r.outcome as UsageReportOutcome,
    }));
  };

  activeUsersByDay = async (f: UsageReportFilters): Promise<UsageReportActiveDayRow[]> => {
    const start = f.start.toISOString();
    const end = f.end.toISOString();
    const rows = await this.rows<Record<string, unknown>>(sql`
      with r as (${generationRows(f)}),
      gen as (
        select to_char(date_trunc('day', r.created_at at time zone 'UTC'), 'YYYY-MM-DD') as day, r.user_id
        from r where ${rowFilters(f)}
      ),
      act as (
        select day, user_id from gen
        union
        select to_char(date_trunc('day', ${authSessionActivityAt}), 'YYYY-MM-DD'), auth_sessions.user_id
          from auth_sessions
          where ${authSessionActivityAt} >= ${start}::timestamptz
            and ${authSessionActivityAt} < ${end}::timestamptz
        union
        select to_char(date_trunc('day', last_active_at at time zone 'UTC'), 'YYYY-MM-DD'), id
          from users where last_active_at >= ${start}::timestamptz and last_active_at < ${end}::timestamptz
      )
      select a.day,
             count(distinct a.user_id) as active_users,
             (select count(distinct g.user_id) from gen g where g.day = a.day) as generating_users
      from act a
      group by a.day
      order by a.day
    `);
    return rows.map((r) => ({
      activeUsers: num(r.active_users),
      day: String(r.day),
      generatingUsers: num(r.generating_users),
    }));
  };

  byUser = async (f: UsageReportFilters): Promise<UsageReportUserRow[]> => {
    const rows = await this.rows<Record<string, unknown>>(sql`
      with r as (${generationRows(f)}),
      fr as (select * from r where ${rowFilters(f)}),
      top_model as (
        select distinct on (user_id) user_id, model
        from (select user_id, model, count(*) as n from fr group by 1, 2) m
        order by user_id, n desc, model
      )
      select u.id as user_id, u.email, u.full_name, u.username, u.avatar, u.created_at, u.last_active_at,
             count(*) as generations,
             count(*) filter (where fr.media_type = 'image') as images,
             count(*) filter (where fr.media_type = 'video') as videos,
             count(*) filter (where fr.outcome = 'success') as success,
             count(*) filter (where fr.outcome = 'error') as error,
             count(*) filter (where fr.outcome = 'cancelled') as cancelled,
             count(*) filter (where fr.outcome = 'active') as active,
             tm.model as top_model
      from fr
      join users u on u.id = fr.user_id
      left join top_model tm on tm.user_id = fr.user_id
      group by u.id, u.email, u.full_name, u.username, u.avatar, u.created_at, u.last_active_at, tm.model
      order by generations desc, u.email
    `);
    return rows.map((r) => ({
      active: num(r.active),
      avatar: (r.avatar as string | null) ?? null,
      cancelled: num(r.cancelled),
      createdAt: new Date(r.created_at as string).toISOString(),
      email: (r.email as string | null) ?? null,
      error: num(r.error),
      generations: num(r.generations),
      images: num(r.images),
      lastActiveAt: new Date(r.last_active_at as string).toISOString(),
      name: String(r.full_name || r.username || r.email || r.user_id),
      success: num(r.success),
      topModel: (r.top_model as string | null) ?? null,
      userId: String(r.user_id),
      videos: num(r.videos),
    }));
  };

  byModel = async (f: UsageReportFilters): Promise<UsageReportModelRow[]> => {
    const rows = await this.rows<Record<string, unknown>>(sql`
      with r as (${generationRows(f)})
      select r.model, r.provider, r.media_type,
             count(*) as generations,
             count(*) filter (where r.outcome = 'success') as success,
             count(*) filter (where r.outcome = 'error') as error
      from r where ${rowFilters(f)}
      group by 1, 2, 3
      order by generations desc, r.model
    `);
    return rows.map((r) => ({
      error: num(r.error),
      generations: num(r.generations),
      mediaType: r.media_type as UsageReportMediaType,
      model: String(r.model),
      provider: String(r.provider),
      success: num(r.success),
    }));
  };

  costInputs = async (f: UsageReportFilters): Promise<UsageReportCostInputRow[]> => {
    const rows = await this.rows<Record<string, unknown>>(sql`
      with r as (${generationRows(f)})
      select r.user_id, r.model, r.media_type,
             count(*) as success_count,
             coalesce(sum(case when r.media_type = 'image' and r.width is not null and r.height is not null
                               then (r.width::numeric * r.height::numeric) / 1000000 else 0 end), 0) as megapixels,
             coalesce(sum(case when r.media_type = 'video'
                               then coalesce((r.config->>'duration')::numeric, 0) else 0 end), 0) as seconds
      from r where ${rowFilters(f)} and r.outcome = 'success'
      group by 1, 2, 3
    `);
    return rows.map((r) => ({
      megapixels: Number(r.megapixels),
      mediaType: r.media_type as UsageReportMediaType,
      model: String(r.model),
      seconds: Number(r.seconds),
      successCount: num(r.success_count),
      userId: String(r.user_id),
    }));
  };
}
