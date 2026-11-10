import type {
  RecipeLayerAnchor,
  RecipeLayerLayout,
  RecipeLayerTone,
  StoryboardStyle,
} from '@peertoreel/contracts';
import type { CSSProperties, ReactNode } from 'react';

/** Horizontal alignment implied by an anchor. */
export function anchorAlign(
  anchor: RecipeLayerAnchor,
): 'flex-start' | 'center' | 'flex-end' {
  if (anchor.endsWith('-left')) {
    return 'flex-start';
  }

  if (anchor.endsWith('-right')) {
    return 'flex-end';
  }

  return 'center';
}

export function toneColor(
  tone: RecipeLayerTone,
  style: StoryboardStyle,
): string {
  switch (tone) {
    case 'text':
      return style.palette.text;
    case 'accent':
      return style.palette.accent;
    case 'cold':
      return style.palette.cold;
    case 'danger':
      return style.palette.danger;
  }
}

/** Absolute placement for one recipe layer, independent of its content. */
export function layoutFrameStyle(layout: RecipeLayerLayout): CSSProperties {
  const horizontal = anchorAlign(layout.anchor);
  const common: CSSProperties = {
    position: 'absolute',
    display: 'flex',
    justifyContent: horizontal,
    alignItems: 'center',
    pointerEvents: 'none',
  };

  switch (layout.anchor) {
    case 'top-left':
      return { ...common, top: '7%', left: '6%', maxWidth: '70%' };
    case 'top-center':
      return { ...common, top: '7%', left: '6%', right: '6%' };
    case 'top-right':
      return { ...common, top: '7%', right: '6%', maxWidth: '70%' };
    case 'upper-center':
      return { ...common, top: '24%', left: '6%', right: '6%' };
    case 'center':
      return {
        ...common,
        top: '50%',
        left: '6%',
        right: '6%',
        transform: 'translateY(-50%)',
      };
    case 'lower-center':
      return { ...common, bottom: '24%', left: '6%', right: '6%' };
    case 'bottom-left':
      return { ...common, bottom: '9%', left: '6%', maxWidth: '70%' };
    case 'bottom-center':
      return { ...common, bottom: '9%', left: '6%', right: '6%' };
    case 'bottom-right':
      return { ...common, bottom: '9%', right: '6%', maxWidth: '70%' };
  }
}

export function RecipeLayerFrame({
  layout,
  opacity,
  scale = 1,
  children,
}: {
  layout: RecipeLayerLayout;
  opacity: number;
  scale?: number;
  children: ReactNode;
}) {
  const frame = layoutFrameStyle(layout);

  return (
    <div
      style={{
        ...frame,
        opacity,
        transform: `${frame.transform ?? ''} scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}
