/**
 * Minimal structural shape the resolver reads for the enabled video model
 * list — decoupled from the full `EnabledProviderWithModels` type so callers
 * can pass the store list (structurally assignable) while tests build
 * lightweight fixtures. Mirrors `useGenerationModelNotice`'s resolver shape.
 */
interface EnabledModelGroup {
  children: { id: string }[];
  id: string;
}

export interface ResolveVideoModelDeepLinkParams {
  /** Whether the active model can currently take a reference image at all. */
  currentModelSupportsImage: boolean;
  /** The enabled video model list (provider groups + child model ids). */
  enabledModelList: EnabledModelGroup[];
  /** Whether an `?imageUrl=` deep link is also pending for this navigation. */
  hasPendingImage: boolean;
  /** The `?model=` value from the deep link. */
  targetModelId: string;
}

export type VideoModelDeepLinkResult =
  /** The requested model is enabled: switch to it. */
  | { type: 'switch'; providerId: string }
  /**
   * The requested model isn't enabled, but there's no image at risk (either no
   * pending image, or the current model can still take it): just drop the
   * `?model=` param and proceed on the current model.
   */
  | { type: 'fallback' }
  /**
   * The requested model isn't enabled AND the current model can't take the
   * pending image either — attaching it would silently land on params the
   * request never sends. Drop both params and surface an error instead.
   */
  | { type: 'error' };

/**
 * Pure resolver for the video PromptInput's `?model=` deep-link effect (e.g.
 * "Send to Video" from a generated image). Kept side-effect free and
 * colocated with a unit test since mounting the full PromptInput component is
 * expensive (it pulls in ~15 feature modules).
 */
export function resolveVideoModelDeepLink({
  targetModelId,
  enabledModelList,
  hasPendingImage,
  currentModelSupportsImage,
}: ResolveVideoModelDeepLinkParams): VideoModelDeepLinkResult {
  const matchedProvider = enabledModelList.find((providerGroup) =>
    providerGroup.children.some((m) => m.id === targetModelId),
  );

  if (matchedProvider) return { providerId: matchedProvider.id, type: 'switch' };

  if (hasPendingImage && !currentModelSupportsImage) return { type: 'error' };

  return { type: 'fallback' };
}
