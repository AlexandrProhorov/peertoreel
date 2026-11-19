import type { StoryboardStyle } from '@peertoreel/contracts';

/**
 * M3.5 uses the same flat 2D style as the M3.4 showcase. The style is data:
 * a real style preset (studio_flat_2d_v1) arrives in M3.6.
 */
export const M3_5_STYLE: StoryboardStyle = {
  styleId: 'flat_2d_motion',
  palette: {
    background: ['#0b1220', '#16233c'],
    accent: '#ffd166',
    text: '#ffffff',
    cold: '#8ecae6',
    danger: '#ef476f',
  },
  typography: {
    heading: 'Montserrat',
    body: 'Inter',
    headingWeight: 900,
  },
  effects: ['vignette', 'glow'],
};
