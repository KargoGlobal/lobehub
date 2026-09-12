/**
 * Auto-animate — from a product description (and optionally a photo) to a
 * handful of "reasonable" ad animations, without hand-writing camera prompts.
 *
 * Pure module: category detection, per-category concept recipes, and the
 * fully-resolved generation requests (model + params) for each concept.
 * Everything goes through the Camera Director compiler so the same QA rules
 * (one move per shot, timed blocks, ad-safe constraints) apply.
 */
import {
  buildShotsForStyle,
  compilePlan,
  createDefaultPlan,
  type DirectorPlan,
  type OnModelStyle,
  type Placement,
  PLACEMENT_ASPECT_RATIO,
  type ProductStyle,
  type ReferenceMode,
} from '../CameraDirector/compiler';

export type ProductCategory =
  | 'apparelTop'
  | 'apparelBottom'
  | 'footwear'
  | 'bag'
  | 'jewelry'
  | 'beverage'
  | 'beauty'
  | 'electronics'
  | 'home'
  | 'food'
  | 'generic';

export interface CategoryMeta {
  id: ProductCategory;
  label: string;
}

export const PRODUCT_CATEGORIES: CategoryMeta[] = [
  { id: 'generic', label: 'Auto / other' },
  { id: 'apparelTop', label: 'Apparel — tops & outerwear' },
  { id: 'apparelBottom', label: 'Apparel — pants, skirts, shorts' },
  { id: 'footwear', label: 'Footwear' },
  { id: 'bag', label: 'Bags & accessories' },
  { id: 'jewelry', label: 'Jewelry & watches' },
  { id: 'beverage', label: 'Beverage' },
  { id: 'beauty', label: 'Beauty & skincare' },
  { id: 'electronics', label: 'Electronics & gadgets' },
  { id: 'home', label: 'Home & furniture' },
  { id: 'food', label: 'Packaged food' },
];

// Longest / most specific phrases first so "running shoes" beats "running".
const CATEGORY_KEYWORDS: [ProductCategory, string[]][] = [
  [
    'apparelBottom',
    [
      'pants',
      'trousers',
      'jeans',
      'denim',
      'chinos',
      'shorts',
      'skirt',
      'leggings',
      'joggers',
      'sweatpants',
      'cargo',
    ],
  ],
  [
    'apparelTop',
    [
      't-shirt',
      'tee',
      'shirt',
      'blouse',
      'hoodie',
      'sweater',
      'jumper',
      'jacket',
      'coat',
      'blazer',
      'dress',
      'top',
      'vest',
      'cardigan',
      'parka',
      'puffer',
    ],
  ],
  [
    'footwear',
    ['sneaker', 'shoe', 'boot', 'heel', 'sandal', 'loafer', 'trainer', 'slipper', 'cleat'],
  ],
  ['jewelry', ['ring', 'necklace', 'bracelet', 'earring', 'watch', 'pendant', 'jewel', 'chain']],
  [
    'beauty',
    [
      'serum',
      'cream',
      'lotion',
      'lipstick',
      'mascara',
      'perfume',
      'fragrance',
      'skincare',
      'moisturizer',
      'moisturiser',
      'shampoo',
      'conditioner',
      'foundation',
      'balm',
      'cleanser',
      'sunscreen',
      'spf',
    ],
  ],
  [
    'food',
    [
      'snack',
      'chips',
      'crisps',
      'chocolate',
      'candy',
      'cereal',
      'granola',
      'bar',
      'cookie',
      'biscuit',
      'sauce',
      'jar',
      'pouch',
      'protein',
      'supplement',
      'gummies',
    ],
  ],
  [
    'beverage',
    [
      'can',
      'bottle',
      'drink',
      'beer',
      'wine',
      'soda',
      'water',
      'coffee',
      'tea',
      'juice',
      'energy drink',
      'cocktail',
      'spirit',
      'whisky',
      'vodka',
      'kombucha',
    ],
  ],
  [
    'electronics',
    [
      'headphone',
      'earbud',
      'speaker',
      'phone',
      'laptop',
      'tablet',
      'camera',
      'console',
      'controller',
      'keyboard',
      'mouse',
      'charger',
      'smartwatch',
      'drone',
      'tv',
      'monitor',
      'gadget',
    ],
  ],
  [
    'home',
    [
      'chair',
      'sofa',
      'couch',
      'table',
      'lamp',
      'rug',
      'pillow',
      'cushion',
      'vase',
      'candle',
      'mug',
      'kettle',
      'blender',
      'cookware',
      'pan',
      'pot',
      'plant',
      'planter',
      'furniture',
      'bedding',
      'towel',
    ],
  ],
  [
    'bag',
    [
      'bag',
      'backpack',
      'tote',
      'purse',
      'wallet',
      'clutch',
      'luggage',
      'suitcase',
      'belt',
      'hat',
      'cap',
      'sunglasses',
      'scarf',
      'glove',
    ],
  ],
];

