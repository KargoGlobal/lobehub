import { describe, expect, it } from 'vitest';

import {
  allocateShots,
  BACKGROUND_STYLES,
  buildShotsForStyle,
  compilePlan,
  createDefaultPlan,
  type DirectorPlan,
  MAX_SHOTS,
  MIN_SHOT_SECONDS,
  PRODUCT_STYLES,
  recommendedSettings,
  supportsCameraDirector,
} from './compiler';

const productPlan = (overrides: Partial<DirectorPlan> = {}): DirectorPlan => ({
  ...createDefaultPlan('product3d'),
  subject: 'a 330ml matte black aluminium energy drink can with a silver pull tab',
  ...overrides,
});

const backgroundPlan = (overrides: Partial<DirectorPlan> = {}): DirectorPlan => ({
  ...createDefaultPlan('background3d'),
  ...overrides,
});

const timelineLines = (prompt: string) => prompt.split('\n').filter((l) => /^\d+–\d+s:/.test(l));

describe('allocateShots', () => {
  it('splits by weight into integer seconds that sum exactly to the total', () => {
    const shots = buildShotsForStyle('product3d', 'orbitThenDetail'); // weights 3:2
    const timeline = allocateShots(shots, 10);
    expect(timeline.map((t) => [t.start, t.end])).toEqual([
      [0, 6],
      [6, 10],
    ]);
    expect(timeline.at(-1)!.end).toBe(10);
  });

  it('never loses or gains a second on awkward splits', () => {
    const shots = buildShotsForStyle('product3d', 'topDownReveal'); // 3:2
    for (const total of [5, 7, 9, 11, 13, 15]) {
      const timeline = allocateShots(shots, total);
      expect(timeline[0].start).toBe(0);
      expect(timeline.at(-1)!.end).toBe(total);
      const sum = timeline.reduce((acc, t) => acc + (t.end - t.start), 0);
      expect(sum).toBe(total);
    }
  });

  it('gives a single shot the whole duration', () => {
    const [only] = allocateShots(buildShotsForStyle('product3d', 'turntable360'), 8);
    expect([only.start, only.end]).toEqual([0, 8]);
  });

  it('returns an empty timeline for no shots', () => {
    expect(allocateShots([], 8)).toEqual([]);
  });
});

describe('buildShotsForStyle', () => {
  it('defines at least one shot for every product style', () => {
    for (const { id } of PRODUCT_STYLES) {
      expect(buildShotsForStyle('product3d', id).length).toBeGreaterThan(0);
    }
  });

  it('defines exactly one shot for every background style (loops are single shots)', () => {
    for (const { id } of BACKGROUND_STYLES) {
      expect(buildShotsForStyle('background3d', id)).toHaveLength(1);
    }
  });

  it('uses two shots for the compound product styles', () => {
    expect(buildShotsForStyle('product3d', 'orbitThenDetail')).toHaveLength(2);
    expect(buildShotsForStyle('product3d', 'topDownReveal')).toHaveLength(2);
  });

  it('never stacks camera moves: rotation styles pair a moving camera with a still subject or vice versa', () => {
    const turntable = buildShotsForStyle('product3d', 'turntable360')[0];
    expect(turntable.camera).toBe('static');
    expect(turntable.subjectAction).toMatch(/rotates one full 360°/);

    const orbit = buildShotsForStyle('product3d', 'orbit360')[0];
    expect(orbit.camera).toBe('orbit');
    expect(orbit.degrees).toBe(360);
    expect(orbit.subjectAction).toMatch(/perfectly still/);
  });
});

