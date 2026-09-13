import { describe, expect, it } from 'vitest';

import { AD_FORMATS, matchBestFormats, validateAsset } from './specs';

const findFormat = (id: string) => {
  const format = AD_FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Missing fixture format: ${id}`);
  return format;
};

describe('validateAsset', () => {
  describe('fixed-pixel display formats', () => {
    const mediumRectangle = findFormat('display-medium-rectangle');

    it('passes on an exact pixel match', () => {
      const result = validateAsset({ height: 250, width: 300 }, mediumRectangle);
      expect(result.status).toBe('pass');
      expect(result.messages.join(' ')).toContain('Exact match');
    });

    it('warns on a near-miss within tolerance', () => {
      // 310x245 is within the 5% per-dimension tolerance band.
      const result = validateAsset({ height: 245, width: 310 }, mediumRectangle);
      expect(result.status).toBe('warn');
    });

    it('fails on a size that is not close at all', () => {
      const result = validateAsset({ height: 90, width: 728 }, mediumRectangle);
      expect(result.status).toBe('fail');
    });

    it('handles a missing width/height gracefully (warn, not a throw)', () => {
      expect(() => validateAsset({}, mediumRectangle)).not.toThrow();
      const result = validateAsset({}, mediumRectangle);
      expect(result.status).toBe('warn');
      expect(result.messages.join(' ')).toContain('unknown');
    });

    it('handles a partial width/height (only one dimension present) gracefully', () => {
      const result = validateAsset({ width: 300 }, mediumRectangle);
      expect(result.status).toBe('warn');
    });
  });

  describe('aspect-ratio based CTV formats', () => {
    const ctv15s = findFormat('ctv-16-9-standard-15s');

    it('passes when both aspect ratio and duration match', () => {
      const result = validateAsset({ duration: 15, height: 1080, width: 1920 }, ctv15s);
      expect(result.status).toBe('pass');
    });

    it('warns on a near-miss aspect ratio', () => {
      // 1900x1000 -> ratio 1.9 vs target 16/9 (~1.778); ~6.9% off, inside the warn band.
      const result = validateAsset({ duration: 15, height: 1000, width: 1900 }, ctv15s);
      expect(result.status).toBe('warn');
    });

    it('fails when the aspect ratio is far off', () => {
      const result = validateAsset({ duration: 15, height: 1000, width: 1000 }, ctv15s);
      expect(result.status).toBe('fail');
    });

    it('handles a missing duration gracefully instead of throwing', () => {
      expect(() => validateAsset({ height: 1080, width: 1920 }, ctv15s)).not.toThrow();
      const result = validateAsset({ height: 1080, width: 1920 }, ctv15s);
      // Dimensions are an exact pass; duration is unknown, so the combined
      // status should downgrade to 'warn' rather than silently passing or
      // hard-failing.
      expect(result.status).toBe('warn');
      expect(result.messages.join(' ')).toContain('Duration unknown');
    });

    it('handles completely missing asset fields gracefully', () => {
      expect(() => validateAsset({}, ctv15s)).not.toThrow();
      const result = validateAsset({}, ctv15s);
      expect(result.status).toBe('warn');
    });
  });

  describe('video duration bucket matching', () => {
    const ctv30s = findFormat('ctv-16-9-standard-30s');
    const baseDims = { height: 1080, width: 1920 };

    it('passes within the tight tolerance around the bucket', () => {
      expect(validateAsset({ ...baseDims, duration: 30 }, ctv30s).status).toBe('pass');
      expect(validateAsset({ ...baseDims, duration: 31 }, ctv30s).status).toBe('pass');
    });

    it('warns just outside the tight tolerance but inside the warn band', () => {
      expect(validateAsset({ ...baseDims, duration: 34 }, ctv30s).status).toBe('warn');
    });

    it('fails when the duration is far from any bucket', () => {
      expect(validateAsset({ ...baseDims, duration: 5 }, ctv30s).status).toBe('fail');
    });

    it('matches the closest of several duration targets, not just the first in the list', () => {
      // Synthetic format with multiple buckets to exercise the
      // closest-bucket search directly, independent of which single
      // duration each real CTV format above happens to target.
      const multiTarget = {
        aspectRatio: { h: 9, w: 16 },
        category: 'ctv' as const,
        durationTargetsSec: [6, 15, 30],
        id: 'multi-target-fixture',
        label: 'Multi-target fixture',
        notes: '',
      };

      const closeTo15 = validateAsset({ ...baseDims, duration: 16 }, multiTarget);
      expect(closeTo15.status).toBe('pass');
      expect(closeTo15.messages.join(' ')).toContain('15s');

      const closeTo30 = validateAsset({ ...baseDims, duration: 29 }, multiTarget);
      expect(closeTo30.status).toBe('pass');
      expect(closeTo30.messages.join(' ')).toContain('30s');

      const closeTo6 = validateAsset({ ...baseDims, duration: 8 }, multiTarget);
      expect(closeTo6.status).toBe('warn');
      expect(closeTo6.messages.join(' ')).toContain('6s');
    });
  });

  describe('soft duration ceiling (social formats)', () => {
    const storyVertical = findFormat('social-story-vertical');
    const verticalDims = { height: 1920, width: 1080 };

    it('passes at or under the ceiling', () => {
      expect(validateAsset({ ...verticalDims, duration: 15 }, storyVertical).status).toBe('pass');
      expect(validateAsset({ ...verticalDims, duration: 5 }, storyVertical).status).toBe('pass');
    });

    it('warns when slightly over the ceiling', () => {
      expect(validateAsset({ ...verticalDims, duration: 18 }, storyVertical).status).toBe('warn');
    });

    it('fails when well over the ceiling', () => {
      expect(validateAsset({ ...verticalDims, duration: 60 }, storyVertical).status).toBe('fail');
    });
  });

  describe('file size (skipped unless provided)', () => {
    const mediumRectangle = findFormat('display-medium-rectangle'); // maxFileSizeKB: 150
    const dims = { height: 250, width: 300 };

    it('is skipped entirely when sizeBytes is not provided, leaving the dimension pass intact', () => {
      const result = validateAsset(dims, mediumRectangle);
      expect(result.status).toBe('pass');
      expect(result.messages.some((m) => m.toLowerCase().includes('file size'))).toBe(false);
    });

    it('passes when under the cited guideline', () => {
      const result = validateAsset({ ...dims, sizeBytes: 100 * 1024 }, mediumRectangle);
      expect(result.status).toBe('pass');
    });

    it('warns when moderately over the cited guideline', () => {
      const result = validateAsset({ ...dims, sizeBytes: 200 * 1024 }, mediumRectangle);
      expect(result.status).toBe('warn');
    });

    it('fails when far over the cited guideline', () => {
      const result = validateAsset({ ...dims, sizeBytes: 500 * 1024 }, mediumRectangle);
      expect(result.status).toBe('fail');
    });
  });

  it('never throws on zero or negative dimensions', () => {
    const mediumRectangle = findFormat('display-medium-rectangle');
    const ctv15s = findFormat('ctv-16-9-standard-15s');

    expect(() => validateAsset({ height: 0, width: 0 }, mediumRectangle)).not.toThrow();
    expect(() => validateAsset({ height: -10, width: -10 }, ctv15s)).not.toThrow();
    expect(validateAsset({ height: 0, width: 0 }, ctv15s).status).toBe('fail');
  });
});

describe('matchBestFormats', () => {
  it('finds the exact display format and excludes far-off ones', () => {
    const matches = matchBestFormats({ height: 250, width: 300 });
    const ids = matches.map((m) => m.format.id);

    expect(ids).toContain('display-medium-rectangle');
    expect(ids).not.toContain('display-leaderboard');
    expect(ids).not.toContain('display-billboard');

    const exact = matches.find((m) => m.format.id === 'display-medium-rectangle');
    expect(exact?.result.status).toBe('pass');
  });

  it('finds the matching CTV duration bucket and excludes the others', () => {
    const matches = matchBestFormats({ duration: 15, height: 1080, width: 1920 });
    const ids = matches.map((m) => m.format.id);

    expect(ids).toContain('ctv-16-9-standard-15s');
    expect(ids).not.toContain('ctv-16-9-bumper-6s');
    expect(ids).not.toContain('ctv-16-9-standard-30s');
  });

  it('returns an empty list when nothing is close', () => {
    // An extreme, non-standard aspect ratio that is far from every target
    // ratio (the widest target is 16:9 at ~1.78) and far from every fixed
    // display size.
    const matches = matchBestFormats({ height: 1, width: 100 });
    expect(matches).toEqual([]);
  });

  it('sorts pass matches before warn matches', () => {
    // Deliberately listed warn-first to prove matchBestFormats re-sorts
    // rather than preserving input order.
    const customFormats = [
      {
        category: 'display' as const,
        height: 250,
        id: 'warn-one',
        label: 'Warn one',
        notes: '',
        width: 300,
      },
      {
        category: 'display' as const,
        height: 245,
        id: 'pass-one',
        label: 'Pass one',
        notes: '',
        width: 310,
      },
    ];

    const matches = matchBestFormats({ height: 245, width: 310 }, customFormats);

    expect(matches.map((m) => m.format.id)).toEqual(['pass-one', 'warn-one']);
  });

  it('never throws given an empty asset', () => {
    expect(() => matchBestFormats({})).not.toThrow();
  });
});
