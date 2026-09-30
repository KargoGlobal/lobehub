import { describe, expect, it } from 'vitest';

import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header row and escapes quotes, commas and newlines', () => {
    const csv = toCsv(
      [{ a: 'x,y', b: 'say "hi"', c: 'line\nbreak', d: 3, e: null }],
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
        { key: 'd', label: 'D' },
        { key: 'e', label: 'E' },
      ],
    );
    expect(csv).toBe('A,B,C,D,E\r\n"x,y","say ""hi""","line\nbreak",3,');
  });

  it('guards formula-injection prefixes with a leading single quote', () => {
    const csv = toCsv(
      [{ a: '=HYPERLINK("x")', b: '+1', c: '-2', d: '@x', e: 'plain' }],
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
        { key: 'd', label: 'D' },
        { key: 'e', label: 'E' },
      ],
    );
    expect(csv).toBe('A,B,C,D,E\r\n"\'=HYPERLINK(""x"")",\'+1,\'-2,\'@x,plain');
  });
});
