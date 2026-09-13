/**
 * Ad-size / CTV spec validator — pure rules engine, no model call.
 *
 * Checks a generated image or video asset's real pixel dimensions (and, for
 * video, duration) against a small table of real, published ad-format specs:
 * IAB standard display sizes, IAB Tech Lab CTV/digital-video creative specs,
 * and a couple of widely-used social vertical/feed placements.
 *
 * Sources (checked 2026-09-12, not relied on from memory):
 * - IAB New Standard Ad Unit Portfolio, v1.1, July 2017 — the current
 *   official IAB display ad-unit list (iab.com/wp-content/uploads/2017/08/
 *   IABNewAdPortfolio_FINAL_2017.pdf and iab.com/guidelines/
 *   iab-standard-ad-unit-portfolio/). This replaced several older "legacy"
 *   sizes, two of which (Half Page 300x600, Large Mobile Banner 320x100) are
 *   kept below as separate, explicitly-labelled legacy entries because they
 *   remain extremely common in ad-server trafficking in 2026 even though
 *   they are not part of the current 7-unit portfolio.
 * - IAB Tech Lab, "Ad Format Guidelines for Digital Video and CTV", v2.0
 *   (github.com/InteractiveAdvertisingBureau/
 *   Ad-Format-Guidelines-for-Digital-Video-CTV/blob/main/v2.0.md) — source
 *   for CTV resolution tiers, codec, and standard spot durations
 *   (6s / 15s / 20s / 30s).
 * - Cross-referenced against public, general-audience creative-spec
 *   round-ups for social vertical/feed video (9:16, 1:1, 4:5; ~15s
 *   recommended story/feed length) — these are platform conventions rather
 *   than an IAB standard, and are labelled `social` + "approximate" below.
 *
 * Where a number below is a firm, cited spec it is marked "confirmed" in its
 * comment. Where it reflects a range, a recommendation, or a cross-platform
 * convention rather than one precise published number, it is marked
 * "approximate" and the validator is intentionally more lenient around it.
 */

export type AdFormatCategory = 'ctv' | 'display' | 'social';

export type SpecStatus = 'fail' | 'pass' | 'warn';

export interface AdFormat {
  /** Aspect ratio target for formats that aren't a fixed pixel size (video, some social). */
  aspectRatio?: { h: number; w: number };
  category: AdFormatCategory;
  /** Fixed discrete durations this format is normally bought in, e.g. [6, 15, 30]. */
  durationTargetsSec?: number[];
  /** Fixed pixel height, for fixed-size display units. */
  height?: number;
  id: string;
  label: string;
  /** Soft duration ceiling for formats specified as "up to Ns" rather than fixed buckets. */
  maxDurationSec?: number;
  /** Max initial file size, for the few formats with a commonly-cited cap (display only). */
  maxFileSizeKB?: number;
  /** Source citation / caveats shown to the user. */
  notes: string;
  /** Fixed pixel width, for fixed-size display units. */
  width?: number;
}

export interface AssetInput {
  /** Duration in seconds, for video assets. */
  duration?: number;
  height?: number;
  sizeBytes?: number;
  width?: number;
}

export interface ValidationResult {
  messages: string[];
  status: SpecStatus;
}

// ---------------------------------------------------------------------------
// Tolerance constants.
//
// These bands are an engineering judgment call to turn a binary "exact
// match or not" into a friendlier pass/warn/fail — they are NOT themselves
// cited IAB numbers. Kept conservative (narrow "pass" bands) on purpose.
// ---------------------------------------------------------------------------

/** Relative per-dimension slack (±5%) that still counts as a "warn" near-miss on a fixed-size unit. */
const PIXEL_WARN_TOLERANCE_RATIO = 0.05;

/** Relative aspect-ratio deviation that still counts as an exact "pass". */
const ASPECT_RATIO_PASS_TOLERANCE = 0.02;

/** Relative aspect-ratio deviation that still counts as a "warn" rather than a "fail". */
const ASPECT_RATIO_WARN_TOLERANCE = 0.12;

/** Seconds of slack around a fixed duration bucket (e.g. :15s) that still counts as "pass". */
const DURATION_PASS_TOLERANCE_SEC = 1;

/** Seconds of slack around a fixed duration bucket that still counts as "warn". */
const DURATION_WARN_TOLERANCE_SEC = 4;

/** Factor over a soft duration ceiling that still counts as "warn" rather than "fail". */
const SOFT_DURATION_WARN_FACTOR = 1.3;

/** Factor over the cited max file size that still counts as "warn" rather than "fail". */
const FILE_SIZE_WARN_FACTOR = 1.5;

