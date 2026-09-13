import type { EditImageRequest } from '@/store/image/slices/createImage/action';

/**
 * Pure mask-editor logic: stroke geometry in the source image's natural pixel
 * space, rasterisation onto an injected 2D context, and the fal request shapes.
 * Kept free of DOM/canvas creation so every branch is unit-testable in jsdom.
 *
 * Mask convention (FLUX.1 Fill docs, also Bria's): white = edit this region,
 * black = keep. We always export a black canvas with white strokes.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  /** Brush diameter in natural image pixels. */
  size: number;
}

export interface Size {
  height: number;
  width: number;
}

export const BRUSH_MIN = 8;
export const BRUSH_MAX = 200;
export const BRUSH_DEFAULT = 48;

export type MaskMode = 'erase' | 'replace';

export const TRY_ON_CATEGORIES = ['auto', 'tops', 'bottoms', 'one-pieces'] as const;
export type TryOnCategory = (typeof TRY_ON_CATEGORIES)[number];

/** Map a pointer position on the displayed element to natural image pixels. */
export const toNatural = (
  clientX: number,
  clientY: number,
  rect: { height: number; left: number; top: number; width: number },
  natural: Size,
): Point => {
  const sx = rect.width > 0 ? natural.width / rect.width : 1;
  const sy = rect.height > 0 ? natural.height / rect.height : 1;
  return {
    x: Math.min(natural.width, Math.max(0, (clientX - rect.left) * sx)),
    y: Math.min(natural.height, Math.max(0, (clientY - rect.top) * sy)),
  };
};

export const hasStrokes = (strokes: Stroke[]) =>
  strokes.some((s) => s.points.length > 0 && s.size > 0);

/** Minimal 2D-context surface the rasteriser needs (keeps tests canvas-free). */
export interface StrokeContext {
  arc: (x: number, y: number, r: number, start: number, end: number) => void;
  beginPath: () => void;
  fill: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineTo: (x: number, y: number) => void;
  lineWidth: number;
  moveTo: (x: number, y: number) => void;
  stroke: () => void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
}

/** Draw one stroke as a round-capped polyline (or a dot for a single point). */
export const drawStroke = (ctx: StrokeContext, stroke: Stroke, color: string) => {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.points.length === 1) {
    const [p] = stroke.points;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
};

/** Export mask: black background, white strokes, at the image's natural size. */
export const rasterizeMask = (ctx: StrokeContext, strokes: Stroke[], natural: Size) => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, natural.width, natural.height);
  for (const stroke of strokes) drawStroke(ctx, stroke, '#ffffff');
};

/** On-screen preview: translucent strokes over the photo so edits stay visible. */
export const PREVIEW_STROKE_COLOR = 'rgba(255, 64, 64, 0.55)';

export const buildEraseRequest = (maskUrl: string): EditImageRequest => ({
  model: 'fal-ai/bria/eraser',
  params: {
    mask_type: 'manual',
    mask_url: maskUrl,
    // Server requires `prompt`; bria/eraser ignores it — it's the batch label.
    prompt: 'Erase painted area',
  },
});

export const buildReplaceRequest = (maskUrl: string, prompt: string): EditImageRequest => ({
  model: 'fal-ai/flux-pro/v1/fill',
  params: {
    mask_url: maskUrl,
    num_images: 1,
    output_format: 'png',
    prompt: prompt.trim(),
  },
});

/**
 * The source image is the garment; the person photo is supplied separately.
 * `imageUrl` (the source) is still sent by `createEditedImage` and ignored by
 * fashn, which is what keeps the garment as the batch's reference image.
 */
export const buildTryOnRequest = (
  garmentUrl: string,
  modelImageUrl: string,
  category: TryOnCategory,
): EditImageRequest => ({
  model: 'fal-ai/fashn/tryon/v1.6',
  params: {
    category,
    garment_image: garmentUrl,
    mode: 'quality',
    model_image: modelImageUrl,
    num_samples: 1,
    output_format: 'png',
    prompt: `Try on (${category})`,
  },
});
