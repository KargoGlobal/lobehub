/**
 * Storyboard — chains several independent MiniMax H3 Max generations into one
 * continuous multi-shot narrative (e.g. three sequential 8s clips = a 24s
 * ad). H3 Max has no multi-clip API: every clip is its own fal call, billed
 * on its own. Camera Director already allocates a timed shot list *within*
 * one clip's duration budget (see `../CameraDirector/compiler`); this module
 * is the orchestration layer the gap calls for on top of that primitive —
 * turning an ordered list of shots into N separate, fully-compiled
 * `VideoGenerationRequest`-shaped params the caller submits together.
 *
 * Continuity approach — prompt-only, not frame-chained:
 * fal does publish a real `fal-ai/ffmpeg-api/extract-frame` endpoint that can
 * return a clip's last frame (`frame_type: "last"`), verified against its
 * live OpenAPI schema. It isn't used here because `createVideo` only enqueues
 * an async generation batch — the finished clip shows up later through the
 * feed's own polling, not as a value the submit call returns. Chaining a real
 * last frame into the next shot's start frame would mean blocking "Generate
 * storyboard" on every clip finishing in turn (minutes per shot, each with
 * its own retry/failure handling) instead of submitting the whole plan at
 * once the way Auto-animate does. That trade isn't worth it for an M-effort
 * orchestration layer, so continuity is authored into the text instead: every
 * shot's compiled prompt opens with an explicit "shot X of Y" line that
 * recaps the shot before it (and previews the shot after it), the same way
 * Camera Director already relies on prose continuity between shot blocks
 * inside a single clip.
 *
 * Pure module: no React, no store, so the shot-list → requests → continuity
 * pipeline can be unit-tested exhaustively.
 */
import {
  type CameraMove,
  type CameraSpeed,
  compilePlan,
  createDefaultPlan,
  DIRECTOR_DURATION_MAX,
  DIRECTOR_DURATION_MIN,
  type DirectorPlan,
  type DirectorTemplate,
  type Framing,
  type Placement,
  PLACEMENT_ASPECT_RATIO,
  type ReferenceMode,
  type RotationDegrees,
  type RotationDirection,
} from '../CameraDirector/compiler';

export const MIN_STORYBOARD_SHOTS = 2;
/**
 * The competitive report cites Higgsfield Cinema Studio and Kling chaining up
 * to 6 shots — that number isn't reproduced as a feature requirement here,
 * it's used only to pick a sane, independently-justifiable ceiling: each shot
 * is a real, separately-billed fal call, so more than a handful per
 * storyboard risks a lot of spend on a single click.
 */
export const MAX_STORYBOARD_SHOTS = 6;

/** fal list price per second, used only for the modal's rough cost estimate. */
const H3_MAX_RATE_PER_SECOND = 0.16; // 1080P — packages/model-bank/src/aiModels/fal.ts
const H3_REFERENCE_RATE_PER_SECOND = 0.13; // 2K default, same model card

export const STORYBOARD_MODELS = {
  reference: 'minimax/h3/reference-to-video',
  startFrame: 'minimax/h3-max',
  text: 'minimax/h3-max',
} as const;

export interface StoryboardShot {
  camera: CameraMove;
  /** Only used when `camera === 'orbit'`. */
  degrees: RotationDegrees;
  direction: RotationDirection;
  /** Seconds for this clip alone (Camera Director's 5–15s single-clip range). */
  duration: number;
  framing: Framing;
  /**
   * Free-text narrative beat for this shot, e.g. "She lifts the jacket off
   * the rack and turns it toward camera." Used (trimmed) as the continuity
   * recap in this shot's and the next shot's compiled prompt. Falls back to
   * `subjectAction` when left blank.
   */
  narrative: string;
  speed: CameraSpeed;
  /** What the subject does during the shot — written as what the camera sees. */
  subjectAction: string;
}

export interface StoryboardPlan {
  audio: DirectorPlan['audio'];
  /** Product only: the detail to feature (logo, cap, texture...). */
  detail: string;
  /** Set / surface / environment, shared across every shot for continuity. */
  environment: string;
  /** Whether a reference/start-frame image is attached in the workspace. */
  hasStartFrame: boolean;
  lighting: string;
  /** Brand colours / materials, shared across every shot. */
  palette: string;
  placement: Placement;
  /** How the attached image is used. Defaults to `startFrame`. */
  referenceMode?: ReferenceMode;
  shots: StoryboardShot[];
  /** Product description, or the 3D form for a background. Shared across shots. */
  subject: string;
  /** On-model only: who wears / uses the product. */
  talent: string;
  template: DirectorTemplate;
}