const wordBoundary = (term: string) =>
  new RegExp(
    `(?:^|[^a-z])${term.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?(?:$|[^a-z])`,
    'i',
  );

/** Keyword-based category guess. Returns `generic` when nothing matches. */
export const detectCategory = (description: string): ProductCategory => {
  const text = description.toLowerCase();
  if (!text.trim()) return 'generic';
  for (const [category, terms] of CATEGORY_KEYWORDS) {
    if (terms.some((term) => wordBoundary(term).test(text))) return category;
  }
  return 'generic';
};

export type ConceptMode = 'startFrame' | 'reference' | 'text';

export interface ConceptRecipe {
  blurb: string;
  detail?: string;
  duration: number;
  environment?: string;
  id: string;
  kind: 'product' | 'onModel';
  lighting?: string;
  style: ProductStyle | OnModelStyle;
  talent?: string;
  title: string;
}

const product = (
  id: string,
  title: string,
  blurb: string,
  style: ProductStyle,
  extra: Partial<ConceptRecipe> = {},
): ConceptRecipe => ({ blurb, duration: 8, id, kind: 'product', style, title, ...extra });

const onModel = (
  id: string,
  title: string,
  blurb: string,
  style: OnModelStyle,
  talent: string,
  extra: Partial<ConceptRecipe> = {},
): ConceptRecipe => ({ blurb, duration: 8, id, kind: 'onModel', style, talent, title, ...extra });

const ADULT_MODEL = 'an adult model with a neutral, relaxed expression';

