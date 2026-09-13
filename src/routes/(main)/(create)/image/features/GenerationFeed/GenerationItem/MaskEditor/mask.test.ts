import { describe, expect, it, vi } from 'vitest';

import {
  buildEraseRequest,
  buildReplaceRequest,
  buildTryOnRequest,
  drawStroke,
  hasStrokes,
  rasterizeMask,
  type StrokeContext,
  toNatural,
} from './mask';

const fakeCtx = (): StrokeContext & { calls: string[] } => {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(',')})`);
    };
  return {
    arc: rec('arc'),
    beginPath: rec('beginPath'),
    calls,
    fill: rec('fill'),
    fillRect: rec('fillRect'),
    fillStyle: '',
    lineCap: 'butt',
    lineJoin: 'miter',
    lineTo: rec('lineTo'),
    lineWidth: 0,
    moveTo: rec('moveTo'),
    stroke: rec('stroke'),
    strokeStyle: '',
  };
};

describe('toNatural', () => {
  it('scales display coordinates to natural pixels and clamps to the image', () => {
    const rect = { height: 200, left: 100, top: 50, width: 400 };
    const natural = { height: 1000, width: 2000 };
    expect(toNatural(300, 150, rect, natural)).toEqual({ x: 1000, y: 500 });
    expect(toNatural(0, 0, rect, natural)).toEqual({ x: 0, y: 0 });
    expect(toNatural(10_000, 10_000, rect, natural)).toEqual({ x: 2000, y: 1000 });
  });

  it('falls back to 1:1 when the display rect has no size', () => {
    expect(
      toNatural(5, 7, { height: 0, left: 0, top: 0, width: 0 }, { height: 10, width: 10 }),
    ).toEqual({ x: 5, y: 7 });
  });
});

describe('hasStrokes', () => {
  it('is false for empty or degenerate strokes', () => {
    expect(hasStrokes([])).toBe(false);
    expect(hasStrokes([{ points: [], size: 20 }])).toBe(false);
    expect(hasStrokes([{ points: [{ x: 1, y: 1 }], size: 0 }])).toBe(false);
    expect(hasStrokes([{ points: [{ x: 1, y: 1 }], size: 20 }])).toBe(true);
  });
});

describe('drawStroke / rasterizeMask', () => {
  it('draws a single point as a filled dot and a path as a round-capped polyline', () => {
    const ctx = fakeCtx();
    drawStroke(ctx, { points: [{ x: 10, y: 10 }], size: 40 }, '#fff');
    expect(ctx.calls).toEqual(['beginPath()', 'arc(10,10,20,0,6.283185307179586)', 'fill()']);
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
    expect(ctx.lineWidth).toBe(40);

    const ctx2 = fakeCtx();
    drawStroke(
      ctx2,
      {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 },
        ],
        size: 10,
      },
      '#fff',
    );
    expect(ctx2.calls).toEqual([
      'beginPath()',
      'moveTo(1,2)',
      'lineTo(3,4)',
      'lineTo(5,6)',
      'stroke()',
    ]);
  });

  it('exports black background with white strokes at natural size', () => {
    const ctx = fakeCtx();
    const setStyle = vi.fn();
    Object.defineProperty(ctx, 'fillStyle', { get: () => '', set: setStyle });
    rasterizeMask(ctx, [{ points: [{ x: 5, y: 5 }], size: 10 }], { height: 300, width: 400 });
    expect(ctx.calls[0]).toBe('fillRect(0,0,400,300)');
    expect(setStyle).toHaveBeenNthCalledWith(1, '#000000');
    expect(setStyle).toHaveBeenNthCalledWith(2, '#ffffff');
    expect(ctx.strokeStyle).toBe('#ffffff');
  });
});

describe('request builders', () => {
  it('builds an erase request against bria/eraser with a manual mask', () => {
    expect(buildEraseRequest('https://cdn.example.com/mask.png')).toEqual({
      model: 'fal-ai/bria/eraser',
      params: {
        mask_type: 'manual',
        mask_url: 'https://cdn.example.com/mask.png',
        prompt: 'Erase painted area',
      },
    });
  });

  it('builds a replace request against flux-pro/v1/fill with the trimmed prompt', () => {
    expect(buildReplaceRequest('https://cdn.example.com/mask.png', '  a red mug  ')).toEqual({
      model: 'fal-ai/flux-pro/v1/fill',
      params: {
        mask_url: 'https://cdn.example.com/mask.png',
        num_images: 1,
        output_format: 'png',
        prompt: 'a red mug',
      },
    });
  });

  it('builds a try-on request with the source as the garment and the person as model_image', () => {
    expect(
      buildTryOnRequest(
        'https://cdn.example.com/pants.png',
        'https://cdn.example.com/person.png',
        'bottoms',
      ),
    ).toEqual({
      model: 'fal-ai/fashn/tryon/v1.6',
      params: {
        category: 'bottoms',
        garment_image: 'https://cdn.example.com/pants.png',
        mode: 'quality',
        model_image: 'https://cdn.example.com/person.png',
        num_samples: 1,
        output_format: 'png',
        prompt: 'Try on (bottoms)',
      },
    });
  });
});