export const AD_FORMATS: AdFormat[] = [
  // --- Display (IAB New Standard Ad Unit Portfolio v1.1, July 2017 — confirmed) ---
  {
    category: 'display',
    height: 250,
    id: 'display-medium-rectangle',
    label: 'Medium Rectangle (300×250)',
    maxFileSizeKB: 150,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). The single most widely supported display size. Max initial file size is the common IAB/LEAN guidance of 150KB (approximate — individual exchanges vary).',
    width: 300,
  },
  {
    category: 'display',
    height: 90,
    id: 'display-leaderboard',
    label: 'Leaderboard (728×90)',
    maxFileSizeKB: 150,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). Max file size is approximate (LEAN guidance).',
    width: 728,
  },
  {
    category: 'display',
    height: 90,
    id: 'display-super-leaderboard',
    label: 'Super Leaderboard / Pushdown (970×90)',
    maxFileSizeKB: 150,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). Max file size is approximate (LEAN guidance).',
    width: 970,
  },
  {
    category: 'display',
    height: 250,
    id: 'display-billboard',
    label: 'Billboard (970×250)',
    maxFileSizeKB: 200,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). Max file size is approximate (LEAN guidance).',
    width: 970,
  },
  {
    category: 'display',
    height: 1050,
    id: 'display-portrait',
    label: 'Portrait (300×1050)',
    maxFileSizeKB: 200,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). Max file size is approximate (LEAN guidance).',
    width: 300,
  },
  {
    category: 'display',
    height: 600,
    id: 'display-skyscraper',
    label: 'Skyscraper (160×600)',
    maxFileSizeKB: 150,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). Max file size is approximate (LEAN guidance).',
    width: 160,
  },
  {
    category: 'display',
    height: 50,
    id: 'display-smartphone-banner',
    label: 'Smartphone Banner (320×50)',
    maxFileSizeKB: 50,
    notes:
      'IAB New Standard Ad Unit Portfolio, v1.1 (2017). Max file size is approximate (LEAN guidance).',
    width: 320,
  },
  // --- Display legacy sizes (pre-2017 IAB units, not in the current 7-unit
  // portfolio, but still extremely commonly trafficked in 2026 — confirmed
  // via multiple cross-referenced 2026 programmatic-usage round-ups) ---
  {
    category: 'display',
    height: 600,
    id: 'display-half-page-legacy',
    label: 'Half Page (300×600) — legacy, still widely supported',
    maxFileSizeKB: 200,
    notes:
      'Legacy IAB unit, superseded in the 2017 portfolio but still one of the five highest-volume sizes on ad servers and SSPs in 2026.',
    width: 300,
  },
  {
    category: 'display',
    height: 100,
    id: 'display-large-mobile-banner-legacy',
    label: 'Large Mobile Banner (320×100) — legacy, still widely supported',
    maxFileSizeKB: 50,
    notes:
      'Legacy IAB unit, not in the 2017 portfolio, but still commonly accepted by mobile ad servers in 2026.',
    width: 320,
  },

  // --- CTV / digital video (IAB Tech Lab, Ad Format Guidelines for Digital
  // Video and CTV, v2.0 — confirmed) ---
  {
    aspectRatio: { h: 9, w: 16 },
    category: 'ctv',
    durationTargetsSec: [6],
    id: 'ctv-16-9-bumper-6s',
    label: 'CTV Bumper — 16:9, 6s',
    notes:
      'IAB Tech Lab Digital Video & CTV Ad Format Guidelines v2.0: 16:9, H.264 High Profile required, 1920×1080 baseline (4K accepted). Short-form bumper spots are commonly 6s.',
  },
  {
    aspectRatio: { h: 9, w: 16 },
    category: 'ctv',
    durationTargetsSec: [15],
    id: 'ctv-16-9-standard-15s',
    label: 'CTV Standard — 16:9, 15s',
    notes:
      'IAB Tech Lab Digital Video & CTV Ad Format Guidelines v2.0: 16:9, H.264 High Profile required, 1920×1080 baseline (4K accepted). 15s is one of the most commonly bought CTV durations.',
  },
  {
    aspectRatio: { h: 9, w: 16 },
    category: 'ctv',
    durationTargetsSec: [20],
    id: 'ctv-16-9-20s',
    label: 'CTV — 16:9, 20s',
    notes:
      'IAB Tech Lab Digital Video & CTV Ad Format Guidelines v2.0 lists 20s among the standard linear spot lengths.',
  },
  {
    aspectRatio: { h: 9, w: 16 },
    category: 'ctv',
    durationTargetsSec: [30],
    id: 'ctv-16-9-standard-30s',
    label: 'CTV Standard — 16:9, 30s',
    notes:
      'IAB Tech Lab Digital Video & CTV Ad Format Guidelines v2.0: 16:9, H.264 High Profile required, 1920×1080 baseline (4K accepted). 30s is one of the most commonly bought CTV durations.',
  },

  // --- Social vertical / feed (cross-platform convention, approximate —
  // not an IAB number) ---
  {
    aspectRatio: { h: 1, w: 1 },
    category: 'social',
    id: 'social-feed-square',
    label: 'Social Feed — Square (1:1)',
    maxDurationSec: 60,
    notes:
      'Approximate: square (1:1) feed placements are a common cross-platform convention, not a single published IAB spec. 60s is a generous feed-length ceiling; shorter performs better in most public platform guidance.',
  },
  {
    aspectRatio: { h: 5, w: 4 },
    category: 'social',
    id: 'social-feed-vertical',
    label: 'Social Feed — Vertical (4:5)',
    maxDurationSec: 60,
    notes:
      'Approximate: 4:5 vertical feed is a common cross-platform convention (Meta feed placements), not a single published IAB spec.',
  },
  {
    aspectRatio: { h: 16, w: 9 },
    category: 'social',
    id: 'social-story-vertical',
    label: 'Social Story / Reel — Full Vertical (9:16)',
    maxDurationSec: 15,
    notes:
      'Approximate: 1080×1920, 9:16 is the common cross-platform baseline for Stories/Reels-style placements. 15s is the commonly recommended length; most platforms allow longer but recommend 15s or less.',
  },
];

