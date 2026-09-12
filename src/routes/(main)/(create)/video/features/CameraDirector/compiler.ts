/**
 * Camera Director — compiles a structured, validated MiniMax H3 prompt.
 *
 * H3 / H3 Max have no camera API: camera control lives in the prompt. The
 * reliable grammar (per MiniMax's guidance and community testing) is:
 *   references → subject/scene → timestamped shot blocks → camera → audio → constraints
 * with ONE camera move per shot, explicit speed, standard filmmaking vocabulary,
 * no vague words ("cinematic", "dynamic"), and blocks that add up to the duration.
 *
 * This module is pure (no React, no store) so it can be unit-tested exhaustively.
 */

export type DirectorTemplate = 'background3d' | 'product3d' | 'onModel';

/**
 * How the attached product image reaches the model:
 * - `startFrame`: image-to-video, the photo is literally frame one.
 * - `reference`: reference-to-video, the photo is "Image 1" the model must match.
 */
export type ReferenceMode = 'startFrame' | 'reference';

export type Placement = 'landscape' | 'vertical' | 'square';

export const PLACEMENT_ASPECT_RATIO: Record<Placement, '16:9' | '9:16' | '1:1'> = {
  landscape: '16:9',
  square: '1:1',
  vertical: '9:16',
};

export type CameraSpeed = 'very slow' | 'slow' | 'moderate' | 'fast';
export const CAMERA_SPEEDS: CameraSpeed[] = ['very slow', 'slow', 'moderate', 'fast'];

export type RotationDirection = 'clockwise' | 'counter-clockwise';
export type RotationDegrees = 90 | 180 | 360;
export const ROTATION_DEGREES: RotationDegrees[] = [90, 180, 360];

export type Framing = 'wide' | 'medium' | 'medium close-up' | 'close-up' | 'extreme close-up';
export const FRAMINGS: Framing[] = [
  'wide',
  'medium',
  'medium close-up',
  'close-up',
  'extreme close-up',
];

export type CameraMove =
  | 'static'
  | 'orbit'
  | 'dolly-in'
  | 'dolly-out'
  | 'crane-up'
  | 'crane-down'
  | 'truck-left'
  | 'truck-right'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'zoom-in'
  | 'zoom-out';

export interface CameraMoveMeta {
  id: CameraMove;
  label: string;
  /** Orbit is the only move that takes degrees/direction. */
  usesRotation?: boolean;
}

export const CAMERA_MOVES: CameraMoveMeta[] = [
  { id: 'static', label: 'Locked off (static)' },
  { id: 'orbit', label: 'Orbit around subject', usesRotation: true },
  { id: 'dolly-in', label: 'Dolly in (push toward subject)' },
  { id: 'dolly-out', label: 'Dolly out (pull back)' },
  { id: 'crane-up', label: 'Crane up' },
  { id: 'crane-down', label: 'Crane down' },
  { id: 'truck-left', label: 'Truck left' },
  { id: 'truck-right', label: 'Truck right' },
  { id: 'pan-left', label: 'Pan left' },
  { id: 'pan-right', label: 'Pan right' },
  { id: 'tilt-up', label: 'Tilt up' },
  { id: 'tilt-down', label: 'Tilt down' },
  { id: 'zoom-in', label: 'Zoom in' },
  { id: 'zoom-out', label: 'Zoom out' },
];

export interface Shot {
  /** Single camera move for this shot (H3 gets confused by stacked moves). */
  camera: CameraMove;
  /** Only used when `camera === 'orbit'`. */
  degrees: RotationDegrees;
  direction: RotationDirection;
  framing: Framing;
  speed: CameraSpeed;
  /** What the subject does during the shot — written as what the camera sees. */
  subjectAction: string;
  /** Relative weight used to split the total duration between shots. */
  weight: number;
}

