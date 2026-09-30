import { describe, expect, it } from 'vitest';

import { AsyncTaskErrorType } from '@/types/asyncTask';

import { createVideoTaskSubmitError } from './error';

describe('createVideoTaskSubmitError', () => {
  it('should use task trigger error for generic submit failures', () => {
    const error = createVideoTaskSubmitError(new Error('API timeout'));

    expect(error.name).toBe(AsyncTaskErrorType.TaskTriggerError);
    expect(error.body.detail).toBe('Failed to submit video task: API timeout');
  });

  it('should use provider moderation type for content policy failures', () => {
    const error = createVideoTaskSubmitError(
      new Error('rejected by safety system'),
      'Content policy check failed. Revise your prompt and try again.',
    );

    expect(error.name).toBe(AsyncTaskErrorType.ProviderContentModeration);
    expect(error.body.detail).toBe(
      'Content policy check failed. Revise your prompt and try again.',
    );
  });

  it('reads message from a runtime error payload', () => {
    const e = createVideoTaskSubmitError({
      errorType: 'ProviderBizError',
      message: 'duration: bad',
    });
    expect(e.body.detail).toBe('Failed to submit video task: duration: bad');
  });

  it('reads message off a provider runtime error payload (fal 422 shape)', () => {
    // Mirrors what the fal provider throws: AgentRuntimeError.createError wraps the
    // whole payload under `.error`, so the detail message we attached lives at
    // `payload.error.message`, not top-level.
    const e = createVideoTaskSubmitError({
      error: {
        error: new Error('Unprocessable Entity'),
        message: "duration: Input should be '4s'",
      },
      errorType: 'ProviderBizError',
    });
    expect(e.body.detail).toBe("Failed to submit video task: duration: Input should be '4s'");
  });

  it('falls back to the wrapped provider error message when no detail was attached', () => {
    // No `message` anywhere on the payload (e.g. a non-422 fal failure) — fall
    // back to the original provider error's own message instead of "Unknown error".
    const e = createVideoTaskSubmitError({
      error: { error: { message: 'HTTP 500' } },
      errorType: 'ProviderBizError',
    });
    expect(e.body.detail).toBe('Failed to submit video task: HTTP 500');
  });
});