describe('compilePlan — product ad', () => {
  it('blocks on an empty product description', () => {
    const { errors } = compilePlan(productPlan({ subject: '' }));
    expect(errors).toContain('Describe the product.');
  });

  it('produces a complete, well-formed prompt for the default turntable ad', () => {
    const { prompt, errors, timeline } = compilePlan(productPlan(), {
      resolution: '1080P',
      seed: 7,
    });

    expect(errors).toEqual([]);
    expect(timeline).toHaveLength(1);
    expect(prompt).toContain('Subject: a 330ml matte black aluminium energy drink can');
    expect(prompt).toContain('Featured detail: the logo on the front label.');
    expect(prompt).toContain('Timeline:');
    expect(timelineLines(prompt)).toEqual([expect.stringMatching(/^0–8s: Medium shot\./)]);
    expect(prompt).toMatch(/rotates one full 360° turn clockwise on the turntable/);
    expect(prompt).toMatch(/The camera is locked off/);
    expect(prompt).toContain('Camera rules: one camera move per shot');
    expect(prompt).toContain('legible label text');
    expect(prompt).toContain('No hands, people or extra objects.');
    expect(prompt).toContain('non_diegetic_music: N/A');
    // Advertising: never invent copy on screen.
    expect(prompt).toMatch(/No on-screen text/);
  });

  it('emits one camera sentence per shot and timestamps that cover the full duration', () => {
    const plan = productPlan({
      duration: 10,
      shots: buildShotsForStyle('product3d', 'orbitThenDetail'),
      style: 'orbitThenDetail',
    });
    const { prompt, errors } = compilePlan(plan, { resolution: '1080P', seed: 1 });
    expect(errors).toEqual([]);

    const lines = timelineLines(prompt);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^0–6s:/);
    expect(lines[1]).toMatch(/^6–10s:/);
    for (const line of lines) {
      expect(line.match(/The camera |The lens /g)?.length ?? 0).toBe(1);
    }
    expect(lines[0]).toContain('orbits 180° clockwise');
    expect(lines[1]).toContain('dollies in');
    expect(lines[1]).toContain('toward the logo on the front label');
  });

  it('asks a 360° orbit to close the circle exactly where it started', () => {
    const plan = productPlan({
      shots: buildShotsForStyle('product3d', 'orbit360'),
      style: 'orbit360',
    });
    const { prompt } = compilePlan(plan);
    expect(prompt).toContain('ends at exactly the position and angle where it started');
  });

  it('references the opening frame and locks product fidelity when a start frame is attached', () => {
    const { prompt, warnings } = compilePlan(productPlan({ hasStartFrame: true }), {
      resolution: '1080P',
      seed: 1,
    });
    expect(prompt.startsWith('Reference: the opening frame shows the product.')).toBe(true);
    expect(prompt).toContain('do not redesign it');
    expect(warnings).not.toContain(expect.stringContaining('start frame'));
  });

  it('warns when a product ad has no start frame, low resolution, or no seed', () => {
    const { warnings } = compilePlan(productPlan({ hasStartFrame: false }), {
      resolution: '768P',
      seed: null,
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Attach a product photo as the start frame'),
        'Set resolution to 1080P for ad delivery.',
        'Lock a seed so revisions reproduce the same motion.',
      ]),
    );
  });

  it('flags vague prompt words that degrade H3 output', () => {
    const { warnings } = compilePlan(productPlan({ subject: 'a cinematic, dynamic 4k sneaker' }));
    expect(
      warnings.some((w) => w.includes('cinematic') && w.includes('dynamic') && w.includes('4k')),
    ).toBe(true);
  });
});

