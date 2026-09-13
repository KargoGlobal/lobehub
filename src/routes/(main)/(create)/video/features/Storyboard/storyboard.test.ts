import { describe, expect, it } from 'vitest';

import {
  buildSequenceLine,
  compileStoryboard,
  createDefaultStoryboardPlan,
  createStoryboardShot,
  MAX_STORYBOARD_SHOTS,
  MIN_STORYBOARD_SHOTS,
  reorderShots,
  STORYBOARD_MODELS,
  type StoryboardPlan,
  validateStoryboardPlan,
} from './storyboard';

const plan = (overrides: Partial<StoryboardPlan> = {}): StoryboardPlan => ({
  ...createDefaultStoryboardPlan('product3d'),
  subject: 'a 330ml matte black aluminium energy drink can with a silver pull tab',
  ...overrides,
});

describe('createDefaultStoryboardPlan', () => {
  it('starts with two shots, within the allowed range', () => {
    const p = createDefaultStoryboardPlan('product3d');
    expect(p.shots.length).toBe(2);
    expect(p.shots.length).toBeGreaterThanOrEqual(MIN_STORYBOARD_SHOTS);
    expect(p.shots.length).toBeLessThanOrEqual(MAX_STORYBOARD_SHOTS);
  });

  it('varies the default camera move across shots so they are not identical', () => {
    const shots = [0, 1, 2, 3].map((i) => createStoryboardShot('product3d', i));
    const cameras = new Set(shots.map((s) => s.camera));
    expect(cameras.size).toBeGreaterThan(1);
  });
});

