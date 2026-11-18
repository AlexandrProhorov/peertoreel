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

/** Gradient stages for `object-reveal`; the object itself stays a local asset. */
export const OBJECT_TONES = {
  warm: { from: '#FFA24A', to: '#F0561A', ink: '#FFFFFF' },
  lime: { from: '#DCFF57', to: '#C6F800', ink: '#0B0B0C' },
  dark: { from: '#1A1A1E', to: '#050506', ink: '#FFFFFF' },
} as const;

export type ObjectTone = keyof typeof OBJECT_TONES;

export function themeById(id: UiThemeId): UiTheme {
  return UI_THEMES[id];
}
