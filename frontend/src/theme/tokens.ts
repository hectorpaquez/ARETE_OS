// ARETÉ Design tokens — derived from /app/design_guidelines.json
// Palette: obsidian canvas + antique gold accent.

export const colors = {
  surface: "#0C0C0E",
  onSurface: "#EAEAEA",
  surfaceSecondary: "#141416",
  onSurfaceSecondary: "#A3A3A8",
  surfaceTertiary: "#1C1C1F",
  onSurfaceTertiary: "#7D7D82",
  surfaceInverse: "#EAEAEA",
  onSurfaceInverse: "#0C0C0E",

  brand: "#C8A97E",
  brandPrimary: "#C8A97E",
  onBrandPrimary: "#0C0C0E",
  brandSecondary: "#8C7355",
  brandTertiary: "#2D261C",
  onBrandTertiary: "#C8A97E",

  success: "#314235",
  onSuccess: "#B3CFB9",
  warning: "#544020",
  onWarning: "#EAD2A8",
  error: "#5C2323",
  onError: "#E8B0B0",
  info: "#2A3745",
  onInfo: "#B0CBE8",

  border: "#222226",
  borderStrong: "#333338",
  divider: "#18181A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = {
  sm: 2,
  md: 6,
  lg: 12,
  pill: 999,
};

// Fonts: Cormorant Garamond (display serif) + Geist (body). We use system
// fallbacks so the app boots without shipping font files. Editorial serif
// falls back to iOS "Georgia" which is imposing and elegant enough.
export const fonts = {
  displaySerif: "Georgia",
  displaySerifBold: "Georgia",
  body: "System",
  mono: "Menlo",
};

export const typography = {
  h1: { fontFamily: fonts.displaySerif, fontSize: 34, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.displaySerif, fontSize: 26, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.displaySerif, fontSize: 20 },
  bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
  },
};

export const theme = { colors, spacing, radii, fonts, typography };
export default theme;
