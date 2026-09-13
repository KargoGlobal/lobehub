import type { AsyncTaskError, AsyncTaskStatus } from '../asyncTask';

export interface GenerationTopicCreator {
  avatar?: string | null;
  fullName?: string | null;
  id: string;
  username?: string | null;
}

export interface ImageGenerationTopic {
  coverUrl?: string | null;
  createdAt: Date;
  creator?: GenerationTopicCreator | null;
  id: string;
  title?: string | null;
  updatedAt: Date;
  visibility?: 'private' | 'public' | null;
}

export interface BaseGenerationAsset {
  type: string;
}

export interface ImageGenerationAsset extends BaseGenerationAsset {
  /**
   * Height of the image/video
   */
  height?: number;
  /**
   * CDN URL from the API provider, typically expires quickly
   */
  originalUrl?: string;
  /**
   * Thumbnail URL - for images it's a resized version, for videos it's a thumbnail of the cover
   */
  thumbnailUrl?: string;
  /**
   * URL stored in own OSS, only the key is stored. The full URL needs to be obtained using FileService.getFullFileUrl
   */
  url?: string;
  /**
   * Width of the image/video
   */
  width?: number;
}

export interface VideoGenerationAsset extends BaseGenerationAsset {
  coverUrl?: string;
  duration?: number;
  height?: number;
  originalUrl?: string;
  thumbnailUrl?: string;
  url?: string;
  width?: number;
}

export type GenerationAsset = ImageGenerationAsset | VideoGenerationAsset;

/**
 * Extra image-URL fields the image edit tools send alongside `imageUrl`
 * (mask editor → `mask_url`; try-on → `model_image`, `garment_image`).
 * Like `imageUrl`/`imageUrls` they are stored as storage keys and expanded
 * back to URLs on read, so no presigned URL lands in the database and
 * recreate / reuse-settings keeps working.
 */
export const IMAGE_EDIT_URL_FIELDS = ['mask_url', 'model_image', 'garment_image'] as const;

/**
 * Extra media-URL fields the talking-performer tools send alongside the video
 * prompt (`audioUrl` = driving voiceover; `videoUrl` = clip to re-lip-sync).
 * Stored as storage keys and expanded on read, same as `imageUrl`.
 */
export const VIDEO_INPUT_URL_FIELDS = ['audioUrl', 'videoUrl'] as const;

/**
 * Marker stored in a batch's config when its output contains a synthetic
 * performer (AI avatar / lip-sync). Surfaces as a badge in the feed and is the
 * hook for disclosure stamping on export (NY SB 8420-A and similar rules).
 */
export const SYNTHETIC_PERFORMER_DISCLOSURE = 'synthetic_performer' as const;

export interface GenerationConfig {
  aspectRatio?: string;
  /** Driving audio for talking-performer video models. */
  audioUrl?: string | null;
  cfg?: number;
  /** Set when the output contains a synthetic performer; see SYNTHETIC_PERFORMER_DISCLOSURE. */
  disclosure?: string;
  endImageUrl?: string | null;
  height?: number;
  imageUrl?: string | null;
  imageUrls?: string[];
  prompt: string;
  resolution?: string;
  size?: string;
  steps?: number;
  /** Source clip for lip-sync video models. */
  videoUrl?: string | null;
  width?: number;
}

export interface GenerationAsyncTask {
  error?: AsyncTaskError;
  id: string;
  status: AsyncTaskStatus;
}

export interface Generation {
  /**
   * The asset associated with the generation, containing image URLs and dimensions.
   */
  asset?: GenerationAsset | null;
  asyncTaskId: string | null;
  createdAt: Date;
  id: string;
  seed?: number | null;

  task: GenerationAsyncTask;
}

export interface GenerationBatch {
  avgLatencyMs?: number | null;
  config?: GenerationConfig;
  createdAt: Date;
  creator?: GenerationTopicCreator | null;
  generations: Generation[];
  height?: number | null;
  id: string;
  model: string;
  prompt: string;
  provider: string;
  width?: number | null;
}
