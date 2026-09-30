import numeral from 'numeral';

export const formatUsd = (value: number) => numeral(value).format('$0,0.00');

export const formatCount = (value: number) => numeral(value).format('0,0');

/** `null` rates render as a placeholder dash. */
export const formatPercent = (value: number | null, digits = 1) =>
  value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
