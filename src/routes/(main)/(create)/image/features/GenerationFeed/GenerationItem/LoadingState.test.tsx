import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AsyncTaskStatus } from '@/types/asyncTask';
import type { Generation, GenerationBatch } from '@/types/generation';

import { LoadingState } from './LoadingState';

vi.mock('@lobehub/ui', async () => {
  const React = await import('react');

  return {
    Block: ({ children, ...rest }: any) => React.createElement('div', rest, children),
    Center: ({ children, ...rest }: any) => React.createElement('div', rest, children),
  };
});

vi.mock('@/components/NeuralNetworkLoading', () => ({
  default: () => null,
}));

vi.mock('./ActionButtons', () => ({
  ActionButtons: ({ onCancel, onDelete }: any) => (
    <div>
      <button onClick={onCancel}>cancel</button>
      <button onClick={onDelete}>delete</button>
    </div>
  ),
}));

vi.mock('./ElapsedTime', () => ({
  ElapsedTime: () => <div data-testid="elapsed-time" />,
}));

vi.mock('./RemainingTime', () => ({
  RemainingTime: ({ ms }: any) => <div data-testid="remaining-time">{ms}</div>,
}));

const mockUseEstimatedRemainingMs = vi.fn();
vi.mock('./useEstimatedRemainingMs', () => ({
  useEstimatedRemainingMs: (...args: any[]) => mockUseEstimatedRemainingMs(...args),
}));

const baseGeneration: Generation = {
  id: 'gen-1',
  seed: null,
  createdAt: new Date(),
  asyncTaskId: 'task-1',
  task: { id: 'task-1', status: AsyncTaskStatus.Processing },
};

const baseBatch: GenerationBatch = {
  id: 'batch-1',
  provider: 'test',
  model: 'test-model',
  prompt: 'a prompt',
  createdAt: new Date(),
  generations: [],
  avgLatencyMs: 60_000,
};

describe('LoadingState', () => {
  it('shows the remaining-time estimate when one is available', () => {
    mockUseEstimatedRemainingMs.mockReturnValue(30_000);

    render(
      <LoadingState
        aspectRatio={'1 / 1'}
        generation={baseGeneration}
        generationBatch={baseBatch}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('remaining-time')).toHaveTextContent('30000');
    expect(screen.queryByTestId('elapsed-time')).toBeNull();
  });

  it('falls back to elapsed time once no estimate is available (exceeded, or no model history)', () => {
    mockUseEstimatedRemainingMs.mockReturnValue(null);

    render(
      <LoadingState
        aspectRatio={'1 / 1'}
        generation={baseGeneration}
        generationBatch={baseBatch}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('elapsed-time')).toBeTruthy();
    expect(screen.queryByTestId('remaining-time')).toBeNull();
  });

  it('falls back to elapsed time once the estimate hits zero', () => {
    mockUseEstimatedRemainingMs.mockReturnValue(0);

    render(
      <LoadingState
        aspectRatio={'1 / 1'}
        generation={baseGeneration}
        generationBatch={baseBatch}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('elapsed-time')).toBeTruthy();
  });

  it('wires the cancel action button through to onCancel', async () => {
    mockUseEstimatedRemainingMs.mockReturnValue(null);
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <LoadingState
        aspectRatio={'1 / 1'}
        generation={baseGeneration}
        generationBatch={baseBatch}
        onCancel={onCancel}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByText('cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