const clampRatio = (w: number, h: number): number | null => {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
};

const describeRatio = (w: number, h: number): string => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(w), Math.round(h)) || 1;
  return `${Math.round(w) / d}:${Math.round(h) / d}`;
};

const worstStatus = (a: SpecStatus, b: SpecStatus): SpecStatus => {
  const order: SpecStatus[] = ['pass', 'warn', 'fail'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
};

interface DimensionCheck {
  messages: string[];
  status: SpecStatus;
}

const checkFixedPixelDimensions = (
  asset: AssetInput,
  format: Required<Pick<AdFormat, 'width' | 'height'>>,
): DimensionCheck => {
  const { width, height } = asset;
  if (width === undefined || height === undefined) {
    return {
      messages: [`Dimensions unknown — can't verify against ${format.width}×${format.height}.`],
      status: 'warn',
    };
  }

  if (width === format.width && height === format.height) {
    return { messages: [`Exact match: ${width}×${height}.`], status: 'pass' };
  }

  const widthDelta = Math.abs(width - format.width) / format.width;
  const heightDelta = Math.abs(height - format.height) / format.height;

  if (widthDelta <= PIXEL_WARN_TOLERANCE_RATIO && heightDelta <= PIXEL_WARN_TOLERANCE_RATIO) {
    return {
      messages: [
        `Close but not exact: ${width}×${height} vs. target ${format.width}×${format.height}.`,
      ],
      status: 'warn',
    };
  }

  return {
    messages: [`Size mismatch: ${width}×${height} vs. target ${format.width}×${format.height}.`],
    status: 'fail',
  };
};

const checkAspectRatio = (
  asset: AssetInput,
  aspectRatio: { h: number; w: number },
): DimensionCheck => {
  const { width, height } = asset;
  if (width === undefined || height === undefined) {
    return {
      messages: [`Dimensions unknown — can't verify against ${aspectRatio.w}:${aspectRatio.h}.`],
      status: 'warn',
    };
  }

  const actual = clampRatio(width, height);
  const target = clampRatio(aspectRatio.w, aspectRatio.h);
  if (actual === null || target === null) {
    return {
      messages: ['Invalid dimensions — could not compute an aspect ratio.'],
      status: 'fail',
    };
  }

  const delta = Math.abs(actual - target) / target;
  const actualLabel = describeRatio(width, height);
  const targetLabel = `${aspectRatio.w}:${aspectRatio.h}`;

  if (delta <= ASPECT_RATIO_PASS_TOLERANCE) {
    return {
      messages: [`Aspect ratio matches ${targetLabel} (asset is ${actualLabel}).`],
      status: 'pass',
    };
  }
  if (delta <= ASPECT_RATIO_WARN_TOLERANCE) {
    return {
      messages: [
        `Aspect ratio is close to ${targetLabel} but not exact (asset is ${actualLabel}).`,
      ],
      status: 'warn',
    };
  }
  return {
    messages: [`Aspect ratio does not match ${targetLabel} (asset is ${actualLabel}).`],
    status: 'fail',
  };
};

const checkDuration = (asset: AssetInput, format: AdFormat): DimensionCheck | null => {
  if (!format.durationTargetsSec && !format.maxDurationSec) return null;

  if (asset.duration === undefined) {
    return {
      messages: [`Duration unknown — can't verify the target duration for ${format.label}.`],
      status: 'warn',
    };
  }

  if (format.durationTargetsSec && format.durationTargetsSec.length > 0) {
    const closest = format.durationTargetsSec.reduce((best, candidate) =>
      Math.abs(candidate - asset.duration!) < Math.abs(best - asset.duration!) ? candidate : best,
    );
    const delta = Math.abs(closest - asset.duration);

    if (delta <= DURATION_PASS_TOLERANCE_SEC) {
      return {
        messages: [`Duration ${asset.duration}s matches the ${closest}s target.`],
        status: 'pass',
      };
    }
    if (delta <= DURATION_WARN_TOLERANCE_SEC) {
      return {
        messages: [`Duration ${asset.duration}s is close to the ${closest}s target but not exact.`],
        status: 'warn',
      };
    }
    return {
      messages: [`Duration ${asset.duration}s is far from the nearest target (${closest}s).`],
      status: 'fail',
    };
  }

  if (format.maxDurationSec) {
    if (asset.duration <= format.maxDurationSec) {
      return {
        messages: [
          `Duration ${asset.duration}s is within the ${format.maxDurationSec}s guideline.`,
        ],
        status: 'pass',
      };
    }
    if (asset.duration <= format.maxDurationSec * SOFT_DURATION_WARN_FACTOR) {
      return {
        messages: [
          `Duration ${asset.duration}s slightly exceeds the ${format.maxDurationSec}s guideline.`,
        ],
        status: 'warn',
      };
    }
    return {
      messages: [
        `Duration ${asset.duration}s well exceeds the ${format.maxDurationSec}s guideline.`,
      ],
      status: 'fail',
    };
  }

  return null;
};

/**
 * File size is part of `AssetInput` for completeness (and the few display
 * formats above do cite an approximate max), but the app's own generation
 * data model doesn't currently track asset byte size — so when it's absent
 * this check is skipped entirely rather than warned about, unlike the
 * dimension/duration checks above which are the feature's actual core data.
 */
const checkFileSize = (asset: AssetInput, format: AdFormat): DimensionCheck | null => {
  if (!format.maxFileSizeKB || asset.sizeBytes === undefined) return null;

  const sizeKB = asset.sizeBytes / 1024;
  if (sizeKB <= format.maxFileSizeKB) {
    return {
      messages: [
        `File size ${Math.round(sizeKB)}KB is within the ${format.maxFileSizeKB}KB guideline.`,
      ],
      status: 'pass',
    };
  }
  if (sizeKB <= format.maxFileSizeKB * FILE_SIZE_WARN_FACTOR) {
    return {
      messages: [
        `File size ${Math.round(sizeKB)}KB slightly exceeds the ${format.maxFileSizeKB}KB guideline.`,
      ],
      status: 'warn',
    };
  }
  return {
    messages: [
      `File size ${Math.round(sizeKB)}KB well exceeds the ${format.maxFileSizeKB}KB guideline.`,
    ],
    status: 'fail',
  };
};

/**
 * Validate one generated asset against one named ad format.
 *
 * Missing fields (no width/height, no duration on a video format) never
 * throw — they downgrade that check to a 'warn' with an explanatory
 * message instead, since the validator should degrade gracefully rather
 * than block the UI.
 */
export const validateAsset = (asset: AssetInput, format: AdFormat): ValidationResult => {
  const messages: string[] = [];
  let status: SpecStatus = 'pass';

  const dimensionCheck =
    format.width !== undefined && format.height !== undefined
      ? checkFixedPixelDimensions(asset, { height: format.height, width: format.width })
      : format.aspectRatio
        ? checkAspectRatio(asset, format.aspectRatio)
        : null;

  if (dimensionCheck) {
    messages.push(...dimensionCheck.messages);
    status = worstStatus(status, dimensionCheck.status);
  }

  const durationCheck = checkDuration(asset, format);
  if (durationCheck) {
    messages.push(...durationCheck.messages);
    status = worstStatus(status, durationCheck.status);
  }

  const fileSizeCheck = checkFileSize(asset, format);
  if (fileSizeCheck) {
    messages.push(...fileSizeCheck.messages);
    status = worstStatus(status, fileSizeCheck.status);
  }

  if (messages.length === 0) {
    messages.push('No checkable specs on this format.');
  }

  return { messages, status };
};

export interface FormatMatch {
  format: AdFormat;
  result: ValidationResult;
}

/**
 * Automatically find every format this asset is close to (pass or warn).
 * Formats the asset is way off from are omitted — they're only surfaced as
 * an explicit 'fail' when the user deliberately picks that target format
 * via `validateAsset`.
 */
export const matchBestFormats = (
  asset: AssetInput,
  formats: AdFormat[] = AD_FORMATS,
): FormatMatch[] => {
  return formats
    .map((format) => ({ format, result: validateAsset(asset, format) }))
    .filter(({ result }) => result.status !== 'fail')
    .sort((a, b) => {
      const order: SpecStatus[] = ['pass', 'warn', 'fail'];
      return order.indexOf(a.result.status) - order.indexOf(b.result.status);
    });
};
