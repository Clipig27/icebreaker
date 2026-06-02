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

// ─── Font families ───────────────────────────────────────────────────────────
// Maps weight names to the loaded Exo 2 font identifiers.
// Use FONTS.medium for body, FONTS.bold for subheadings, FONTS.extrabold for titles.

export const FONTS = {
  medium:    'Exo2_500Medium',
  semibold:  'Exo2_600SemiBold',
  bold:      'Exo2_700Bold',
  extrabold: 'Exo2_800ExtraBold',
} as const;

// ─── Motion presets ──────────────────────────────────────────────────────────
// Use these instead of ad-hoc speed/bounciness values.
// "spring" configs use RN Animated's spring() params.
// "timing" configs are durations in ms for Animated.timing().

export const MOTION = {
  // Snappy press feedback — fast in, no bounce (buttons on press-in)
  springPress: { speed: 60, bounciness: 0, useNativeDriver: true },

  // Bouncy release — satisfying pop-back (buttons on press-out)
  springRelease: { speed: 18, bounciness: 10, useNativeDriver: true },

  // Entrance spring — elements sliding/fading into view
  springEnter: { speed: 20, bounciness: 6, useNativeDriver: true },

  // Playful spring — tab icons, card flips, celebratory moments
  springPlayful: { speed: 25, bounciness: 14, useNativeDriver: true },

  // Durations for timing-based animations
  timing: {
    fast:   150,  // quick fades, micro-interactions
    medium: 250,  // standard transitions
    slow:   400,  // dramatic reveals, phase changes
  },
} as const;

// ─── Type scale ──────────────────────────────────────────────────────────────
// Named text styles. Use these instead of raw fontSize/fontWeight combos.
// fontFamily will be applied in Step 4 when we unify the typeface.

export const TYPE = {
  // Big titles — "ICEBREAKER", game names on splash
  display: {
    fontSize: 36,
    fontFamily: FONTS.extrabold,
    letterSpacing: 2,
  },

  // Screen headers — "Host a Game", "Friends"
  heading: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    letterSpacing: 0.5,
  },

  // Section headers, card titles — game names in lists
  subheading: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    letterSpacing: 0.3,
  },

  // Default readable text — descriptions, rules, chat
  body: {
    fontSize: 15,
    fontFamily: FONTS.medium,
  },

  // Buttons, input text, emphasized body
  label: {
    fontSize: 15,
    fontFamily: FONTS.bold,
  },

  // Secondary info — timestamps, helper text
  caption: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
  },

  // Tiny text — badges, tags, tab labels
  micro: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    letterSpacing: 0.5,
  },
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────
// Reusable shadow presets. Spread these into StyleSheet styles.
// e.g. { ...SHADOWS.card }

export const SHADOWS = {
  // Subtle lift for cards and surfaces
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  // Stronger depth for modals and overlays
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  // Colored glow — use with a tinted shadowColor
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 } as { width: number; height: number },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  }),
};
