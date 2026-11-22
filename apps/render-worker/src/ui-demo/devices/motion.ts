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
    /* The answer to a press: a short scale-and-light pulse that returns to rest.
       It has to be visible, otherwise a tap is a gesture with no reaction. */
    case 'activate': {
      const pulse = Math.sin(progress * Math.PI);

      return {
        transform: `scale(${(1 + 0.02 * pulse).toFixed(4)})`,
        filter: `brightness(${(1 + 0.2 * pulse).toFixed(4)})`,
      };
    }
    case 'drag':
      return { transform: `translateX(${(1 - progress) * -240}px)` };
    /* draw / fill / type / break animate their own geometry, not opacity. */
    case 'draw':
    case 'fill':
    case 'type':
    case 'break':
    case 'hold':
      return {};
    default:
      return { opacity: progress };
  }
}