export type BackgroundStyle = 'orbit' | 'turntable' | 'drift' | 'tunnel';
export type ProductStyle =
  'turntable360' | 'orbit360' | 'heroArc' | 'orbitThenDetail' | 'topDownReveal' | 'floatSpin';
export type OnModelStyle = 'walkAndTurn' | 'heroOrbit' | 'detailReveal' | 'lifestyleHold';

export interface StyleMeta<T extends string> {
  description: string;
  id: T;
  label: string;
}

export const BACKGROUND_STYLES: StyleMeta<BackgroundStyle>[] = [
  {
    description: 'Camera circles a centred 3D form. Form stays still.',
    id: 'orbit',
    label: 'Orbit',
  },
  {
    description: 'The 3D form rotates in place. Camera locked off. Most reliable loop.',
    id: 'turntable',
    label: 'Turntable',
  },
  {
    description: 'Slow lateral drift with parallax through layered shapes.',
    id: 'drift',
    label: 'Parallax drift',
  },
  {
    description: 'Continuous push forward through a repeating structure.',
    id: 'tunnel',
    label: 'Endless tunnel',
  },
];

export const PRODUCT_STYLES: StyleMeta<ProductStyle>[] = [
  {
    description: 'Product rotates a full 360° on a turntable. Camera locked at eye level.',
    id: 'turntable360',
    label: 'Turntable 360°',
  },
  {
    description: 'Camera orbits a full circle around the stationary product.',
    id: 'orbit360',
    label: 'Orbit 360°',
  },
  {
    description: 'Half-orbit rising from a low angle to eye level. Dramatic hero shot.',
    id: 'heroArc',
    label: 'Hero arc',
  },
  {
    description: 'Orbit 180°, then dolly in to the key detail. Two shots.',
    id: 'orbitThenDetail',
    label: 'Orbit → detail',
  },
  {
    description: 'Crane down from top-down while the product turns 90°, then hold. Two shots.',
    id: 'topDownReveal',
    label: 'Top-down reveal',
  },
  {
    description: 'Product levitates and spins slowly. Camera locked off.',
    id: 'floatSpin',
    label: 'Float & spin',
  },
];

export const ON_MODEL_STYLES: StyleMeta<OnModelStyle>[] = [
  {
    description: 'Talent walks toward camera, stops and does a slow full turn. Camera locked.',
    id: 'walkAndTurn',
    label: 'Walk & turn',
  },
  {
    description: 'Talent stands still while the camera orbits 180° at eye level.',
    id: 'heroOrbit',
    label: 'Hero orbit',
  },
  {
    description: 'Slow push-in from a medium shot to the product detail on the talent.',
    id: 'detailReveal',
    label: 'Detail reveal',
  },
  {
    description: 'Talent holds a natural pose with subtle motion. Camera trucks slowly.',
    id: 'lifestyleHold',
    label: 'Lifestyle hold',
  },
];

export type AudioMode = 'silent' | 'ambient';

export interface DirectorPlan {
  audio: AudioMode;
  /** Background only: keep the centre visually quiet for headline copy. */
  copySafeZone: boolean;
  /** Product only: the detail to feature (logo, cap, texture...). */
  detail: string;
  duration: number;
  /** Set / surface / environment. */
  environment: string;
  /** Whether a start frame is attached in the workspace. */
  hasStartFrame: boolean;
  lighting: string;
  /** Brand colours / materials. */
  palette: string;
  placement: Placement;
  /** How the attached image is used. Defaults to `startFrame`. */
  referenceMode?: ReferenceMode;
  /** Ask for a loop where the final frame matches the opening frame. */
  seamlessLoop: boolean;
  shots: Shot[];
  style: BackgroundStyle | ProductStyle | OnModelStyle;
  /** Product description, or the 3D form for a background. */
  subject: string;
  /** On-model only: who wears / uses the product. */
  talent: string;
  template: DirectorTemplate;
}

