import { type Generation, type GenerationBatch } from '@/types/generation';

export interface GenerationItemProps {
  generation: Generation;
  generationBatch: GenerationBatch;
  prompt: string;
}

export interface ActionButtonsProps {
  /** Actual pixel height of the generated image; feeds the ad-spec validator. */
  height?: number;
  onCopySeed?: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  onRefine?: () => void;
  onRemoveBackground?: () => void;
  onSendToVideo?: () => void;
  onUpscale?: () => void;
  seedTooltip?: string;
  showCopySeed?: boolean;
  showDownload?: boolean;
  /** Source image for the resize/place/relight tool; omit to hide it. */
  sourceUrl?: string;
  /** Actual pixel width of the generated image; feeds the ad-spec validator. */
  width?: number;
}

export interface SuccessStateProps {
  aspectRatio: string;
  generation: Generation;
  generationBatch: GenerationBatch;
  onCopySeed?: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onRefine?: () => void;
  onRemoveBackground: () => void;
  onSendToVideo: () => void;
  onUpscale: () => void;
  prompt: string;
  seedTooltip?: string;
}

export interface ErrorStateProps {
  aspectRatio: string;
  generation: Generation;
  generationBatch: GenerationBatch;
  onCopyError: () => void;
  onDelete: () => void;
}

export interface LoadingStateProps {
  aspectRatio: string;
  generation: Generation;
  generationBatch: GenerationBatch;
  onDelete: () => void;
}
