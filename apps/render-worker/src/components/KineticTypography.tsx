import type { StoryboardScene, StoryboardStyle } from '@peertoreel/contracts';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

interface KineticTypographyProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
}

function backgroundColors(style: StoryboardStyle): [string, string] {
  const background = style.palette.background;

  return [background[0] ?? '#0b1220', background[1] ?? background[0] ?? '#16233c'];
}

export function KineticTypography({
  scene,
  style,
}: KineticTypographyProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress =
    durationInFrames <= 1 ? 0 : frame / (durationInFrames - 1);
  const [top, bottom] = backgroundColors(style);
  const zoom = interpolate(
    progress,
    [0, 1],
    [1, 1.03 + scene.camera.speed * 0.03],
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(155deg, ${top} 0%, ${bottom} 58%, #05080f 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${style.palette.cold}0d 1px, transparent 1px), linear-gradient(90deg, ${style.palette.cold}0d 1px, transparent 1px)`,
          backgroundSize: '90px 90px',
          opacity: 0.7,
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 46%, ${style.palette.accent}30, transparent 34%), radial-gradient(circle at 18% 82%, ${style.palette.cold}1f, transparent 34%)`,
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
      />
      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 300px 90px rgba(0,0,0,0.78)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}