export const DIRECTOR_DURATION_MIN = 5;
export const DIRECTOR_DURATION_MAX = 15;
/** Shots shorter than this produce poor results on H3. */
export const MIN_SHOT_SECONDS = 3;
export const MAX_SHOTS = 4;

/** Words that reliably degrade H3 output or add nothing. */
export const VAGUE_TERMS = [
  'cinematic',
  'dynamic',
  'viral',
  'high quality',
  'high-quality',
  '4k',
  '8k',
  'masterpiece',
  'trending',
];

// ---------------------------------------------------------------------------
// Shot presets per style
// ---------------------------------------------------------------------------

const shot = (partial: Partial<Shot> & Pick<Shot, 'camera' | 'subjectAction'>): Shot => ({
  degrees: 360,
  direction: 'clockwise',
  framing: 'medium',
  speed: 'slow',
  weight: 1,
  ...partial,
});

export const buildShotsForStyle = (
  template: DirectorTemplate,
  style: BackgroundStyle | ProductStyle | OnModelStyle,
): Shot[] => {
  if (template === 'onModel') {
    switch (style as OnModelStyle) {
      case 'walkAndTurn': {
        return [
          shot({
            camera: 'static',
            framing: 'wide',
            subjectAction:
              'The talent walks toward the camera at a relaxed pace, stops at a medium-wide distance, then turns a slow, full 360° on the spot so the product is seen from every side, ending facing the camera.',
          }),
        ];
      }
      case 'heroOrbit': {
        return [
          shot({
            camera: 'orbit',
            degrees: 180,
            framing: 'medium',
            subjectAction:
              'The talent stands still in a relaxed, natural pose with only subtle breathing and weight shifts; the product stays fully visible.',
          }),
        ];
      }
      case 'detailReveal': {
        return [
          shot({
            camera: 'dolly-in',
            framing: 'medium',
            subjectAction:
              'The talent holds a natural pose and angles the product toward the camera so the featured detail is clearly visible by the end of the shot.',
          }),
        ];
      }
      case 'lifestyleHold': {
        return [
          shot({
            camera: 'truck-right',
            framing: 'medium',
            speed: 'very slow',
            subjectAction:
              'The talent holds a natural, candid pose with small, lifelike movements; the product stays in frame and undistorted.',
          }),
        ];
      }
      default: {
        return [];
      }
    }
  }

  if (template === 'background3d') {
    switch (style as BackgroundStyle) {
      case 'orbit': {
        return [
          shot({
            camera: 'orbit',
            framing: 'wide',
            subjectAction: 'The 3D form stays perfectly still, centred in frame.',
          }),
        ];
      }
      case 'turntable': {
        return [
          shot({
            camera: 'static',
            framing: 'wide',
            subjectAction:
              'The 3D form rotates one full 360° turn clockwise about its vertical axis at a slow, constant speed, staying centred.',
          }),
        ];
      }
      case 'drift': {
        return [
          shot({
            camera: 'truck-right',
            framing: 'wide',
            speed: 'very slow',
            subjectAction:
              'Layered shapes at different depths slide past at different rates, creating smooth parallax. Nothing enters or leaves abruptly.',
          }),
        ];
      }
      case 'tunnel': {
        return [
          shot({
            camera: 'dolly-in',
            framing: 'wide',
            subjectAction:
              'A repeating structure recedes into the distance; new segments emerge ahead at a constant rhythm so the motion feels endless.',
          }),
        ];
      }
      default: {
        return [];
      }
    }
  }

  switch (style as ProductStyle) {
    case 'turntable360': {
      return [
        shot({
          camera: 'static',
          subjectAction:
            'The product rotates one full 360° turn clockwise on the turntable at a slow, constant speed, staying centred and fully in frame.',
        }),
      ];
    }
    case 'orbit360': {
      return [
        shot({
          camera: 'orbit',
          subjectAction: 'The product stays perfectly still, centred on its surface.',
        }),
      ];
    }
    case 'heroArc': {
      return [
        shot({
          camera: 'orbit',
          degrees: 180,
          framing: 'medium close-up',
          subjectAction:
            'The product stays perfectly still. The arc starts from a low angle and rises to eye level by the end of the shot.',
        }),
      ];
    }
    case 'orbitThenDetail': {
      return [
        shot({
          camera: 'orbit',
          degrees: 180,
          subjectAction: 'The product stays perfectly still, centred on its surface.',
          weight: 3,
        }),
        shot({
          camera: 'dolly-in',
          framing: 'close-up',
          subjectAction:
            'The product stays still; the featured detail fills the frame by the end of the shot.',
          weight: 2,
        }),
      ];
    }
    case 'topDownReveal': {
      return [
        shot({
          camera: 'crane-down',
          framing: 'medium',
          subjectAction:
            'The product rotates 90° clockwise at a slow, constant speed while the camera descends from a top-down view to eye level.',
          weight: 3,
        }),
        shot({
          camera: 'static',
          framing: 'medium',
          subjectAction:
            'The product continues rotating very slowly and settles facing the camera, label forward.',
          weight: 2,
        }),
      ];
    }
    case 'floatSpin': {
      return [
        shot({
          camera: 'static',
          framing: 'medium',
          speed: 'very slow',
          subjectAction:
            'The product levitates a few centimetres above the surface and rotates one full 360° turn clockwise, very slowly, with a soft shadow beneath it.',
        }),
      ];
    }
    default: {
      return [];
    }
  }
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const createDefaultPlan = (template: DirectorTemplate): DirectorPlan => {
  if (template === 'background3d') {
    return {
      audio: 'silent',
      copySafeZone: true,
      detail: '',
      duration: 10,
      environment: 'an empty, seamless dark studio void with a soft floor reflection',
      hasStartFrame: false,
      lighting: 'soft rim light from behind, gentle top light, no harsh specular hot spots',
      palette: 'deep navy with electric blue accents, frosted glass and brushed metal',
      placement: 'landscape',
      seamlessLoop: true,
      shots: buildShotsForStyle('background3d', 'turntable'),
      style: 'turntable',
      subject: 'a cluster of smooth abstract 3D ribbons and spheres',
      talent: '',
      template,
    };
  }

  if (template === 'onModel') {
    return {
      audio: 'silent',
      copySafeZone: false,
      detail: '',
      duration: 8,
      environment: 'a bright, minimal studio with a warm grey seamless backdrop',
      hasStartFrame: false,
      lighting: 'soft, even daylight-balanced key light with gentle fill, no harsh shadows',
      palette: 'neutral tones so the product colours read true',
      placement: 'vertical',
      seamlessLoop: false,
      shots: buildShotsForStyle('onModel', 'walkAndTurn'),
      style: 'walkAndTurn',
      subject: '',
      talent: 'an adult model with a neutral, relaxed expression',
      template,
    };
  }

  return {
    audio: 'silent',
    copySafeZone: false,
    detail: 'the logo on the front label',
    duration: 8,
    environment: 'a matte white seamless studio sweep on a low circular plinth',
    hasStartFrame: false,
    lighting:
      'large softbox key light from the upper left, soft fill, a thin rim light to separate the edges',
    palette: 'neutral studio tones so the product colours read true',
    placement: 'landscape',
    seamlessLoop: false,
    shots: buildShotsForStyle('product3d', 'turntable360'),
    style: 'turntable360',
    subject: '',
    talent: '',
    template,
  };
};

// ---------------------------------------------------------------------------
// Timeline allocation
// ---------------------------------------------------------------------------

export interface TimedShot extends Shot {
  end: number;
  start: number;
}

/**
 * Split `total` seconds across shots by weight, integer seconds, summing exactly
 * to `total`. Largest-remainder rounding keeps the split stable.
 */
export const allocateShots = (shots: Shot[], total: number): TimedShot[] => {
  if (shots.length === 0) return [];
  const weightSum = shots.reduce((acc, s) => acc + Math.max(0, s.weight || 0), 0) || shots.length;
  const raw = shots.map((s) => (total * Math.max(0, s.weight || 0)) / weightSum);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ frac: v - floors[i], i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }

  let cursor = 0;
  return shots.map((s, i) => {
    const start = cursor;
    const end = cursor + floors[i];
    cursor = end;
    return { ...s, end, start };
  });
};

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

