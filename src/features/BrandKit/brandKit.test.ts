import type { BrandKit } from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import {
  applyBrandPreamble,
  brandPaletteLine,
  compileBrandPreamble,
  findBrandKit,
  normalizeHexColor,
  sanitizeBrandKit,
  validateBrandKit,
} from './brandKit';

const kit: BrandKit = {
  colors: ['#0f172a', '#f97316'],
  fonts: ['Inter', 'Playfair Display'],
  id: 'k1',
  name: 'Acme',
  styleNotes: 'Warm daylight, matte surfaces, no lens flare.',
  toneOfVoice: 'Confident, plain-spoken, never salesy.',
};

describe('normalizeHexColor', () => {
  it('expands shorthand and upper-cases', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor(' #0f172a ')).toBe('#0F172A');
  });

  it('rejects non-hex input', () => {
    expect(normalizeHexColor('navy')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
  });
});

describe('sanitizeBrandKit', () => {
  it('normalises colours, drops invalid ones and de-duplicates', () => {
    const out = sanitizeBrandKit({
      ...kit,
      colors: ['#abc', '#AABBCC', 'red', ''],
      fonts: [' Inter ', 'Inter', ''],
    });
    expect(out.colors).toEqual(['#AABBCC']);
    expect(out.fonts).toEqual(['Inter']);
  });

  it('caps list lengths', () => {
    const out = sanitizeBrandKit({
      ...kit,
      colors: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'],
    });
    expect(out.colors).toHaveLength(6);
  });
});

describe('validateBrandKit', () => {
  it('requires a name and valid colours', () => {
    expect(validateBrandKit({ ...kit, name: ' ' })).toContain('name');
    expect(validateBrandKit({ ...kit, colors: ['#zzz'] })).toContain('color');
    expect(validateBrandKit(kit)).toEqual([]);
  });
});

describe('compileBrandPreamble', () => {
  it('returns an empty string without a kit', () => {
    expect(compileBrandPreamble(undefined, 'image')).toBe('');
  });

  it('includes palette, fonts and art direction for images', () => {
    const out = compileBrandPreamble(kit, 'image');
    expect(out).toContain('Brand: Acme.');
    expect(out).toContain('#0F172A, #F97316');
    expect(out).toContain('Inter / Playfair Display');
    expect(out).toContain('Art direction: Warm daylight');
  });

  it('omits fonts for video (no typography step there)', () => {
    const out = compileBrandPreamble(kit, 'video');
    expect(out).not.toContain('Inter');
    expect(out).toContain('#0F172A');
  });

  it('only carries tone of voice for scripts', () => {
    const out = compileBrandPreamble(kit, 'script');
    expect(out).toBe('Brand voice (Acme): Confident, plain-spoken, never salesy.');
    expect(compileBrandPreamble({ ...kit, toneOfVoice: '' }, 'script')).toBe('');
  });
});

describe('applyBrandPreamble', () => {
  it('appends once and is idempotent', () => {
    const once = applyBrandPreamble('A red mug on a desk', kit, 'image');
    expect(once.startsWith('A red mug on a desk\n\n')).toBe(true);
    expect(applyBrandPreamble(once, kit, 'image')).toBe(once);
  });

  it('returns the preamble alone for an empty prompt', () => {
    expect(applyBrandPreamble('   ', kit, 'video')).toBe(compileBrandPreamble(kit, 'video'));
  });

  it('leaves the prompt untouched with no kit', () => {
    expect(applyBrandPreamble('keep me', undefined, 'image')).toBe('keep me');
  });
});

describe('brandPaletteLine / findBrandKit', () => {
  it('builds the Camera Director palette line', () => {
    expect(brandPaletteLine(kit)).toBe('Brand palette #0F172A, #F97316; no off-brand hues.');
    expect(brandPaletteLine({ ...kit, colors: [] })).toBe('');
  });

  it('finds a kit by id', () => {
    expect(findBrandKit([kit], 'k1')).toBe(kit);
    expect(findBrandKit([kit], '')).toBeUndefined();
    expect(findBrandKit(undefined, 'k1')).toBeUndefined();
  });
});
