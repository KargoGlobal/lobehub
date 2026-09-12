import { describe, expect, it } from 'vitest';

import {
  AUTO_ANIMATE_MODELS,
  buildConcepts,
  detectCategory,
  PRODUCT_CATEGORIES,
  recipesForCategory,
} from './catalog';

describe('detectCategory', () => {
  it('maps common product words to categories', () => {
    expect(detectCategory('slim-fit black wool pants')).toBe('apparelBottom');
    expect(detectCategory('a pair of jeans')).toBe('apparelBottom');
    expect(detectCategory('oversized hoodie in sage')).toBe('apparelTop');
    expect(detectCategory('white leather sneakers')).toBe('footwear');
    expect(detectCategory('a 330ml can of sparkling water')).toBe('beverage');
    expect(detectCategory('vitamin C serum, 30ml dropper bottle')).toBe('beauty');
    expect(detectCategory('noise cancelling headphones')).toBe('electronics');
    expect(detectCategory('an oak dining chair')).toBe('home');
    expect(detectCategory('a bag of kettle chips')).toBe('food');
    expect(detectCategory('a leather tote bag')).toBe('bag');
    expect(detectCategory('a bottle of shampoo')).toBe('beauty');
    expect(detectCategory('a gold pendant necklace')).toBe('jewelry');
  });

  it('falls back to generic for unknown or empty text', () => {
    expect(detectCategory('')).toBe('generic');
    expect(detectCategory('a mysterious widget')).toBe('generic');
  });

  it('matches whole words only', () => {
    expect(detectCategory('a candid portrait')).not.toBe('beverage'); // "can" inside "candid"
    expect(detectCategory('a stopwatch')).toBe('generic'); // not "watch"
  });
});

describe('recipesForCategory', () => {
  it('offers 3–4 concepts for every category and every concept compiles cleanly', () => {
    for (const { id } of PRODUCT_CATEGORIES) {
      const recipes = recipesForCategory(id);
      expect(recipes.length).toBeGreaterThanOrEqual(3);
      expect(recipes.length).toBeLessThanOrEqual(4);
      expect(new Set(recipes.map((r) => r.id)).size).toBe(recipes.length);

      const concepts = buildConcepts({
        category: id,
        description: 'a test product',
        imageUrl: 'https://cdn.example.com/p.png',
        placement: 'vertical',
        seeds: recipes.map((_, i) => i + 1),
      });
      for (const c of concepts) {
        expect(c.errors, `${id}/${c.id}`).toEqual([]);
        expect(c.prompt).toContain('Timeline:');
        expect(c.prompt).toContain('non_diegetic_music: N/A');
        expect(c.params.duration).toBeGreaterThanOrEqual(5);
        expect(c.params.duration).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('buildConcepts — pants with a photo', () => {
  const concepts = buildConcepts({
    category: 'apparelBottom',
    description: 'slim-fit black wool pants',
    imageUrl: 'https://cdn.example.com/pants.png',
    placement: 'vertical',
    seeds: [11, 12, 13, 14],
  });

  it('routes on-model concepts to reference-to-video with the photo as Image 1', () => {
    const walk = concepts.find((c) => c.id === 'walk-turn')!;
    expect(walk.mode).toBe('reference');
    expect(walk.model).toBe(AUTO_ANIMATE_MODELS.reference);
    expect(walk.params.imageUrls).toEqual(['https://cdn.example.com/pants.png']);
    expect(walk.params).not.toHaveProperty('imageUrl');
    expect(walk.params.aspectRatio).toBe('9:16');
    expect(walk.params.resolution).toBe('2K');
    expect(walk.prompt).toContain(
      'Reference: Image 1 is the product. The talent wears or uses exactly this item',
    );
    expect(walk.prompt).toContain('Product: slim-fit black wool pants.');
    expect(walk.prompt).toMatch(/Talent: an adult model/);
    expect(walk.prompt).toContain('turns a slow, full 360°');
    expect(walk.prompt).toContain('One talent only');
  });

  it('routes product-only concepts to H3 Max image-to-video with the photo as the start frame', () => {
    const ghost = concepts.find((c) => c.id === 'ghost-turntable')!;
    expect(ghost.mode).toBe('startFrame');
    expect(ghost.model).toBe(AUTO_ANIMATE_MODELS.startFrame);
    expect(ghost.params.imageUrl).toBe('https://cdn.example.com/pants.png');
    expect(ghost.params).not.toHaveProperty('imageUrls');
    // image-to-video follows the start frame; no aspect ratio sent
    expect(ghost.params).not.toHaveProperty('aspectRatio');
    expect(ghost.params.resolution).toBe('1080P');
    expect(ghost.prompt).toContain('invisible mannequin');
    expect(ghost.prompt).toContain('No hands, people or extra objects.');
  });

  it('carries the per-concept seed and quality expansion', () => {
    expect(concepts.map((c) => c.params.seed)).toEqual([11, 12, 13, 14]);
    expect(concepts.every((c) => c.params.promptExtend === 'quality')).toBe(true);
    expect(concepts.every((c) => c.warnings.length === 0)).toBe(true);
  });
});

describe('buildConcepts — no photo', () => {
  it('runs every concept as text-to-video with the placement aspect ratio and warns about the missing photo', () => {
    const concepts = buildConcepts({
      category: 'footwear',
      description: 'white leather sneakers',
      placement: 'square',
    });
    for (const c of concepts) {
      expect(c.mode).toBe('text');
      expect(c.model).toBe('minimax/h3-max');
      expect(c.params.aspectRatio).toBe('1:1');
      expect(c.params).not.toHaveProperty('imageUrl');
      expect(c.params).not.toHaveProperty('imageUrls');
      expect(c.warnings.some((w) => w.includes('Attach a product photo'))).toBe(true);
      expect(c.warnings).toContain('Lock a seed so revisions reproduce the same motion.');
    }
  });

  it('blocks every concept when the product is not described', () => {
    const concepts = buildConcepts({
      category: 'generic',
      description: '   ',
      placement: 'landscape',
    });
    expect(concepts.every((c) => c.errors.includes('Describe the product.'))).toBe(true);
  });
});