const subjectNoun = (template: DirectorTemplate) =>
  template === 'product3d' ? 'product' : template === 'onModel' ? 'talent' : 'form';

const describeCamera = (s: Shot, template: DirectorTemplate, detail: string): string => {
  const noun = subjectNoun(template);
  const speed = s.speed;
  switch (s.camera) {
    case 'static': {
      return 'The camera is locked off: no movement, no handheld shake.';
    }
    case 'orbit': {
      const closure =
        s.degrees === 360
          ? ' It completes the full circle and ends at exactly the position and angle where it started.'
          : '';
      return `The camera orbits ${s.degrees}° ${s.direction} around the ${noun} at a ${speed}, constant speed, keeping the same distance and height throughout and the ${noun} centred.${closure}`;
    }
    case 'dolly-in': {
      const target = template !== 'background3d' && detail ? detail : `the ${noun}`;
      return `The camera dollies in at a ${speed}, constant speed toward ${target}, keeping it centred; no zoom, no shake.`;
    }
    case 'dolly-out': {
      return `The camera dollies out at a ${speed}, constant speed, keeping the ${noun} centred as more of the set is revealed.`;
    }
    case 'crane-up': {
      return `The camera cranes up at a ${speed}, constant speed, from eye level toward a high angle, keeping the ${noun} centred.`;
    }
    case 'crane-down': {
      return `The camera cranes down at a ${speed}, constant speed, from a top-down view to eye level, keeping the ${noun} centred.`;
    }
    case 'truck-left':
    case 'truck-right': {
      const dir = s.camera === 'truck-left' ? 'left' : 'right';
      return `The camera trucks ${dir} at a ${speed}, constant speed, parallel to the ${noun}, with no rotation.`;
    }
    case 'pan-left':
    case 'pan-right': {
      const dir = s.camera === 'pan-left' ? 'left' : 'right';
      return `The camera pans ${dir} at a ${speed}, constant speed from a fixed position.`;
    }
    case 'tilt-up':
    case 'tilt-down': {
      const dir = s.camera === 'tilt-up' ? 'up' : 'down';
      return `The camera tilts ${dir} at a ${speed}, constant speed from a fixed position.`;
    }
    case 'zoom-in':
    case 'zoom-out': {
      const dir = s.camera === 'zoom-in' ? 'in' : 'out';
      return `The lens zooms ${dir} at a ${speed}, constant speed from a fixed camera position.`;
    }
    default: {
      return '';
    }
  }
};

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const framingLabel = (f: Framing) => `${capitalize(f)} shot`;

