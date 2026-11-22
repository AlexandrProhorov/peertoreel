/**
 * Theme tokens for interface scenes. Components never hardcode a color: they
 * read the theme object that the episode (or a single scene) selected.
 *
 * `studio-dark` / `studio-light` reproduce the reference recording: a black or
 * white stage, a lime accent card, and a muted ink for secondary text.
 */
export const UI_THEME_IDS = ['studio-dark', 'studio-light', 'studio-lime'] as const;

export type UiThemeId = (typeof UI_THEME_IDS)[number];

export interface UiTheme {
  readonly id: UiThemeId;
  readonly background: string;
  readonly grid: string;
  readonly ink: string;
  readonly muted: string;
  readonly surface: string;
  readonly surfaceInk: string;
  readonly accent: string;
  readonly accentInk: string;
  readonly border: string;
  readonly skeleton: string;
}

export const UI_THEMES: Record<UiThemeId, UiTheme> = {
  'studio-dark': {
    id: 'studio-dark',
    background: '#0A0A0B',
    grid: 'rgba(255, 255, 255, 0.05)',
    ink: '#FFFFFF',
    muted: '#8B8B93',
    surface: '#161618',
    surfaceInk: '#F5F5F7',
    accent: '#CCFF00',
    accentInk: '#0B0B0C',
    border: 'rgba(255, 255, 255, 0.14)',
    skeleton: '#1E1E21',
  },
  'studio-light': {
    id: 'studio-light',
    background: '#FFFFFF',
    grid: 'rgba(10, 10, 12, 0.05)',
    ink: '#0B0B0C',
    /* Muted is body text, so it must clear 4.5:1 on white (5.70) and on the
       surface (5.14). The previous #8A8A90 was 3.43 — the gate was right. */
    muted: '#66666D',
    surface: '#F3F3F5',
    surfaceInk: '#0B0B0C',
    accent: '#CCFF00',
    accentInk: '#0B0B0C',
    border: 'rgba(10, 10, 12, 0.10)',
    skeleton: '#EFEFF2',
  },
  'studio-lime': {
    id: 'studio-lime',
    background: '#CCFF00',
    grid: 'rgba(11, 11, 12, 0.07)',
    ink: '#0B0B0C',
    muted: '#4F5512',
    surface: '#FFFFFF',
    surfaceInk: '#0B0B0C',
    accent: '#CCFF00',
    accentInk: '#0B0B0C',
    border: 'rgba(11, 11, 12, 0.14)',
    skeleton: 'rgba(11, 11, 12, 0.08)',
  },
};

/**
 * The accent as a plate. On the lime theme the background IS the accent, so an
 * accent plate would be invisible: the plate flips to the dark ink instead.
 */
export function accentPlate(theme: UiTheme): string {
  return theme.background.toLowerCase() === theme.accent.toLowerCase()
    ? theme.accentInk
    : theme.accent;
}

/** Ink that reads on `accentPlate`. */
export function accentPlateInk(theme: UiTheme): string {
  return theme.background.toLowerCase() === theme.accent.toLowerCase()
    ? theme.accent
    : theme.accentInk;
}

/** Gradient stages for `object-reveal`; the object itself stays a local asset. */export const OBJECT_TONES = {
  warm: { from: '#FFA24A', to: '#F0561A', ink: '#FFFFFF' },
  lime: { from: '#DCFF57', to: '#C6F800', ink: '#0B0B0C' },
  dark: { from: '#1A1A1E', to: '#050506', ink: '#FFFFFF' },
} as const;

export type ObjectTone = keyof typeof OBJECT_TONES;

export function themeById(id: UiThemeId): UiTheme {
  return UI_THEMES[id];
}

/**
 * One palette, one vocabulary.
 *
 * A model may name a colour by role (`accent`, `surface`, `ink`) or repeat a hex
 * it saw in the theme. Anything else is not a colour from our palette: it is
 * either a role name that does not exist (dropped) or a foreign hex snapped to
 * the nearest theme colour, with a repair record. That is what keeps contrast
 * checks meaningful — the gate never compares two hand-made colours.
 */
export const COLOR_ROLES = [
  'background',
  'surface',
  'surfaceInk',
  'ink',
  'muted',
  'accent',
  'accentInk',
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];

export interface ResolvedColor {
  readonly hex: string;
  /** Null when the value was already a palette hex; otherwise what we changed. */
  readonly note: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

function distance(first: string, second: string): number {
  const dr = channel(first, 1) - channel(second, 1);
  const dg = channel(first, 3) - channel(second, 3);
  const db = channel(first, 5) - channel(second, 5);

  return dr * dr + dg * dg + db * db;
}

function paletteOf(theme: UiTheme): readonly { role: ColorRole; hex: string }[] {
  return COLOR_ROLES.map((role) => ({ role, hex: theme[role] }));
}

/** Resolve a role name or a theme hex; null when the value is neither. */
export function resolveThemeColor(theme: UiTheme, value: string): ResolvedColor | null {
  const trimmed = value.trim();

  const role = COLOR_ROLES.find((name) => name.toLowerCase() === trimmed.toLowerCase());

  if (role !== undefined) {
    return { hex: theme[role], note: `role ${role}` };
  }

  if (!HEX.test(trimmed)) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const exact = paletteOf(theme).find((entry) => entry.hex.toLowerCase() === lower);

  if (exact !== undefined) {
    return { hex: exact.hex, note: exact.hex === trimmed ? null : 'palette hex in another case' };
  }

  const nearest = paletteOf(theme).reduce((best, entry) =>
    distance(lower, entry.hex) < distance(lower, best.hex) ? entry : best,
  );

  return { hex: nearest.hex, note: `not from the theme, nearest is ${nearest.hex}` };
}

