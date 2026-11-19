import type { StoryboardStyle } from '@peertoreel/contracts';
import { AbsoluteFill, random } from 'remotion';

function backgroundColors(style: StoryboardStyle): [string, string] {
  const background = style.palette.background;

  return [background[0] ?? '#0b1220', background[1] ?? background[0] ?? '#16233c'];
}

function Snow({ seconds, style }: { seconds: number; style: StoryboardStyle }) {
  const flakes = Array.from({ length: 54 }, (_, index) => {
    const left = random(`snow-x-${index}`) * 100;
    const size = 2 + random(`snow-size-${index}`) * 5;
    const speed = 0.04 + random(`snow-speed-${index}`) * 0.09;
    const offset = random(`snow-offset-${index}`);
    const top = ((offset + seconds * speed) % 1) * 112 - 6;

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
          opacity: 0.35 + random(`snow-opacity-${index}`) * 0.5,
          filter: 'blur(0.3px)',
        }}
      />
    );
  });

  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{flakes}</AbsoluteFill>;
}

function Steam({ seconds, style }: { seconds: number; style: StoryboardStyle }) {
  const puffs = Array.from({ length: 16 }, (_, index) => {
    const left = 24 + random(`steam-x-${index}`) * 52;
    const speed = 0.12 + random(`steam-speed-${index}`) * 0.12;
    const offset = random(`steam-offset-${index}`);
    const rise = (offset + seconds * speed) % 1;
    const top = 78 - rise * 54;
    const size = 20 + random(`steam-size-${index}`) * 46;

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
          opacity: (1 - rise) * 0.22,
          filter: 'blur(12px)',
        }}
      />
    );
  });

  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{puffs}</AbsoluteFill>;
}

function LampCone({
  seconds,
  style,
}: {
  seconds: number;
  style: StoryboardStyle;
}) {
  const pulse = 0.82 + Math.sin(seconds * 1.7) * 0.08;

  return (
    <div
      style={{
        position: 'absolute',
        top: -40,
        right: -20,
        width: 560,
        height: 1200,
        background: `linear-gradient(to bottom, ${style.palette.accent}55, ${style.palette.accent}00)`,
        clipPath: 'polygon(45% 0, 58% 0, 100% 100%, 0% 100%)',
        filter: 'blur(18px)',
        opacity: pulse,
        pointerEvents: 'none',
      }}
    />
  );
}

function HeadlightCone({
  seconds,
  style,
}: {
  seconds: number;
  style: StoryboardStyle;
}) {
  const flicker = 0.55 + Math.sin(seconds * 9) * 0.04;
  const beam = (left: number, angle: number) => (
    <div
      key={left}
      style={{
        position: 'absolute',
        left: `${left}%`,
        bottom: '30%',
        width: 64,
        height: 380,
        transformOrigin: 'top center',
        transform: `rotate(${angle}deg)`,
        background: `linear-gradient(to bottom, ${style.palette.accent}bb, ${style.palette.accent}00)`,
        clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0% 100%)',
        filter: 'blur(9px)',
        opacity: flicker,
        pointerEvents: 'none',
      }}
    />
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {beam(72, 12)}
      {beam(77, 18)}
    </AbsoluteFill>
  );
}

function Frost({
  progress,
  style,
}: {
  progress: number;
  style: StoryboardStyle;
}) {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: progress * 0.7,
        background: `radial-gradient(circle at 0% 0%, ${style.palette.cold}66, transparent 32%), radial-gradient(circle at 100% 0%, ${style.palette.cold}44, transparent 28%), radial-gradient(circle at 50% 100%, ${style.palette.cold}33, transparent 40%)`,
      }}
    />
  );
}

function CarSilhouette({ style }: { style: StoryboardStyle }) {
  const [, second] = backgroundColors(style);

  return (
    <svg
      viewBox="0 0 640 260"
      width="88%"
      style={{ filter: 'drop-shadow(0 24px 30px rgba(0,0,0,0.55))' }}
      aria-hidden="true"
    >
      <path
        d="M60 196 L92 142 Q110 116 150 112 L240 104 L306 70 Q330 58 366 62 L448 78 Q500 88 532 124 L578 142 Q606 150 612 178 L612 196 Z"
        fill={second}
        stroke={style.palette.cold}
        strokeOpacity={0.22}
        strokeWidth={3}
      />
      <path
        d="M258 108 L312 80 Q330 70 356 74 L420 86 Q456 94 478 116 Z"
        fill={style.palette.cold}
        fillOpacity={0.22}
      />
      <rect x="72" y="174" width="530" height="16" rx="8" fill="#000" opacity="0.35" />
      <circle cx="170" cy="198" r="34" fill="#070b12" stroke={style.palette.cold} strokeOpacity={0.25} strokeWidth={6} />
      <circle cx="500" cy="198" r="34" fill="#070b12" stroke={style.palette.cold} strokeOpacity={0.25} strokeWidth={6} />
      <circle cx="170" cy="198" r="12" fill={style.palette.cold} opacity={0.35} />
      <circle cx="500" cy="198" r="12" fill={style.palette.cold} opacity={0.35} />
      <rect x="584" y="154" width="18" height="14" rx="6" fill={style.palette.accent} />
      <circle cx="596" cy="161" r="28" fill={style.palette.accent} opacity="0.18" />
    </svg>
  );
}

/** Ambient snow or steam. `content` keeps the M3.2 preset names. */
export function ParticlesLayer({
  content,
  seconds,
  style,
}: {
  content: string;
  seconds: number;
  style: StoryboardStyle;
}) {
  return content.includes('steam') ? (
    <Steam seconds={seconds} style={style} />
  ) : (
    <Snow seconds={seconds} style={style} />
  );
}

/** Warm lamp cone or headlight beams. */
export function LightLayer({
  content,
  seconds,
  style,
}: {
  content: string;
  seconds: number;
  style: StoryboardStyle;
}) {
  return content.includes('headlight') ? (
    <HeadlightCone seconds={seconds} style={style} />
  ) : (
    <LampCone seconds={seconds} style={style} />
  );
}

/** Frost vignette; `progress` is the object/receipt window progress. */
export function OverlayLayer({
  progress,
  style,
}: {
  progress: number;
  style: StoryboardStyle;
}) {
  return <Frost progress={progress} style={style} />;
}

/** The legacy `car` character. Other ids render nothing (pre-M3.6 rig). */
export function CharacterLayer({
  content,
  seconds,
  style,
}: {
  content: string;
  seconds: number;
  style: StoryboardStyle;
}) {
  if (content !== 'car') {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '13%',
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(${Math.sin(seconds * 2.1) * 2}px)`,
      }}
    >
      <CarSilhouette style={style} />
    </div>
  );
}