const CATEGORY_RECIPES: Record<ProductCategory, ConceptRecipe[]> = {
  apparelBottom: [
    onModel(
      'walk-turn',
      'On-model walk & turn',
      'Talent walks in wearing them and does a slow full turn.',
      'walkAndTurn',
      ADULT_MODEL,
      {
        environment: 'a bright, minimal studio with a warm grey seamless backdrop',
        duration: 10,
      },
    ),
    onModel(
      'fit-detail',
      'Fit & fabric detail',
      'Push-in from a medium shot to the waistband, seams and fabric texture.',
      'detailReveal',
      ADULT_MODEL,
      {
        detail: 'the waistband, seams and fabric texture',
      },
    ),
    product(
      'ghost-turntable',
      'Ghost turntable',
      'The garment on an invisible form rotates a full 360°.',
      'turntable360',
      {
        environment:
          'a clean white studio; the garment holds its worn shape on an invisible mannequin, nothing else in frame',
      },
    ),
    onModel(
      'lifestyle',
      'Lifestyle hold',
      'Candid pose in a sunlit loft with a slow lateral camera drift.',
      'lifestyleHold',
      ADULT_MODEL,
      {
        environment: 'a sunlit loft apartment with wooden floors and soft window light',
        lighting: 'natural window light with soft shadows',
      },
    ),
  ],
  apparelTop: [
    onModel(
      'walk-turn',
      'On-model walk & turn',
      'Talent walks in wearing it and does a slow full turn.',
      'walkAndTurn',
      ADULT_MODEL,
      {
        duration: 10,
      },
    ),
    onModel(
      'hero-orbit',
      'Hero orbit',
      'Talent stands still while the camera orbits 180°.',
      'heroOrbit',
      ADULT_MODEL,
    ),
    onModel(
      'fit-detail',
      'Fabric & detail',
      'Push-in to the collar, stitching and fabric texture.',
      'detailReveal',
      ADULT_MODEL,
      {
        detail: 'the collar, stitching and fabric texture',
      },
    ),
    product(
      'ghost-turntable',
      'Ghost turntable',
      'The garment on an invisible form rotates a full 360°.',
      'turntable360',
      {
        environment:
          'a clean white studio; the garment holds its worn shape on an invisible mannequin, nothing else in frame',
      },
    ),
  ],
  footwear: [
    product('hero-arc', 'Hero arc', 'Low-angle half orbit rising to eye level.', 'heroArc'),
    product(
      'turntable',
      'Turntable 360°',
      'A full rotation on a clean studio plinth.',
      'turntable360',
    ),
    product(
      'sole-detail',
      'Orbit → sole & detail',
      'Half orbit, then push in to the sole and stitching.',
      'orbitThenDetail',
      {
        detail: 'the sole tread and side stitching',
        duration: 10,
      },
    ),
    onModel(
      'on-foot',
      'On-foot step',
      'Talent takes a few slow steps toward camera, framed from the knees down.',
      'walkAndTurn',
      'an adult model framed from the knees down',
      {
        duration: 8,
      },
    ),
  ],
  bag: [
    product('turntable', 'Turntable 360°', 'A full rotation on a clean plinth.', 'turntable360'),
    product(
      'hardware-detail',
      'Orbit → hardware',
      'Half orbit, then push in to the clasp, zips and stitching.',
      'orbitThenDetail',
      {
        detail: 'the clasp, zips, hardware and stitching',
        duration: 10,
      },
    ),
    onModel(
      'carried',
      'Carried on-model',
      'Talent carries or wears it while the camera orbits 180°.',
      'heroOrbit',
      ADULT_MODEL,
    ),
    product('float', 'Float & spin', 'Levitating slow spin over a soft shadow.', 'floatSpin'),
  ],
  jewelry: [
    product('float', 'Float & spin', 'Levitating slow spin catching the light.', 'floatSpin', {
      lighting:
        'a single soft key light with a moving highlight that travels across the metal and stones',
    }),
    product(
      'macro',
      'Orbit → macro',
      'Half orbit, then push in to the stones and setting.',
      'orbitThenDetail',
      {
        detail: 'the stones, setting and engraving',
        duration: 10,
      },
    ),
    product(
      'top-down',
      'Top-down reveal',
      'Crane down from above as the piece turns 90°.',
      'topDownReveal',
      {
        environment: 'a dark velvet surface with a soft spotlight',
      },
    ),
    onModel(
      'worn',
      'Worn detail',
      'Push-in to the piece worn on the talent.',
      'detailReveal',
      ADULT_MODEL,
      {
        detail: 'the piece as worn',
      },
    ),
  ],
  beverage: [
    product(
      'turntable',
      'Turntable 360°',
      'A full rotation with the label passing the camera.',
      'turntable360',
    ),
    product(
      'label-detail',
      'Orbit → label',
      'Half orbit, then push in to the label and logo.',
      'orbitThenDetail',
      {
        detail: 'the front label and logo',
        duration: 10,
      },
    ),
    product('hero-arc', 'Hero arc', 'Low-angle half orbit rising to eye level.', 'heroArc'),
    onModel(
      'in-hand',
      'In-hand lifestyle',
      'Talent holds it naturally in a bright setting; slow lateral drift.',
      'lifestyleHold',
      'an adult model holding the product at chest height',
      {
        environment: 'a bright kitchen counter with soft daylight',
      },
    ),
  ],
  beauty: [
    product('float', 'Float & spin', 'Levitating slow spin over a soft shadow.', 'floatSpin'),
    product(
      'top-down',
      'Top-down reveal',
      'Crane down from above as the product turns 90°.',
      'topDownReveal',
      {
        environment: 'a pale stone surface with a soft spotlight',
      },
    ),
    product(
      'label-detail',
      'Orbit → label',
      'Half orbit, then push in to the label and cap.',
      'orbitThenDetail',
      {
        detail: 'the label, logo and cap',
        duration: 10,
      },
    ),
    onModel(
      'in-hand',
      'In-hand detail',
      'Talent holds it toward camera; slow push-in to the label.',
      'detailReveal',
      'an adult model holding the product near their face',
      {
        detail: 'the label and cap',
      },
    ),
  ],
  electronics: [
    product('orbit', 'Orbit 360°', 'A full camera orbit around the device.', 'orbit360'),
    product(
      'top-down',
      'Top-down reveal',
      'Crane down from above as the device turns 90°.',
      'topDownReveal',
    ),
    product(
      'port-detail',
      'Orbit → detail',
      'Half orbit, then push in to the controls and ports.',
      'orbitThenDetail',
      {
        detail: 'the controls, ports and finish',
        duration: 10,
      },
    ),
    onModel(
      'in-use',
      'In-use lifestyle',
      'Talent uses it naturally; slow lateral drift.',
      'lifestyleHold',
      'an adult model using the product',
      {
        environment: 'a modern desk by a window with soft daylight',
      },
    ),
  ],
  home: [
    product(
      'orbit',
      'Orbit 360°',
      'A full camera orbit around the piece in a styled room.',
      'orbit360',
      {
        environment: 'a styled, minimal living room with soft window light',
      },
    ),
    product('hero-arc', 'Hero arc', 'Low-angle half orbit rising to eye level.', 'heroArc'),
    product(
      'material-detail',
      'Orbit → material',
      'Half orbit, then push in to the material and joinery.',
      'orbitThenDetail',
      {
        detail: 'the material, texture and joinery',
        duration: 10,
      },
    ),
    product(
      'top-down',
      'Top-down reveal',
      'Crane down from above as the piece turns 90°.',
      'topDownReveal',
    ),
  ],
  food: [
    product(
      'turntable',
      'Turntable 360°',
      'A full rotation with the front of pack passing the camera.',
      'turntable360',
    ),
    product(
      'pack-detail',
      'Orbit → pack front',
      'Half orbit, then push in to the front of pack.',
      'orbitThenDetail',
      {
        detail: 'the front of pack, logo and flavour callout',
        duration: 10,
      },
    ),
    product('hero-arc', 'Hero arc', 'Low-angle half orbit rising to eye level.', 'heroArc'),
    onModel(
      'in-hand',
      'In-hand lifestyle',
      'Talent holds it naturally in a bright kitchen; slow drift.',
      'lifestyleHold',
      'an adult model holding the product at chest height',
      {
        environment: 'a bright kitchen counter with soft daylight',
      },
    ),
  ],
  generic: [
    product(
      'turntable',
      'Turntable 360°',
      'A full rotation on a clean studio plinth.',
      'turntable360',
    ),
    product(
      'orbit-detail',
      'Orbit → detail',
      'Half orbit, then push in to the key detail.',
      'orbitThenDetail',
      {
        duration: 10,
      },
    ),
    product('hero-arc', 'Hero arc', 'Low-angle half orbit rising to eye level.', 'heroArc'),
    product('float', 'Float & spin', 'Levitating slow spin over a soft shadow.', 'floatSpin'),
  ],
};

