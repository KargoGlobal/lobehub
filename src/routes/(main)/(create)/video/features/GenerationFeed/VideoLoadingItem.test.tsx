import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AsyncTaskStatus } from '@/types/asyncTask';
import type { Generation } from '@/types/generation';

import VideoLoadingItem from './VideoLoadingItem';

vi.mock('@lobehub/ui', async () => {
  const React = await import('react');

  return {
    Block: ({ children, ...rest }: any) => React.createElement('div', rest, children),
    Center: ({ children, ...rest }: any) => React.createElement('div', rest, children),
  };
});

vi.mock('antd', () => ({
  Progress: ({ percent }: any) => <div data-testid="progress">{percent}</div>,
  Spin: () => <div data-testid="spin" />,
}));

vi.mock('@ant-design/icons', () => ({
  LoadingOutlined: () => null,
}));

vi.mock(
  '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ActionButtons',
  () => ({
    ActionButtons: ({ onCancel, onDelete }: any) => (
      <div>
        <button onClick={onCancel}>cancel</button>
        <button onClick={onDelete}>delete</button>
      </div>
    ),
  }),
);

vi.mock(
  '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ElapsedTime',
  () => ({
    ElapsedTime: () => <div data-testid="elapsed-time" />,
  }),
);

vi.mock(
  '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/RemainingTime',
  () => ({
    RemainingTime: ({ ms }: any) => <div data-testid="remaining-time">{ms}</div>,
  }),
);

vi.mock('@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/styles', () => ({
  styles: { placeholderContainer: 'placeholder-container' },
}));

const mockUseEstimatedRemainingMs = vi.fn();
vi.mock(
  '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/useEstimatedRemainingMs',
  () => ({
    useEstimatedRemainingMs: (...args: any[]) => mockUseEstimatedRemainingMs(...args),
  }),
);

const mockUseEstimatedProgress = vi.fn();
vi.mock('./useEstimatedProgress', () => ({
  DEFAULT_AVG_LATENCY_MS: 180_000,
  useEstimatedProgress: (...args: any[]) => mockUseEstimatedProgress(...args),
}));

const baseGeneration: Generation = {
  id: 'gen-1',
  seed: null,
  createdAt: new Date(),
  asyncTaskId: 'task-1',
  task: { id: 'task-1', status: AsyncTaskStatus.Processing },
};

describe('VideoLoadingItem', () => {
  it('shows the circle and the remaining-time text together while below the 99% cap', () => {
    mockUseEstimatedProgress.mockReturnValue(40);
    mockUseEstimatedRemainingMs.mockReturnValue(90_000);

    render(
      <VideoLoadingItem
        avgLatencyMs={150_000}
        generation={baseGeneration}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('progress')).toHaveTextContent('40');
    expect(screen.getByTestId('remaining-time')).toHaveTextContent('90000');
    expect(screen.queryByTestId('elapsed-time')).toBeNull();
  });

  it('falls back to elapsed time once the circle hits the 99% cap', () => {
    mockUseEstimatedProgress.mockReturnValue(99);
    mockUseEstimatedRemainingMs.mockReturnValue(0);

    render(
      <VideoLoadingItem
        avgLatencyMs={150_000}
        generation={baseGeneration}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('elapsed-time')).toBeTruthy();
    expect(screen.queryByTestId('remaining-time')).toBeNull();
  });

  it('shows the spinner (no circle) before the first progress tick', () => {
    mockUseEstimatedProgress.mockReturnValue(null);
    mockUseEstimatedRemainingMs.mockReturnValue(null);

    render(
      <VideoLoadingItem
        avgLatencyMs={150_000}
        generation={baseGeneration}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('spin')).toBeTruthy();
    expect(screen.queryByTestId('progress')).toBeNull();
  });

  it('wires cancel and delete action buttons', async () => {
    mockUseEstimatedProgress.mockReturnValue(50);
    mockUseEstimatedRemainingMs.mockReturnValue(60_000);
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();

    render(
      <VideoLoadingItem
        avgLatencyMs={150_000}
        generation={baseGeneration}
        onCancel={onCancel}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByText('cancel'));
    await user.click(screen.getByText('delete'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
