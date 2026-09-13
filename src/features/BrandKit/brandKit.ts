/**
 * Brand Kit — pure helpers (no React, no store) so they can be unit-tested.
 *
 * A kit is folded into generation prompts as a short, model-agnostic preamble.
 * Every tool that consumes it (image prompt, video prompt, Camera Director,
 * Auto-animate, Ad Voice scripts) goes through `compileBrandPreamble`, so the
 * wording stays consistent and can be tuned in one place.
 */
import type { BrandKit } from '@lobechat/types';

export const MAX_BRAND_COLORS = 6;
export const MAX_BRAND_FONTS = 3;
export const MAX_BRAND_NOTES_LENGTH = 600;

const HEX_COLOR = /^#(?:[\dA-F]{3}|[\dA-F]{6})$/i;

export const isHexColor = (value: string) => HEX_COLOR.test(value.trim());

/** Expand `#abc` to `#AABBCC` and upper-case; returns null when not a hex colour. */
export const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) return null;
  const hex = trimmed.slice(1);
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return `#${full.toUpperCase()}`;
};

export const createEmptyBrandKit = (id: string): BrandKit => ({
  colors: [],
  fonts: [],
  id,
  name: '',
  styleNotes: '',
  toneOfVoice: '',
});

/** Trim, drop empties, de-duplicate, normalise colours, enforce caps. */
export const sanitizeBrandKit = (kit: BrandKit): BrandKit => {
  const colors = [
    ...new Set(kit.colors.map((c) => normalizeHexColor(c)).filter((c): c is string => c !== null)),
  ].slice(0, MAX_BRAND_COLORS);
  const fonts = [...new Set(kit.fonts.map((f) => f.trim()).filter(Boolean))].slice(
    0,
    MAX_BRAND_FONTS,
  );
  return {
    colors,
    fonts,
    id: kit.id,
    logoUrl: kit.logoUrl?.trim() || undefined,
    name: kit.name.trim(),
    styleNotes: kit.styleNotes.trim().slice(0, MAX_BRAND_NOTES_LENGTH),
    toneOfVoice: kit.toneOfVoice.trim().slice(0, MAX_BRAND_NOTES_LENGTH),
  };
};

export const validateBrandKit = (kit: BrandKit): string[] => {
  const errors: string[] = [];
  if (!kit.name.trim()) errors.push('name');
  const badColor = kit.colors.find((c) => c.trim() && !isHexColor(c));
  if (badColor) errors.push('color');
  return errors;
};

export type BrandPreambleTarget = 'image' | 'video' | 'script';

/**
 * The prompt-side representation of a kit. Colours are given as hex plus a
 * plain-language cue, because image/video models follow "deep navy and
 * signal orange" far more reliably than raw hex codes alone.
 */
export const compileBrandPreamble = (
  kit: BrandKit | undefined,
  target: BrandPreambleTarget,
): string => {
  if (!kit) return '';
  const clean = sanitizeBrandKit(kit);
  const lines: string[] = [];

  if (target === 'script') {
    if (clean.toneOfVoice) lines.push(`Brand voice (${clean.name}): ${clean.toneOfVoice}`);
    return lines.join('\n');
  }

  lines.push(`Brand: ${clean.name}.`);
  if (clean.colors.length > 0) {
    lines.push(
      `Brand palette: ${clean.colors.join(', ')} — keep these as the dominant colours; ` +
        `no off-brand hues.`,
    );
  }
  if (clean.fonts.length > 0 && target === 'image') {
    lines.push(`Any on-image text is set in ${clean.fonts.join(' / ')}.`);
  }
  if (clean.styleNotes) lines.push(`Art direction: ${clean.styleNotes}`);
  return lines.join('\n');
};

/**
 * Append the preamble to a prompt without duplicating it when the user
 * applies the same kit twice.
 */
export const applyBrandPreamble = (
  prompt: string,
  kit: BrandKit | undefined,
  target: BrandPreambleTarget,
): string => {
  const preamble = compileBrandPreamble(kit, target);
  if (!preamble) return prompt;
  if (prompt.includes(preamble)) return prompt;
  const base = prompt.trimEnd();
  return base ? `${base}\n\n${preamble}` : preamble;
};

/** Plain-language palette line for Camera Director's `palette` field. */
export const brandPaletteLine = (kit: BrandKit | undefined): string => {
  if (!kit) return '';
  const { colors } = sanitizeBrandKit(kit);
  if (colors.length === 0) return '';
  return `Brand palette ${colors.join(', ')}; no off-brand hues.`;
};

export const findBrandKit = (
  kits: BrandKit[] | undefined,
  id: string | undefined,
): BrandKit | undefined => {
  if (!id || !kits) return undefined;
  return kits.find((k) => k.id === id);
};
