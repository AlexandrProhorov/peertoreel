import type { CSSProperties } from 'react';

export function behaviorStyle(
  transition: string | undefined,
  progress: number,
): CSSProperties {
  switch (transition) {
    case 'disappear':
      return { opacity: 1 - progress };
    case 'appear':
      return {
        opacity: progress,
        transform: `translateY(${(1 - progress) * 24}px)`,
      };
    case 'move':
      return { transform: `translateY(${-24 * progress}px)` };
    case 'scale':
      return { transform: `scale(${1 + 0.06 * progress})` };
    case 'highlight':
      return { filter: `brightness(${1 + 0.35 * Math.sin(progress * Math.PI)})` };
    case 'drag':
      return { transform: `translateX(${(1 - progress) * -240}px)` };
    /* draw / fill / type / break animate their own geometry, not opacity. */
    case 'draw':
    case 'fill':
    case 'type':
    case 'break':
    case 'activate':
    case 'hold':
      return {};
    default:
      return { opacity: progress };
  }
}



