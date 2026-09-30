import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';

const access = vi.fn();
vi.mock('@/services/usageReport', () => ({ usageReportService: { access } }));

const { useUsageReportAccess } = await import('./useUsageReportAccess');

// `useClientDataSWR` reads the module-level SWR cache by default, which
// would leak the first test's resolved `{ allowed: true }` into the second
// test's mount (same key, same process). Give each render its own cache so
// the two scenarios below stay isolated, the way `cacheProvider.integration.
// test.tsx` isolates sessions with a fresh provider `Map`.
const isolatedCache =
  () =>
  ({ children }: PropsWithChildren) =>
    createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('useUsageReportAccess', () => {
  it('reports allowed from the service', async () => {
    access.mockResolvedValue({ allowed: true });
    const { result } = renderHook(() => useUsageReportAccess(), { wrapper: isolatedCache() });
    await waitFor(() => expect(result.current.allowed).toBe(true));
  });

  it('defaults to false while loading or on error', async () => {
    access.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useUsageReportAccess(), { wrapper: isolatedCache() });
    expect(result.current.allowed).toBe(false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.allowed).toBe(false);
  });
});