export const recipesForCategory = (category: ProductCategory): ConceptRecipe[] =>
  CATEGORY_RECIPES[category] ?? CATEGORY_RECIPES.generic;

export interface AutoAnimateInput {
  category: ProductCategory;
  description: string;
  /** Product photo attached in the workspace (full URL), if any. */
  imageUrl?: string | null;
  placement: Placement;
  /** Per-concept seeds; supplied by the caller so runs are reproducible. */
  seeds?: number[];
}

/** fal model ids used per concept mode. */
export const AUTO_ANIMATE_MODELS = {
  reference: 'minimax/h3/reference-to-video',
  startFrame: 'minimax/h3-max',
  text: 'minimax/h3-max',
} as const;

export interface ConceptRequestParams {
  aspectRatio?: string;
  duration: number;
  imageUrl?: string;
  imageUrls?: string[];
  prompt: string;
  promptExtend: string;
  resolution: string;
  seed: number | null;
}

export interface AnimationConcept {
  blurb: string;
  errors: string[];
  id: string;
  mode: ConceptMode;
  model: string;
  params: ConceptRequestParams;
  plan: DirectorPlan;
  prompt: string;
  title: string;
  warnings: string[];
}

const modeForRecipe = (recipe: ConceptRecipe, hasImage: boolean): ConceptMode => {
  if (!hasImage) return 'text';
  return recipe.kind === 'onModel' ? 'reference' : 'startFrame';
};

/** Build the fully-resolved concepts (prompt + request params) for a product. */
export const buildConcepts = (input: AutoAnimateInput): AnimationConcept[] => {
  const hasImage = Boolean(input.imageUrl);
  const recipes = recipesForCategory(input.category);

  return recipes.map((recipe, index) => {
    const mode = modeForRecipe(recipe, hasImage);
    const referenceMode: ReferenceMode = mode === 'reference' ? 'reference' : 'startFrame';
    const template = recipe.kind === 'onModel' ? 'onModel' : 'product3d';
    const base = createDefaultPlan(template);

    const plan: DirectorPlan = {
      ...base,
      detail: recipe.detail ?? (recipe.kind === 'onModel' ? '' : base.detail),
      duration: recipe.duration,
      environment: recipe.environment ?? base.environment,
      hasStartFrame: hasImage,
      lighting: recipe.lighting ?? base.lighting,
      placement: input.placement,
      referenceMode,
      shots: buildShotsForStyle(template, recipe.style),
      style: recipe.style,
      subject: input.description.trim(),
      talent: recipe.talent ?? base.talent,
    };

    const seed = input.seeds?.[index] ?? null;
    const compiled = compilePlan(plan, { resolution: '1080P', seed });
    const model = AUTO_ANIMATE_MODELS[mode];

    const params: ConceptRequestParams = {
      duration: recipe.duration,
      prompt: compiled.prompt,
      promptExtend: 'quality',
      resolution: mode === 'reference' ? '2K' : '1080P',
      seed,
    };
    if (mode === 'text') params.aspectRatio = PLACEMENT_ASPECT_RATIO[input.placement];
    if (mode === 'startFrame' && input.imageUrl) params.imageUrl = input.imageUrl;
    if (mode === 'reference' && input.imageUrl) {
      params.imageUrls = [input.imageUrl];
      params.aspectRatio = PLACEMENT_ASPECT_RATIO[input.placement];
    }

    return {
      blurb: recipe.blurb,
      errors: compiled.errors,
      id: recipe.id,
      mode,
      model,
      params,
      plan,
      prompt: compiled.prompt,
      title: recipe.title,
      warnings: compiled.warnings,
    };
  });
};
