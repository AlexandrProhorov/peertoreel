import type {
  CartoonCharacterParams,
  StoryboardScene,
  StoryboardStyle,
} from '@peertoreel/contracts';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { CHARACTER_VIEWBOX, characterLayers } from '../character.js';

interface CartoonCharacterProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
  params: CartoonCharacterParams;
}

const ANCHOR_STYLE: Readonly<
  Record<
    CartoonCharacterParams['anchor'],
    { readonly left?: string; readonly right?: string; readonly transform?: string }
  >
> = {
  left: { left: '5%' },
  center: { left: '50%', transform: 'translateX(-50%)' },
  right: { right: '4%' },
};

/**
 * Maps pre-computed geometry to SVG. No emotion branches, no coordinate math
 * and no randomness here: `characterLayers` owns all of it (M3.6b.7.1).
 */
export function CartoonCharacter({ params }: CartoonCharacterProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shapes = characterLayers(params, frame, fps);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        height: '48%',
        aspectRatio: `${CHARACTER_VIEWBOX.width} / ${CHARACTER_VIEWBOX.height}`,
        ...ANCHOR_STYLE[params.anchor],
      }}
    >
      <svg
        viewBox={`0 0 ${CHARACTER_VIEWBOX.width} ${CHARACTER_VIEWBOX.height}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        aria-hidden="true"
      >
        {shapes.map((shape) => {
          if (shape.kind === 'rect') {
            return (
              <rect
                key={shape.id}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rx={shape.rx}
                fill={shape.fill}
                transform={
                  shape.rotation === undefined
                    ? undefined
                    : `rotate(${shape.rotation.angle} ${shape.rotation.cx} ${shape.rotation.cy})`
                }
              />
            );
          }

          if (shape.kind === 'ellipse') {
            return (
              <ellipse
                key={shape.id}
                cx={shape.cx}
                cy={shape.cy}
                rx={shape.rx}
                ry={shape.ry}
                fill={shape.fill}
              />
            );
          }

          if (shape.kind === 'circle') {
            return (
              <circle
                key={shape.id}
                cx={shape.cx}
                cy={shape.cy}
                r={shape.r}
                fill={shape.fill}
              />
            );
          }

          return (
            <path
              key={shape.id}
              d={shape.d}
              fill={shape.fill ?? 'none'}
              stroke={shape.stroke ?? undefined}
              strokeWidth={shape.stroke === null ? undefined : shape.strokeWidth}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}