const timeRange = (start: number, end: number) => `${start}–${end}s`;

export interface CompileResult {
  errors: string[];
  prompt: string;
  timeline: TimedShot[];
  warnings: string[];
}

export interface CompileContext {
  /** Current resolution in the workspace, used for ad-delivery QA. */
  resolution?: string | null;
  /** Current seed in the workspace, used for reproducibility QA. */
  seed?: number | null;
}

const containsVagueTerm = (text: string) =>
  VAGUE_TERMS.filter((term) => text.toLowerCase().includes(term));

export const compilePlan = (plan: DirectorPlan, ctx: CompileContext = {}): CompileResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduct = plan.template === 'product3d';
  const isOnModel = plan.template === 'onModel';
  const isProductLike = isProduct || isOnModel;
  const referenceMode: ReferenceMode = plan.referenceMode ?? 'startFrame';
  const noun = subjectNoun(plan.template);

  // ---- validation ---------------------------------------------------------
  const subject = plan.subject.trim();
  if (!subject) {
    errors.push(isProductLike ? 'Describe the product.' : 'Describe the 3D form or environment.');
  }
  if (isOnModel && !plan.talent.trim()) {
    errors.push('Describe the talent who wears or uses the product.');
  }
  if (
    !Number.isInteger(plan.duration) ||
    plan.duration < DIRECTOR_DURATION_MIN ||
    plan.duration > DIRECTOR_DURATION_MAX
  ) {
    errors.push(
      `Duration must be a whole number between ${DIRECTOR_DURATION_MIN} and ${DIRECTOR_DURATION_MAX} seconds.`,
    );
  }
  if (plan.shots.length === 0) errors.push('Add at least one shot.');
  if (plan.shots.length > MAX_SHOTS) errors.push(`Use at most ${MAX_SHOTS} shots per clip.`);

  const timeline = allocateShots(plan.shots, plan.duration);
  for (const [i, t] of timeline.entries()) {
    if (t.end - t.start < MIN_SHOT_SECONDS) {
      errors.push(
        `Shot ${i + 1} is shorter than ${MIN_SHOT_SECONDS}s. Use fewer shots or a longer clip.`,
      );
    }
  }

  const freeText = [
    plan.subject,
    plan.detail,
    plan.talent,
    plan.environment,
    plan.lighting,
    plan.palette,
    ...plan.shots.map((s) => s.subjectAction),
  ].join(' ');
  const vague = containsVagueTerm(freeText);
  if (vague.length > 0) {
    warnings.push(
      `Avoid vague terms (${[...new Set(vague)].join(', ')}); describe what the camera sees instead.`,
    );
  }

  if (isProductLike && !plan.hasStartFrame) {
    warnings.push(
      isOnModel
        ? 'Attach a product photo as a reference so the talent wears the real item.'
        : 'Attach a product photo as the start frame so the product stays faithful to the real item.',
    );
  }
  if (ctx.resolution && !/1080|2k/i.test(ctx.resolution)) {
    warnings.push('Set resolution to 1080P for ad delivery.');
  }
  if (ctx.seed === null || ctx.seed === undefined) {
    warnings.push('Lock a seed so revisions reproduce the same motion.');
  }
  if (plan.seamlessLoop && plan.hasStartFrame) {
    warnings.push(
      'Seamless loop: the end frame will be set to the start frame to force loop closure.',
    );
  }
  if (plan.seamlessLoop && plan.shots.length > 1) {
    warnings.push('Loops work best as a single continuous shot.');
  }

  // ---- prose --------------------------------------------------------------
  const lines: string[] = [];

  if (plan.hasStartFrame) {
    if (referenceMode === 'reference') {
      lines.push(
        isOnModel
          ? `Reference: Image 1 is the product. The talent wears or uses exactly this item; keep its shape, proportions, materials, colours, pattern and label details exactly as shown in Image 1; do not redesign it.`
          : `Reference: Image 1 is the product. Reproduce it exactly: shape, proportions, materials, colours and label text as shown in Image 1; do not redesign it.`,
      );
    } else {
      lines.push(
        isProductLike
          ? `Reference: the opening frame shows the product. Keep its shape, proportions, materials, colours and label text exactly as shown; do not redesign it.`
          : `Reference: the opening frame sets the scene. Keep its composition, colours and materials exactly as shown.`,
      );
    }
  }

  const detailNote = plan.detail.trim() ? ` Featured detail: ${plan.detail.trim()}.` : '';
  if (isOnModel) {
    lines.push(`Product: ${subject || '[product]'}.${detailNote}`);
    lines.push(
      `Talent: ${plan.talent.trim() || '[talent]'}, wearing or using the product naturally. Natural skin, no exaggerated expressions, no direct address to camera.`,
    );
  } else if (isProduct) {
    lines.push(`Subject: ${subject || '[product]'}.${detailNote}`);
  } else {
    lines.push(
      `Subject: ${subject || '[3D form]'}, rendered as clean 3D with physically accurate materials.`,
    );
  }

  const setParts = [
    plan.environment.trim() ? `Set: ${plan.environment.trim()}.` : '',
    plan.lighting.trim() ? `Lighting: ${plan.lighting.trim()}.` : '',
    plan.palette.trim() ? `Palette and materials: ${plan.palette.trim()}.` : '',
  ].filter(Boolean);
  if (setParts.length > 0) lines.push(setParts.join(' '));

  lines.push('Timeline:');
  for (const t of timeline) {
    const parts = [
      `${framingLabel(t.framing)}.`,
      t.subjectAction.trim(),
      describeCamera(t, plan.template, plan.detail.trim()),
    ].filter(Boolean);
    lines.push(`${timeRange(t.start, t.end)}: ${parts.join(' ')}`);
  }

  lines.push(
    `Camera rules: one camera move per shot; every move is smooth and at a constant speed; no handheld shake, no whip pans, no speed ramps.`,
  );

  if (plan.seamlessLoop) {
    lines.push(
      `Loop: the final frame matches the opening frame exactly in position, angle, lighting and ${noun} orientation so the clip loops seamlessly.`,
    );
  }

  if (!isProduct && plan.copySafeZone) {
    lines.push(
      `Composition: keep the centre third of the frame visually quiet and low-contrast so headline text can sit over it; put detail toward the edges.`,
    );
  }

  const constraints = isOnModel
    ? [
        'The product stays fully visible, undistorted and true to the reference for the whole clip.',
        'One talent only; no other people, no extra products or props.',
        'Natural, lifelike body motion; hands and face stay anatomically correct.',
        'No on-screen text, captions, subtitles or logos other than those on the product itself.',
        'No cuts, dissolves, fades or flashes other than the shots listed.',
      ]
    : isProduct
      ? [
          'The product stays fully in frame, undistorted, with legible label text.',
          'No hands, people or extra objects.',
          'No on-screen text, captions, subtitles or logos other than those on the product itself.',
          'No cuts, dissolves, fades or flashes other than the shots listed.',
          'No lens flares or reflections covering the product.',
        ]
      : [
          'No people, characters, hands, products or recognisable objects.',
          'No on-screen text, captions, subtitles, logos or watermarks.',
          'No cuts, dissolves, fades or flashes; motion stays continuous.',
          'No strobing or flicker; brightness stays stable across the clip.',
        ];
  lines.push(`Constraints: ${constraints.join(' ')}`);

  lines.push(
    plan.audio === 'silent'
      ? 'Audio: no dialogue, no voice-over, no music. non_diegetic_music: N/A.'
      : 'Audio: subtle ambient studio room tone only; no dialogue, no voice-over, no music. non_diegetic_music: N/A.',
  );

  return { errors, prompt: lines.join('\n'), timeline, warnings };
};