describe('compilePlan — background loop', () => {
  it('produces a loopable single-shot background with a copy-safe centre', () => {
    const { prompt, errors, warnings } = compilePlan(backgroundPlan(), {
      resolution: '1080P',
      seed: 3,
    });
    expect(errors).toEqual([]);
    expect(prompt).toContain('rendered as clean 3D');
    expect(timelineLines(prompt)).toEqual([expect.stringMatching(/^0–10s: Wide shot\./)]);
    expect(prompt).toContain('Loop: the final frame matches the opening frame exactly');
    expect(prompt).toContain('keep the centre third of the frame visually quiet');
    expect(prompt).toContain('No people, characters, hands, products');
    expect(prompt).toContain('No strobing or flicker');
    expect(warnings).toEqual([]);
  });

  it('omits the copy-safe composition note when disabled', () => {
    const { prompt } = compilePlan(backgroundPlan({ copySafeZone: false }));
    expect(prompt).not.toContain('centre third');
  });

  it('describes orbit, drift and tunnel backgrounds with a single camera move each', () => {
    for (const style of ['orbit', 'drift', 'tunnel'] as const) {
      const plan = backgroundPlan({ shots: buildShotsForStyle('background3d', style), style });
      const { prompt, errors } = compilePlan(plan, { resolution: '1080P', seed: 1 });
      expect(errors).toEqual([]);
      const [line] = timelineLines(prompt);
      expect(line.match(/The camera |The lens /g)?.length ?? 0).toBe(1);
    }
  });

  it('tells the user the end frame will mirror the start frame when looping from an image', () => {
    const { warnings } = compilePlan(backgroundPlan({ hasStartFrame: true }));
    expect(warnings).toContain(
      'Seamless loop: the end frame will be set to the start frame to force loop closure.',
    );
  });

  it('warns that loops should be a single shot', () => {
    const plan = backgroundPlan({
      duration: 12,
      shots: [
        ...buildShotsForStyle('background3d', 'orbit'),
        ...buildShotsForStyle('background3d', 'drift'),
      ],
    });
    expect(compilePlan(plan).warnings).toContain('Loops work best as a single continuous shot.');
  });

  it('uses ambient room tone wording when audio is ambient', () => {
    const { prompt } = compilePlan(backgroundPlan({ audio: 'ambient' }));
    expect(prompt).toContain('subtle ambient studio room tone only');
    expect(prompt).toContain('non_diegetic_music: N/A');
  });
});

describe('compilePlan — shot budget rules', () => {
  it(`rejects shots shorter than ${MIN_SHOT_SECONDS}s`, () => {
    const three = [
      ...buildShotsForStyle('product3d', 'orbitThenDetail'),
      ...buildShotsForStyle('product3d', 'turntable360'),
    ];
    const { errors } = compilePlan(productPlan({ duration: 5, shots: three }));
    expect(errors.some((e) => e.includes(`shorter than ${MIN_SHOT_SECONDS}s`))).toBe(true);
  });

  it(`rejects more than ${MAX_SHOTS} shots`, () => {
    const five = Array.from(
      { length: 5 },
      () => buildShotsForStyle('product3d', 'turntable360')[0],
    );
    const { errors } = compilePlan(productPlan({ duration: 15, shots: five }));
    expect(errors).toContain(`Use at most ${MAX_SHOTS} shots per clip.`);
  });

  it('rejects durations outside 5–15s or non-integers', () => {
    expect(compilePlan(productPlan({ duration: 4 })).errors.join()).toMatch(/between 5 and 15/);
    expect(compilePlan(productPlan({ duration: 16 })).errors.join()).toMatch(/between 5 and 15/);
    expect(compilePlan(productPlan({ duration: 7.5 })).errors.join()).toMatch(/whole number/);
  });

  it('rejects an empty shot list', () => {
    expect(compilePlan(productPlan({ shots: [] })).errors).toContain('Add at least one shot.');
  });
});

describe('supportsCameraDirector', () => {
  it('enables the Director for MiniMax H3 ids only', () => {
    expect(supportsCameraDirector('minimax/h3-max')).toBe(true);
    expect(supportsCameraDirector('minimax/h3-max/image-to-video')).toBe(true);
    expect(supportsCameraDirector('minimax/h3')).toBe(true);
    expect(supportsCameraDirector('MiniMax-H3')).toBe(true);
    expect(supportsCameraDirector('fal-ai/veo3.1')).toBe(false);
    expect(supportsCameraDirector('MiniMax-Hailuo-02')).toBe(false);
    expect(supportsCameraDirector('h30-model')).toBe(false);
    expect(supportsCameraDirector('')).toBe(false);
    expect(supportsCameraDirector(null)).toBe(false);
  });
});

describe('recommendedSettings', () => {
  it('maps placement to aspect ratio and picks ad-grade defaults', () => {
    expect(recommendedSettings(productPlan({ placement: 'vertical', duration: 8 }))).toEqual({
      aspectRatio: '9:16',
      duration: 8,
      promptExtend: 'quality',
      resolution: '1080P',
    });
    expect(recommendedSettings(backgroundPlan({ placement: 'square' }))).toMatchObject({
      aspectRatio: '1:1',
      promptExtend: 'balanced',
    });
  });
});
