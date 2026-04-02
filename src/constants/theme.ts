export const COLORS = {
  bg:       '#0F0F13',
  surface:  '#16161C',
  surface2: '#1E1E27',
  border:   '#222230',
  borderHi: '#32324A',

  accent:   '#7C5CF6',
  accentHi: '#9D80FF',

  success:  '#22C55E',
  danger:   '#F43F5E',
  warning:  '#FBBF24',

  text:     '#F2F2F7',
  text2:    '#8585A0',
  text3:    '#3A3A50',

  // Legacy aliases kept for any references that may exist
  background:   '#0F0F13',
  card:         '#1E1E27',
  primary:      '#7C5CF6',
  primaryLight: '#9D80FF',
  accentLight:  '#9D80FF',
  textMuted:    '#8585A0',
  textDim:      '#3A3A50',
  truthColor:   '#22C55E',
  lieColor:     '#F43F5E',
} as const;

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   18,
  xl:   24,
  full: 9999,
} as const;