// ---------------------------------------------------------------------------
// Model gating
// ---------------------------------------------------------------------------

/**
 * The Director's grammar (timestamped blocks, first-frame references, the
 * `non_diegetic_music` flag) is MiniMax H3 specific. Gate the UI to H3 ids.
 */
export const supportsCameraDirector = (model?: string | null): boolean => {
  if (!model) return false;
  return /(?:^|[/-])h3(?:-max)?(?:[/-]|$)/i.test(model);
};

/** Recommended workspace settings to apply alongside the compiled prompt. */
export const recommendedSettings = (plan: DirectorPlan) => ({
  aspectRatio: PLACEMENT_ASPECT_RATIO[plan.placement],
  duration: plan.duration,
  promptExtend: plan.template === 'background3d' ? 'balanced' : 'quality',
  resolution: '1080P',
});

// ---------------------------------------------------------------------------
// Feed summary — turn a compiled prompt back into a one-glance card
// ---------------------------------------------------------------------------

export interface DirectorShotSummary {
  /** Short camera / subject-motion label, e.g. "Orbit 180° clockwise". */
  move: string;
  range: string;
}

export interface DirectorPromptSummary {
  /** Total seconds from the last timeline block. */
  duration: number | null;
  recipe: 'product' | 'onModel' | 'background';
  /** How the attached image was used, if the prompt mentions one. */
  reference: 'reference' | 'startFrame' | null;
  shots: DirectorShotSummary[];
  /** Product / form description, trimmed to a single short sentence. */
  subject: string;
}