const clampShotDuration = (value: number): number => {
  if (!Number.isFinite(value)) return DIRECTOR_DURATION_MIN;
  return Math.min(DIRECTOR_DURATION_MAX, Math.max(DIRECTOR_DURATION_MIN, Math.round(value)));
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const ALTERNATING_CAMERA: CameraMove[] = ['static', 'orbit', 'dolly-in', 'truck-right'];

export const createStoryboardShot = (template: DirectorTemplate, index: number): StoryboardShot => {
  const camera = ALTERNATING_CAMERA[index % ALTERNATING_CAMERA.length];
  const subjectAction =
    template === 'onModel'
      ? 'The talent holds a natural pose with subtle, lifelike motion; the product stays fully visible.'
      : template === 'background3d'
        ? 'The form holds still, centred in frame.'
        : 'The product holds still, label facing the camera.';

  return {
    camera,
    degrees: 180,
    direction: 'clockwise',
    duration: 8,
    framing: 'medium',
    narrative: '',
    speed: 'slow',
    subjectAction,
  };
};

export const createDefaultStoryboardPlan = (
  template: DirectorTemplate = 'product3d',
): StoryboardPlan => {
  const base = createDefaultPlan(template);
  return {
    audio: base.audio,
    detail: base.detail,
    environment: base.environment,
    hasStartFrame: base.hasStartFrame,
    lighting: base.lighting,
    palette: base.palette,
    placement: base.placement,
    referenceMode: base.referenceMode,
    shots: [createStoryboardShot(template, 0), createStoryboardShot(template, 1)],
    subject: base.subject,
    talent: base.talent,
    template,
  };
};

// ---------------------------------------------------------------------------
// Reordering — plain array helper so add/remove/move-up/move-down stay pure
// ---------------------------------------------------------------------------

export const reorderShots = <T>(items: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const validateStoryboardPlan = (plan: StoryboardPlan): string[] => {
  const errors: string[] = [];
  if (plan.shots.length < MIN_STORYBOARD_SHOTS) {
    errors.push(`Use at least ${MIN_STORYBOARD_SHOTS} shots to build a storyboard.`);
  }
  if (plan.shots.length > MAX_STORYBOARD_SHOTS) {
    errors.push(
      `Use at most ${MAX_STORYBOARD_SHOTS} shots — each shot is a separate, separately-billed clip.`,
    );
  }
  return errors;
};

// ---------------------------------------------------------------------------
// Continuity prose
// ---------------------------------------------------------------------------

const summarizeForContinuity = (shot: StoryboardShot): string => {
  const text = (shot.narrative.trim() || shot.subjectAction.trim()).replaceAll(/\s+/g, ' ');
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
};

export const buildSequenceLine = (
  shots: StoryboardShot[],
  index: number,
  totalDuration: number,
): string => {
  const total = shots.length;
  const parts = [
    `Sequence: this is shot ${index + 1} of ${total} in one continuous ${totalDuration}s narrative; ` +
      `the shots play back to back in order with no cuts, dissolves or fades between clips.`,
    index > 0
      ? `Continuing directly from shot ${index}, where ${summarizeForContinuity(shots[index - 1])}`
      : 'This is the opening shot.',
    index < total - 1
      ? `This shot leads directly into shot ${index + 2}, where ${summarizeForContinuity(shots[index + 1])}`
      : 'This is the final shot — bring the sequence to a clean close.',
  ];
  return parts.join(' ');
};

// ---------------------------------------------------------------------------
// Compile — shot list -> fully-resolved, per-shot generation requests
// ---------------------------------------------------------------------------

export interface StoryboardRequestParams {
  aspectRatio?: string;
  duration: number;
  imageUrl?: string;
  imageUrls?: string[];
  prompt: string;
  promptExtend: string;
  resolution: string;
  seed: number | null;
}

export interface StoryboardRequest {
  model: string;
  params: StoryboardRequestParams;
  provider: 'fal';
}

export interface StoryboardCompiledShot {
  directorPlan: DirectorPlan;
  duration: number;
  errors: string[];
  index: number;
  prompt: string;
  request: StoryboardRequest;
  warnings: string[];
}

export interface StoryboardCompileResult {
  errors: string[];
  shots: StoryboardCompiledShot[];
  totalCost: number;
  totalDuration: number;
  warnings: string[];
}

export interface StoryboardCompileContext {
  /** Pre-compiled brand line, see BrandKit `compileBrandPreamble`. */
  brand?: string;
  /** Product photo attached in the workspace (full URL), if any. */
  imageUrl?: string | null;
  /** Per-shot seeds; supplied by the caller so runs are reproducible. */
  seeds?: (number | null)[];
}

const modeForPlan = (plan: StoryboardPlan): keyof typeof STORYBOARD_MODELS => {
  if (!plan.hasStartFrame) return 'text';
  return plan.referenceMode === 'reference' ? 'reference' : 'startFrame';
};

const resolutionForMode = (mode: keyof typeof STORYBOARD_MODELS): string =>
  mode === 'reference' ? '2K' : '1080P';

const rateForResolution = (resolution: string) =>
  resolution === '2K' ? H3_REFERENCE_RATE_PER_SECOND : H3_MAX_RATE_PER_SECOND;

const STYLE_PLACEHOLDER: Record<DirectorTemplate, DirectorPlan['style']> = {
  background3d: 'turntable',
  onModel: 'walkAndTurn',
  product3d: 'turntable360',
};

/** One storyboard shot -> the single-shot Camera Director plan that compiles it. */
const toDirectorPlan = (plan: StoryboardPlan, shot: StoryboardShot): DirectorPlan => ({
  audio: plan.audio,
  copySafeZone: false,
  detail: plan.detail,
  duration: clampShotDuration(shot.duration),
  environment: plan.environment,
  hasStartFrame: plan.hasStartFrame,
  lighting: plan.lighting,
  palette: plan.palette,
  placement: plan.placement,
  referenceMode: plan.referenceMode,
  // Each shot is its own clip — loop closure is a single-clip concept.
  seamlessLoop: false,
  shots: [
    {
      camera: shot.camera,
      degrees: shot.degrees,
      direction: shot.direction,
      framing: shot.framing,
      speed: shot.speed,
      subjectAction: shot.subjectAction,
      weight: 1,
    },
  ],
  style: STYLE_PLACEHOLDER[plan.template],
  subject: plan.subject,
  talent: plan.talent,
  template: plan.template,
});

/**
 * Compile an ordered storyboard into one fully-resolved generation request
 * per shot, each prompt carrying an explicit sequence/continuity line plus
 * the Camera Director grammar for that one shot.
 */
export const compileStoryboard = (
  plan: StoryboardPlan,
  ctx: StoryboardCompileContext = {},
): StoryboardCompileResult => {
  const topErrors = validateStoryboardPlan(plan);
  const mode = modeForPlan(plan);
  const model = STORYBOARD_MODELS[mode];
  const resolution = resolutionForMode(mode);
  const totalDuration = plan.shots.reduce((sum, s) => sum + clampShotDuration(s.duration), 0);

  const shots: StoryboardCompiledShot[] = plan.shots.map((shot, index) => {
    const directorPlan = toDirectorPlan(plan, shot);
    const seed = ctx.seeds?.[index] ?? null;
    const compiled = compilePlan(directorPlan, { brand: ctx.brand, resolution, seed });
    const prompt = `${buildSequenceLine(plan.shots, index, totalDuration)}\n\n${compiled.prompt}`;

    const params: StoryboardRequestParams = {
      duration: directorPlan.duration,
      prompt,
      promptExtend: 'quality',
      resolution,
      seed,
    };
    if (mode === 'text') params.aspectRatio = PLACEMENT_ASPECT_RATIO[plan.placement];
    if (mode === 'startFrame' && ctx.imageUrl) params.imageUrl = ctx.imageUrl;
    if (mode === 'reference' && ctx.imageUrl) {
      params.imageUrls = [ctx.imageUrl];
      params.aspectRatio = PLACEMENT_ASPECT_RATIO[plan.placement];
    }

    return {
      directorPlan,
      duration: directorPlan.duration,
      errors: compiled.errors,
      index,
      prompt,
      request: { model, params, provider: 'fal' },
      warnings: compiled.warnings,
    };
  });

  const errors = [
    ...topErrors,
    ...shots.flatMap((s) => s.errors.map((e) => `Shot ${s.index + 1}: ${e}`)),
  ];
  const warnings = shots.flatMap((s) => s.warnings.map((w) => `Shot ${s.index + 1}: ${w}`));
  const totalCost = totalDuration * rateForResolution(resolution);

  return { errors, shots, totalCost, totalDuration, warnings };
};
