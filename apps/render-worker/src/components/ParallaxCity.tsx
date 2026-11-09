import type { StoryboardScene, StoryboardStyle } from '@peertoreel/contracts';
import {
  AbsoluteFill,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { CSSProperties } from 'react';

interface ParallaxCityProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
}

function backgroundColors(style: StoryboardStyle): [string, string] {
  const background = style.palette.background;

  return [background[0] ?? '#0b1220', background[1] ?? background[0] ?? '#16233c'];
}

function cameraStyle(
  movement: StoryboardScene['camera']['movement'],
  speed: number,
  progress: number,
): CSSProperties {
  const strength = 0.6 + speed;

  switch (movement) {
    case 'pan':
      return {
        transform: `translateX(${interpolate(progress, [0, 1], [-1.6, 1.6]) * strength}%) scale(1.06)`,
      };
    case 'zoom_in':
      return {
        transform: `scale(${interpolate(progress, [0, 1], [1, 1.06 + speed * 0.08])})`,
      };
    case 'zoom_out':
      return {
        transform: `scale(${interpolate(progress, [0, 1], [1.08, 1])})`,
      };
    case 'dolly':
      return {
        transform: `translateY(${interpolate(progress, [0, 1], [0, 1.4])}%) scale(${interpolate(progress, [0, 1], [1, 1.05])})`,
      };
    case 'tilt':
      return {
        transform: `translateY(${interpolate(progress, [0, 1], [0, -1.8])}%) scale(1.04)`,
      };
    case 'orbit':
      return {
        transform: `translateX(${Math.sin(progress * Math.PI * 2) * 1.2}%) scale(1.05)`,
      };
    default:
      return {};
  }
}

interface Building {
  left: number;
  width: number;
  height: number;
  opacity: number;
  windows: Array<{ left: number; top: number; size: number; opacity: number }>;
}

function makeBuildings(
  count: number,
  seedPrefix: string,
  maxHeight: number,
): Building[] {
  return Array.from({ length: count }, (_, index) => {
    const width = 46 + random(`${seedPrefix}-w-${index}`) * 88;
    const height = 140 + random(`${seedPrefix}-h-${index}`) * maxHeight;
    const windows = Array.from(
      { length: 4 + Math.floor(random(`${seedPrefix}-n-${index}`) * 5) },
      (_, windowIndex) => ({
        left: 10 + random(`${seedPrefix}-wx-${index}-${windowIndex}`) * 70,
        top: 12 + random(`${seedPrefix}-wy-${index}-${windowIndex}`) * 72,
        size: 3 + random(`${seedPrefix}-ws-${index}-${windowIndex}`) * 5,
        opacity: 0.25 + random(`${seedPrefix}-wo-${index}-${windowIndex}`) * 0.65,
      }),
    );

    return {
      left: random(`${seedPrefix}-x-${index}`) * 100,
      width,
      height,
      opacity: 0.55 + random(`${seedPrefix}-o-${index}`) * 0.4,
      windows,
    };
  });
}

function BuildingLayer({
  buildings,
  color,
  windowColor,
  bottom,
}: {
  buildings: readonly Building[];
  color: string;
  windowColor: string;
  bottom: number;
}) {
  return (
    <AbsoluteFill style={{ bottom, top: 'auto', height: '72%' }}>
      {buildings.map((building, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: `${building.left}%`,
            bottom: 0,
            width: building.width,
            height: building.height,
            background: color,
            opacity: building.opacity,
            borderRadius: '4px 4px 0 0',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {building.windows.map((window, windowIndex) => (
            <span
              key={windowIndex}
              style={{
                position: 'absolute',
                left: `${window.left}%`,
                top: `${window.top}%`,
                width: window.size,
                height: window.size * 1.4,
                background: windowColor,
                opacity: window.opacity,
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      ))}
    </AbsoluteFill>
  );
}

export function ParallaxCity({ scene, style }: ParallaxCityProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = durationInFrames <= 1 ? 0 : frame / (durationInFrames - 1);
  const [skyTop, skyBottom] = backgroundColors(style);
  const farBuildings = makeBuildings(14, 'far', 260);
  const nearBuildings = makeBuildings(9, 'near', 420);
  const camera = cameraStyle(scene.camera.movement, scene.camera.speed, progress);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBottom} 74%, #05080f 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 78% 18%, ${style.palette.accent}22, transparent 30%), radial-gradient(circle at 20% 10%, ${style.palette.cold}14, transparent 26%)`,
        }}
      />

      <AbsoluteFill style={{ ...camera, transformOrigin: '50% 55%' }}>
        <BuildingLayer
          buildings={farBuildings}
          color={skyBottom}
          windowColor={style.palette.accent}
          bottom={300}
        />
        <BuildingLayer
          buildings={nearBuildings}
          color="#070c15"
          windowColor={style.palette.cold}
          bottom={230}
        />

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 300,
            background: 'linear-gradient(180deg, #0a0f18 0%, #05080e 100%)',
            borderTop: `1px solid ${style.palette.cold}22`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            bottom: 118,
            height: 8,
            borderRadius: 8,
            background: `${style.palette.accent}33`,
            filter: 'blur(4px)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            right: '10%',
            bottom: 220,
            width: 14,
            height: 620,
            borderRadius: 8,
            background: `linear-gradient(180deg, ${style.palette.cold}55, #070b12)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '9%',
            bottom: 820,
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: style.palette.accent,
            boxShadow: `0 0 60px 24px ${style.palette.accent}55`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 260px 80px rgba(0,0,0,0.72)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}
