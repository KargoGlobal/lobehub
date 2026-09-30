import { describe, expect, it } from 'vitest';

import { isWorkspaceSlugCandidatePath } from './useWorkspaceUrlSync';

describe('isWorkspaceSlugCandidatePath', () => {
  it('treats a reserved root segment as not a workspace slug candidate', () => {
    expect(isWorkspaceSlugCandidatePath('/reports/usage')).toBe(false);
  });

  it('treats another reserved root segment as not a workspace slug candidate', () => {
    expect(isWorkspaceSlugCandidatePath('/image')).toBe(false);
  });

  it('treats an unreserved first segment as a workspace slug candidate', () => {
    expect(isWorkspaceSlugCandidatePath('/some-team/agent')).toBe(true);
  });

  it('treats the root path as not a workspace slug candidate', () => {
    expect(isWorkspaceSlugCandidatePath('/')).toBe(false);
  });
});