const CAMERA_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/The camera orbits (\d+)° (clockwise|counter-clockwise)/, (m) => `Orbit ${m[1]}° ${m[2]}`],
  [/The camera dollies in/, () => 'Dolly in'],
  [/The camera dollies out/, () => 'Dolly out'],
  [/The camera cranes up/, () => 'Crane up'],
  [/The camera cranes down/, () => 'Crane down'],
  [/The camera trucks (left|right)/, (m) => `Truck ${m[1]}`],
  [/The camera pans (left|right)/, (m) => `Pan ${m[1]}`],
  [/The camera tilts (up|down)/, (m) => `Tilt ${m[1]}`],
  [/The lens zooms (in|out)/, (m) => `Zoom ${m[1]}`],
];

const SUBJECT_MOTION_PATTERNS: [RegExp, string][] = [
  [/rotates one full 360°/, 'Turntable 360°'],
  [/rotates 90°/, 'Turn 90°'],
  [/levitates/, 'Float & spin'],
  [/walks toward the camera.*full 360°/, 'Walk & turn'],
];

const describeShotLine = (line: string): string => {
  const motion = SUBJECT_MOTION_PATTERNS.find(([re]) => re.test(line))?.[1];
  let camera: string | undefined;
  for (const [re, label] of CAMERA_PATTERNS) {
    const m = line.match(re);
    if (m) {
      camera = label(m);
      break;
    }
  }
  if (!camera && /The camera is locked off/.test(line))
    camera = motion ? 'locked off' : 'Locked off';

  if (motion && camera) return `${motion}, ${camera}`;
  return motion ?? camera ?? 'Shot';
};

