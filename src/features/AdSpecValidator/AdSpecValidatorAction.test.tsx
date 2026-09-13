import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdSpecValidatorAction } from './AdSpecValidatorAction';

// The test i18n instance doesn't preload the 'image' namespace, so mirror
// the real English copy here deterministically (same approach as the
// neighboring ImageEditToolButton test).
const DICT: Record<string, string> = {
  'adSpecValidator.assetSummary': '{{width}}×{{height}}px',
  'adSpecValidator.assetSummaryWithDuration': '{{width}}×{{height}}px · {{duration}}s',
  'adSpecValidator.autoOption': 'Auto — closest matches',
  'adSpecValidator.category.ctv': 'CTV / Video',
  'adSpecValidator.category.display': 'Display',
  'adSpecValidator.category.social': 'Social',
  'adSpecValidator.noMatches': 'No standard format closely matches this asset.',
  'adSpecValidator.status.fail': 'Fail',
  'adSpecValidator.status.pass': 'Pass',
  'adSpecValidator.status.warn': 'Close',
  'adSpecValidator.targetLabel': 'Target format',
  'adSpecValidator.title': 'Ad-size / CTV spec check',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const template = DICT[key] ?? key;
      return vars
        ? template.replaceAll(/\{\{(\w+)\}\}/g, (_match, name) => String(vars[name] ?? ''))
        : template;
    },
  }),
}));

// Always render the popover trigger + content together — mirrors the
// established simplification for popover-based actions in this directory
// (see ImageEditToolButton.test.tsx) rather than simulating real
// open/hover/click mechanics.
vi.mock('@lobehub/ui', async () => {
  const React = await import('react');
  return {
    Flexbox: ({ children, ...rest }: any) => React.createElement('div', rest, children),
    Popover: ({ children, content }: any) => React.createElement('div', null, children, content),
  };
});

vi.mock('@lobehub/ui/base-ui', async () => {
  const React = await import('react');
  return {
    ActionIcon: ({ title, onClick }: any) =>
      React.createElement('button', { 'aria-label': title, onClick, 'type': 'button' }, title),
    Select: ({ options, value, onChange }: any) =>
      React.createElement(
        'select',
        {
          'aria-label': 'target-format',
          'onChange': (e: any) => onChange(e.target.value),
          value,
        },
        (options ?? []).map((option: any) =>
          React.createElement('option', { key: option.value, value: option.value }, option.label),
        ),
      ),
    Tag: ({ children, color }: any) =>
      React.createElement('span', { 'data-color': color, 'data-testid': 'spec-tag' }, children),
    Text: ({ children }: any) => React.createElement('span', null, children),
  };
});

describe('AdSpecValidatorAction', () => {
  it('shows the asset summary without a duration for an image-sized asset', () => {
    render(<AdSpecValidatorAction height={250} width={300} />);

    expect(screen.getByText('300×250px')).toBeTruthy();
  });

  it('shows the asset summary with a duration for a video-sized asset', () => {
    render(<AdSpecValidatorAction duration={15} height={1080} width={1920} />);

    expect(screen.getByText('1920×1080px · 15s')).toBeTruthy();
  });

  it('auto-detects and passes an exact Medium Rectangle match', () => {
    render(<AdSpecValidatorAction height={250} width={300} />);

    expect(screen.getByText('Medium Rectangle (300×250)')).toBeTruthy();
    const tags = screen.getAllByTestId('spec-tag');
    expect(tags.some((tag) => tag.textContent === 'Pass')).toBe(true);
  });

  it('shows no-matches copy for an asset that is far from every known format', () => {
    render(<AdSpecValidatorAction height={1} width={100} />);

    expect(screen.getByText('No standard format closely matches this asset.')).toBeTruthy();
  });

  it('shows a fail checklist when the user explicitly targets a mismatched format', () => {
    render(<AdSpecValidatorAction height={250} width={300} />);

    const select = screen.getByLabelText('target-format');
    fireEvent.change(select, { target: { value: 'display-leaderboard' } });

    expect(screen.getByText('Leaderboard (728×90)')).toBeTruthy();
    const tags = screen.getAllByTestId('spec-tag');
    expect(tags.some((tag) => tag.textContent === 'Fail')).toBe(true);
  });
});