describe('reorderShots', () => {
  it('moves an item from one index to another', () => {
    expect(reorderShots(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorderShots(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op for equal, negative or out-of-range indexes', () => {
    const items = ['a', 'b', 'c'];
    expect(reorderShots(items, 1, 1)).toBe(items);
    expect(reorderShots(items, -1, 1)).toBe(items);
    expect(reorderShots(items, 0, 5)).toBe(items);
  });
});

describe('validateStoryboardPlan', () => {
  it('rejects fewer than the minimum shots', () => {
    const p = plan({ shots: [createStoryboardShot('product3d', 0)] });
    expect(validateStoryboardPlan(p)).toContain(
      `Use at least ${MIN_STORYBOARD_SHOTS} shots to build a storyboard.`,
    );
  });

  it('rejects more than the maximum shots', () => {
    const shots = Array.from({ length: MAX_STORYBOARD_SHOTS + 1 }, (_, i) =>
      createStoryboardShot('product3d', i),
    );
    const p = plan({ shots });
    expect(validateStoryboardPlan(p).join()).toMatch(
      new RegExp(`at most ${MAX_STORYBOARD_SHOTS} shots`),
    );
  });

  it('accepts a plan within range', () => {
    expect(validateStoryboardPlan(plan())).toEqual([]);
  });
});

describe('buildSequenceLine', () => {
  const shots = [
    { ...createStoryboardShot('product3d', 0), narrative: 'the can rotates once on the plinth' },
    { ...createStoryboardShot('product3d', 1), narrative: 'the camera pushes in on the logo' },
    { ...createStoryboardShot('product3d', 2), narrative: 'the can settles, label forward' },
  ];

  it('labels the opening shot and previews the next one, with no backward reference', () => {
    const line = buildSequenceLine(shots, 0, 24);
    expect(line).toContain('shot 1 of 3');
    expect(line).toContain('This is the opening shot.');
    expect(line).toContain('leads directly into shot 2');
    expect(line).toContain('the camera pushes in on the logo');
    expect(line).not.toContain('Continuing directly from');
  });

  it('recaps the previous shot and previews the next one for a middle shot', () => {
    const line = buildSequenceLine(shots, 1, 24);
    expect(line).toContain('shot 2 of 3');
    expect(line).toContain('Continuing directly from shot 1');
    expect(line).toContain('the can rotates once on the plinth');
    expect(line).toContain('leads directly into shot 3');
    expect(line).toContain('the can settles, label forward');
  });

  it('recaps the previous shot and closes the sequence for the final shot', () => {
    const line = buildSequenceLine(shots, 2, 24);
    expect(line).toContain('shot 3 of 3');
    expect(line).toContain('Continuing directly from shot 2');
    expect(line).toContain('the camera pushes in on the logo');
    expect(line).toContain('This is the final shot');
  });

  it('falls back to the subject action when a shot has no narrative note', () => {
    const bare = [
      { ...createStoryboardShot('product3d', 0), subjectAction: 'the can spins slowly' },
      { ...createStoryboardShot('product3d', 1) },
    ];
    expect(buildSequenceLine(bare, 1, 16)).toContain('the can spins slowly');
  });

  it('truncates an overly long recap instead of bloating every prompt', () => {
    const long = [
      { ...createStoryboardShot('product3d', 0), narrative: 'x'.repeat(400) },
      { ...createStoryboardShot('product3d', 1) },
    ];
    const line = buildSequenceLine(long, 1, 16);
    expect(line).toContain('...');
    expect(line).not.toContain('x'.repeat(400));
    expect(line).toContain('x'.repeat(217));
  });
});

describe('compileStoryboard', () => {
  it('produces one request per shot, in order, each naming its position in the sequence', () => {
    const result = compileStoryboard(
      plan({
        shots: [
          createStoryboardShot('product3d', 0),
          createStoryboardShot('product3d', 1),
          createStoryboardShot('product3d', 2),
        ],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.shots).toHaveLength(3);
    expect(result.shots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(result.shots[0].prompt).toContain('shot 1 of 3');
    expect(result.shots[1].prompt).toContain('shot 2 of 3');
    expect(result.shots[2].prompt).toContain('shot 3 of 3');
    expect(result.totalDuration).toBe(24);
  });

  it('gives every shot continuity text naming its neighbour', () => {
    const result = compileStoryboard(
      plan({
        shots: [
          { ...createStoryboardShot('product3d', 0), narrative: 'the can rotates into frame' },
          { ...createStoryboardShot('product3d', 1), narrative: 'the camera pushes into the logo' },
        ],
      }),
    );
    expect(result.shots[0].prompt).toContain('the camera pushes into the logo');
    expect(result.shots[1].prompt).toContain('the can rotates into frame');
  });

  it('still compiles the Camera Director grammar into every shot prompt', () => {
    const result = compileStoryboard(plan());
    for (const shot of result.shots) {
      expect(shot.prompt).toContain('Timeline:');
      expect(shot.prompt).toContain('Camera rules: one camera move per shot');
    }
  });

  it('rejects a storyboard outside the shot-count bounds before compiling requests', () => {
    const tooFew = compileStoryboard(plan({ shots: [createStoryboardShot('product3d', 0)] }));
    expect(tooFew.errors.some((e) => e.includes('at least'))).toBe(true);

    const shots = Array.from({ length: MAX_STORYBOARD_SHOTS + 1 }, (_, i) =>
      createStoryboardShot('product3d', i),
    );
    const tooMany = compileStoryboard(plan({ shots }));
    expect(tooMany.errors.some((e) => e.includes('at most'))).toBe(true);
  });

  it('surfaces Camera Director validation errors per shot, prefixed by shot number', () => {
    const result = compileStoryboard(plan({ subject: '' }));
    expect(result.errors.some((e) => e.startsWith('Shot 1: ') && e.includes('Describe'))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.startsWith('Shot 2: ') && e.includes('Describe'))).toBe(
      true,
    );
  });

  it('targets minimax/h3-max with no reference image attached', () => {
    const result = compileStoryboard(plan({ hasStartFrame: false }));
    expect(result.shots.every((s) => s.request.model === STORYBOARD_MODELS.text)).toBe(true);
    expect(result.shots.every((s) => s.request.params.aspectRatio === '16:9')).toBe(true);
  });

  it('attaches the same start-frame image to every shot when one is available', () => {
    const result = compileStoryboard(plan({ hasStartFrame: true }), {
      imageUrl: 'https://cdn.example.com/can.png',
    });
    expect(result.shots.every((s) => s.request.model === STORYBOARD_MODELS.startFrame)).toBe(true);
    expect(
      result.shots.every((s) => s.request.params.imageUrl === 'https://cdn.example.com/can.png'),
    ).toBe(true);
  });

  it('switches to the reference-to-video model and 2K when reference mode is selected', () => {
    const result = compileStoryboard(
      plan({ hasStartFrame: true, referenceMode: 'reference', template: 'onModel' }),
      { imageUrl: 'https://cdn.example.com/dress.png' },
    );
    expect(result.shots.every((s) => s.request.model === STORYBOARD_MODELS.reference)).toBe(true);
    expect(result.shots.every((s) => s.request.params.resolution === '2K')).toBe(true);
    expect(
      result.shots.every((s) =>
        s.request.params.imageUrls?.includes('https://cdn.example.com/dress.png'),
      ),
    ).toBe(true);
  });

  it('assigns each shot its own seed, passed through from the caller', () => {
    const result = compileStoryboard(plan(), { seeds: [11, 22] });
    expect(result.shots.map((s) => s.request.params.seed)).toEqual([11, 22]);
  });

  it('estimates total cost from total duration and resolution rate', () => {
    const result = compileStoryboard(plan({ hasStartFrame: false }));
    expect(result.totalCost).toBeCloseTo(result.totalDuration * 0.16, 5);
  });
});