/**
 * Recognise a prompt produced by `compilePlan` and reduce it to a compact
 * summary for the generation feed. Returns null for free-form prompts.
 */
export const summarizeDirectorPrompt = (prompt: string): DirectorPromptSummary | null => {
  if (!prompt || !/^Timeline:$/m.test(prompt) || !/^Camera rules:/m.test(prompt)) return null;

  const lines = prompt.split('\n');
  const recipe: DirectorPromptSummary['recipe'] = lines.some((l) => l.startsWith('Talent:'))
    ? 'onModel'
    : lines.some((l) => /^Subject: .*rendered as clean 3D/.test(l))
      ? 'background'
      : 'product';

  const subjectLine = lines.find((l) => /^(?:Product|Subject): /.test(l)) ?? '';
  const subject = subjectLine
    .replace(/^(Product|Subject): /, '')
    .replace(/, rendered as clean 3D.*$/, '')
    .replace(/\. Featured detail:.*$/, '')
    .replace(/\.$/, '')
    .trim();

  const referenceLine = lines.find((l) => l.startsWith('Reference: '));
  const reference: DirectorPromptSummary['reference'] = referenceLine
    ? referenceLine.includes('Image 1')
      ? 'reference'
      : 'startFrame'
    : null;

  const shots: DirectorShotSummary[] = [];
  let duration: number | null = null;
  for (const line of lines) {
    const m = line.match(/^(\d+)–(\d+)s: (.*)$/);
    if (!m) continue;
    shots.push({ move: describeShotLine(m[3]), range: `${m[1]}–${m[2]}s` });
    duration = Number(m[2]);
  }

  return { duration, recipe, reference, shots, subject };
};
