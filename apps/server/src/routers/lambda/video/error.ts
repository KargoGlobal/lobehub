import { AsyncTaskError, AsyncTaskErrorType } from '@/types/asyncTask';

/**
 * Runtime errors are thrown as `{ errorType, error, message? }` payloads, not Error
 * instances. The fal provider (and others using `AgentRuntimeError.createError`) nests
 * the human-readable detail under `.error.message`; fall further to the wrapped
 * provider error's own `.message` when no detail was attached.
 */
const describeSubmitError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const payload = error as { error?: unknown; message?: unknown };
    if (typeof payload.message === 'string' && payload.message) return payload.message;
    const inner = payload.error as { error?: unknown; message?: unknown } | undefined;
    if (inner && typeof inner.message === 'string' && inner.message) return inner.message;
    const innerError = inner?.error as { message?: unknown } | undefined;
    if (innerError && typeof innerError.message === 'string' && innerError.message)
      return innerError.message;
  }
  return 'Unknown error';
};

export const createVideoTaskSubmitError = (error: unknown, providerContentPolicyMessage?: string) =>
  new AsyncTaskError(
    providerContentPolicyMessage
      ? AsyncTaskErrorType.ProviderContentModeration
      : AsyncTaskErrorType.TaskTriggerError,
    providerContentPolicyMessage ?? 'Failed to submit video task: ' + describeSubmitError(error),
  );
