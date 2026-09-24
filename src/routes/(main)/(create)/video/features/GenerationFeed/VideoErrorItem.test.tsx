import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AsyncTaskErrorType, AsyncTaskStatus } from '@/types/asyncTask';
import { type Generation } from '@/types/generation';

import VideoErrorItem from './VideoErrorItem';

vi.mock('@lobehub/ui', async () => {
  const React = await import('react');

  return {
    Block: ({ children, onClick, style }: any) =>
      React.createElement('div', { onClick, style }, children),
    Center: ({ children }: any) => React.createElement('div', null, children),
    Icon: () => React.createElement('span', { 'data-testid': 'icon' }),
  };
});

vi.mock(
  '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ActionButtons',
  () => ({
    ActionButtons: () => null,
  }),
);

vi.mock('@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/styles', () => ({
  styles: { placeholderContainer: 'placeholder-container' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('VideoErrorItem', () => {
  const baseGeneration: Generation = {
    asyncTaskId: 'task-id',
    createdAt: new Date(),
    id: 'generation-id',
    task: { id: 'task-id', status: AsyncTaskStatus.Error },
  };

  it('shows the generic failure copy for a real error', () => {
    const generation: Generation = {
      ...baseGeneration,
      task: {
        ...baseGeneration.task,
        error: { body: { detail: 'boom' }, name: AsyncTaskErrorType.ServerError },
      },
    };

    render(<VideoErrorItem generation={generation} onCopyError={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('generation.status.failed')).toBeTruthy();
    expect(screen.queryByText('generation.status.cancelled')).toBeNull();
  });

  it('shows a Cancelled state instead of the generic failure copy when the task was cancelled', () => {
    const generation: Generation = {
      ...baseGeneration,
      task: {
        ...baseGeneration.task,
        error: {
          body: { detail: 'Generation cancelled' },
          name: AsyncTaskErrorType.TaskCancelled,
        },
      },
    };

    render(<VideoErrorItem generation={generation} onCopyError={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('generation.status.cancelled')).toBeTruthy();
    expect(screen.queryByText('generation.status.failed')).toBeNull();
    expect(screen.queryByText('Generation cancelled')).toBeNull();
  });
});
