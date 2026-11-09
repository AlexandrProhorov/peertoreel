import type {
  ParallaxCityParams,
  StoryboardScene,
  StoryboardStyle,
} from '@peertoreel/contracts';
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
  params: ParallaxCityParams;
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

function focusTransformOrigin(focus: ParallaxCityParams['focus']): string {
  switch (focus) {
    case 'skyline':
      return '50% 35%';
    case 'car-silhouette':
      return '60% 72%';
    case 'street':
      return '50% 80%';
  }
}

function focusGradientPoint(focus: ParallaxCityParams['focus']): string {
  switch (focus) {
    case 'skyline':
      return '50% 22%';
    case 'car-silhouette':
      return '62% 66%';
    case 'street':
      return '50% 84%';
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

/** Ambient snow driven by `params.snowDensity` (0 hides the layer). */
function SkySnow({
  density,
  seed,
  seconds,
  style,
}: {
  density: number;
  seed: number;
  seconds: number;
  style: StoryboardStyle;
}) {
  if (density <= 0) {
    return null;
  }

  const count = Math.round(density * 28);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, index) => {
        const left = random(`city-${seed}-snow-x-${index}`) * 100;
        const size = 2 + random(`city-${seed}-snow-size-${index}`) * 4;
        const speed = 0.03 + random(`city-${seed}-snow-speed-${index}`) * 0.08;
        const offset = random(`city-${seed}-snow-offset-${index}`);
        const top = ((offset + seconds * speed) % 1) * 108 - 4;

        return (
          <span
            key={index}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: style.palette.text,
              opacity: 0.2 + random(`city-${seed}-snow-opacity-${index}`) * 0.4,
              filter: 'blur(0.3px)',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

function Lamp({
  side,
  seconds,
  style,
}: {
  side: ParallaxCityParams['lamp'];
  seconds: number;
  style: StoryboardStyle;
}) {
  const pulse = 0.78 + Math.sin(seconds * 1.7) * 0.08;
  const left = side === 'left' ? '12%' : side === 'center' ? '50%' : '84%';

  return (
    <div style={{ position: 'absolute', left, bottom: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: -280,
          bottom: 180,
          width: 560,
          height: 700,
          background: `linear-gradient(to bottom, ${style.palette.accent}55, ${style.palette.accent}00)`,
          clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0% 100%)',
          filter: 'blur(18px)',
          opacity: pulse,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -7,
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
          left: -23,
          bottom: 800,
          width: 46,
          height: 46,
          borderRadius: '50%',
          background: style.palette.accent,
          boxShadow: `0 0 60px 24px ${style.palette.accent}55`,
        }}
      />
    </div>
  );
}

export function ParallaxCity({ scene, style, params }: ParallaxCityProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const progress = durationInFrames <= 1 ? 0 : frame / (durationInFrames - 1);
  const seconds = frame / fps;
  const [skyTop, skyBottom] = backgroundColors(style);
  const seedPrefix = `city-${params.buildingsSeed}`;
  const farBuildings = makeBuildings(14, `${seedPrefix}-far`, 260);
  const nearBuildings = makeBuildings(9, `${seedPrefix}-near`, 420);
  const camera = cameraStyle(scene.camera.movement, scene.camera.speed, progress);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBottom} 74%, #05080f 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${focusGradientPoint(params.focus)}, ${style.palette.accent}22, transparent 32%), radial-gradient(circle at 20% 10%, ${style.palette.cold}14, transparent 26%)`,
        }}
      />

      <AbsoluteFill
        style={{
          ...camera,
          transformOrigin: focusTransformOrigin(params.focus),
        }}
      >
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
            opacity: params.roadGlow ? 1 : 0,
          }}
        />

        <Lamp side={params.lamp} seconds={seconds} style={style} />
      </AbsoluteFill>

      <SkySnow
        density={params.snowDensity}
        seed={params.buildingsSeed}
        seconds={seconds}
        style={style}
      />

      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 260px 80px rgba(0,0,0,0.72)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}
