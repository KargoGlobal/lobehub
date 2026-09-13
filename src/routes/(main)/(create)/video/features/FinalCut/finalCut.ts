import { type CreateFinalCutInput } from '@/server/routers/lambda/finalCut';
import { AsyncTaskStatus } from '@/types/asyncTask';
import { type GenerationBatch } from '@/types/generation';

// Duplicated from the zod schema in apps/server/src/routers/lambda/finalCut.ts (MIN/MAX_FINAL_CUT_CLIPS)
// rather than imported: that router module pulls in server-only deps (DB models, trpc
// middlewares) that must not enter the client bundle. Keep these two numbers in sync by hand.
export const MIN_FINAL_CUT_CLIPS = 2;
export const MAX_FINAL_CUT_CLIPS = 12;

export interface FinalCutClipOption {
  /** The generation's id — stable, unique key for selection/reordering. */
  id: string;
  label: string;
  url: string;
}

/**
 * Successful video generations from a topic's batches, in the order the feed returned them.
 * Only clips with a finished asset URL are offered — still-generating or failed batches can't
 * be concatenated.
 */
export function listSelectableClips(batches: GenerationBatch[]): FinalCutClipOption[] {
  const options: FinalCutClipOption[] = [];

  for (const batch of batches) {
    const generation = batch.generations[0];
    if (!generation) continue;
    if (generation.task.status !== AsyncTaskStatus.Success) continue;

    const url = generation.asset?.url;
    if (!url) continue;

    options.push({ id: generation.id, label: batch.prompt, url });
  }

  return options;
}

export function toggleClipSelection(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((selectedId) => selectedId !== id)
    : [...selectedIds, id];
}

/** Moves `id` one position up/down within `order`; a no-op at either end. */
export function moveClip(order: string[], id: string, direction: 'down' | 'up'): string[] {
  const index = order.indexOf(id);
  if (index === -1) return order;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) return order;

  const next = [...order];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export interface FinalCutValidation {
  message?: string;
  valid: boolean;
}

export function validateClipSelection(clipCount: number): FinalCutValidation {
  if (clipCount < MIN_FINAL_CUT_CLIPS) {
    return { message: `Select at least ${MIN_FINAL_CUT_CLIPS} clips.`, valid: false };
  }
  if (clipCount > MAX_FINAL_CUT_CLIPS) {
    return { message: `Select at most ${MAX_FINAL_CUT_CLIPS} clips.`, valid: false };
  }
  return { valid: true };
}

/**
 * Builds the export request from the user's ordered clip selection and optional audio track.
 * Throws (rather than returning a validation result) so callers can drop it straight into the
 * same try/catch + toast.error pattern every other creative tool in this folder uses.
 */
export function buildFinalCutRequest(
  orderedClipUrls: string[],
  audioUrl?: string | null,
): CreateFinalCutInput {
  const validation = validateClipSelection(orderedClipUrls.length);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  return {
    audioUrl: audioUrl || undefined,
    clipUrls: orderedClipUrls,
  };
}
