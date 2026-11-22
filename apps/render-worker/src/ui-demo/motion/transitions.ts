import { Easing, interpolate } from 'remotion';

/**
 * Motion vocabulary for transitions between two scenes. Every mechanism is a
 * pure function of `progress` (0 → 1), so a still, a preview and a render all
 * agree and the result never depends on wall-clock time.
 *
 * The demo renders the same A → B pair with each mechanism to make amplitude,
 * duration and easing comparable.
 */
export const TRANSITION_IDS = [
  'cut',
  'zoom',
  'blur',
  'morph',
  'match-cut',
  'mask-reveal',
  'layer',
  'spatial',
] as const;

export type TransitionId = (typeof TRANSITION_IDS)[number];

export interface LayerStyle {
  readonly opacity: number;
  readonly transform: string;
  readonly filter: string;
  readonly clipPath: string;
  readonly zIndex: number;
}

export interface TransitionFrame {
  readonly outgoing: LayerStyle;
  readonly incoming: LayerStyle;
  /** White impact flash on top of both layers. */
  readonly flash: number;
}

const NEUTRAL: LayerStyle = {
  opacity: 1,
  transform: 'none',
  filter: 'none',
  clipPath: 'none',
  zIndex: 1,
};

function easeOut(value: number): number {
  return interpolate(value, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

function easeInOut(value: number): number {
  return interpolate(value, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
}

/**
 * `progress` runs 0 → 1 across the transition window. Values below 0.5 favour
 * the outgoing scene, above 0.5 the incoming one; `cut` switches at 0.5.
 */
export function transitionFrame(
  id: TransitionId,
  progress: number,
): TransitionFrame {
  const t = Math.min(1, Math.max(0, progress));

  switch (id) {
    case 'cut':
      return {
        outgoing: { ...NEUTRAL, opacity: t < 0.5 ? 1 : 0 },
        incoming: { ...NEUTRAL, opacity: t < 0.5 ? 0 : 1, zIndex: 2 },
        flash: t < 0.5 ? 0 : Math.max(0, 1 - Math.abs(t - 0.55) * 12),
      };
    case 'zoom': {
      const eased = easeInOut(t);

      return {
        outgoing: {
          ...NEUTRAL,
          transform: `scale(${1 + 0.18 * eased})`,
          opacity: 1 - eased,
        },
        incoming: {
          ...NEUTRAL,
          transform: `scale(${1.14 - 0.14 * eased})`,
          opacity: eased,
          zIndex: 2,
        },
        flash: 0,
      };
    }
    case 'blur': {
      const eased = easeInOut(t);

      return {
        outgoing: {
          ...NEUTRAL,
          filter: `blur(${eased * 18}px)`,
          opacity: 1 - eased,
        },
        incoming: {
          ...NEUTRAL,
          filter: `blur(${(1 - eased) * 18}px)`,
          opacity: eased,
          zIndex: 2,
        },
        flash: 0,
      };
    }
    case 'morph': {
      /* Cross-fade with a soft vertical drift: the two layouts read as one
         object that changes shape rather than two slides. */
      const eased = easeInOut(t);

      return {
        outgoing: {
          ...NEUTRAL,
          transform: `translateY(${-40 * eased}px) scale(${1 - 0.03 * eased})`,
          opacity: 1 - eased,
          filter: `blur(${eased * 4}px)`,
        },
        incoming: {
          ...NEUTRAL,
          transform: `translateY(${40 * (1 - eased)}px) scale(${0.97 + 0.03 * eased})`,
          opacity: eased,
          filter: `blur(${(1 - eased) * 4}px)`,
          zIndex: 2,
        },
        flash: 0,
      };
    }
    case 'match-cut': {
      /* Both layers scale from the same origin, so the shared element appears
         to travel; the outgoing layer stays sharp longer than a cross-fade. */
      const eased = easeInOut(t);

      return {
        outgoing: {
          ...NEUTRAL,
          transform: `scale(${1 - 0.08 * eased})`,
          opacity: interpolate(eased, [0, 0.7, 1], [1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        },
        incoming: {
          ...NEUTRAL,
          transform: `scale(${0.9 + 0.1 * eased})`,
          opacity: interpolate(eased, [0, 0.45, 1], [0, 0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          zIndex: 2,
        },
        flash: 0,
      };
    }
    case 'mask-reveal': {
      const eased = easeInOut(t);

      return {
        outgoing: { ...NEUTRAL },
        incoming: {
          ...NEUTRAL,
          clipPath: `inset(0 ${(1 - eased) * 100}% 0 0)`,
          zIndex: 2,
        },
        flash: 0,
      };
    }
    case 'layer': {
      const eased = easeOut(t);

      return {
        outgoing: {
          ...NEUTRAL,
          transform: `translateX(${-30 * eased}px)`,
          opacity: 1 - 0.35 * eased,
        },
        incoming: {
          ...NEUTRAL,
          transform: `translateX(${1080 * (1 - eased)}px)`,
          zIndex: 2,
        },
        flash: 0,
      };
    }
    case 'spatial': {
      /* Push-in on the outgoing scene and pull-out on the incoming one with a
         shared vanishing point: reads as camera movement, not a slide. */
      const eased = easeInOut(t);

      return {
        outgoing: {
          ...NEUTRAL,
          transform: `perspective(1400px) translateZ(${360 * eased}px)`,
          opacity: 1 - eased,
          filter: `blur(${eased * 6}px)`,
        },
        incoming: {
          ...NEUTRAL,
          transform: `perspective(1400px) translateZ(${-240 * (1 - eased)}px)`,
          opacity: eased,
          filter: `blur(${(1 - eased) * 8}px)`,
          zIndex: 2,
        },
        flash: 0,
      };
    }
  }
}
