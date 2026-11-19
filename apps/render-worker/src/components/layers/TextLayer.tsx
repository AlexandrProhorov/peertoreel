import type {
  RecipeLayerLayout,
  SceneObject,
  StoryboardStyle,
} from '@peertoreel/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { anchorAlign, toneColor } from './recipe-layout.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function textColor(
  object: SceneObject,
  style: StoryboardStyle,
): string {
  if ((object.content ?? '').includes('°')) {
    return style.palette.cold;
  }

  if (object.animation === 'pop-in-danger') {
    return style.palette.danger;
  }

  if (
    object.animation === 'slide-up-pill' ||
    object.animation === 'pulse' ||
    object.animation === 'zoom-in-glow'
  ) {
    return style.palette.accent;
  }

  return style.palette.text;
}

function textLayout(object: SceneObject, style: StoryboardStyle): CSSProperties {
  const isPill = object.animation === 'slide-up-pill';
  const isPulse = object.animation === 'pulse';
  const isHuge =
    object.animation === 'zoom-in-glow' ||
    object.animation === 'count-up' ||
    object.animation === 'pop-in-danger';

  return {
    position: 'absolute',
    left: 56,
    right: 56,
    top: isPill ? '56%' : isPulse ? '66%' : '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    justifyContent: 'center',
    textAlign: 'center',
    fontFamily: style.typography.heading,
    fontWeight: isHuge ? style.typography.headingWeight : 700,
    fontSize: isHuge ? 154 : isPill ? 52 : 62,
    lineHeight: 1.02,
    letterSpacing: isHuge ? '-0.05em' : '0.01em',
    color: textColor(object, style),
    textShadow: isHuge
      ? `0 0 46px ${style.palette.accent}66, 0 8px 0 rgba(0,0,0,0.35)`
      : '0 4px 0 rgba(0,0,0,0.55)',
  };
}

function renderAccentedWords(content: string, style: StoryboardStyle): ReactNode {
  const words = content.split(/\s+/);

  if (words.length < 2) {
    return content;
  }

  const [first, ...rest] = words;

  if (!first || !/^\d/.test(first)) {
    return content;
  }

  return (
    <>
      <span style={{ color: style.palette.accent, marginRight: '0.08em' }}>
        {first}
      </span>
      {rest.join(' ')}
    </>
  );
}

/** Legacy `scene.objects[]` text renderer (M3.2 behaviour). */
export function SceneTextObject({
  object,
  style,
  progress,
  accentPulse,
}: {
  object: SceneObject;
  style: StoryboardStyle;
  progress: number;
  accentPulse: number;
}) {
  if (!object.content) {
    return null;
  }

  const isPill = object.animation === 'slide-up-pill';
  const scale = clamp(
    0.82 + progress * 0.18 + accentPulse * 0.04,
    0.8,
    1.12,
  );
  const layout = textLayout(object, style);
  const content = isPill ? (
    <span
      style={{
        background: 'rgba(5, 10, 20, 0.74)',
        border: `1px solid ${style.palette.accent}44`,
        borderRadius: 18,
        padding: '16px 30px',
        textTransform: 'uppercase',
        fontSize: 46,
      }}
    >
      {renderAccentedWords(object.content, style)}
    </span>
  ) : (
    renderAccentedWords(object.content, style)
  );

  return (
    <div
      style={{
        ...layout,
        opacity: progress,
        transform: `${layout.transform ?? ''} scale(${scale})`,
      }}
    >
      {content}
    </div>
  );
}

function textSize(layout: RecipeLayerLayout): number {
  switch (layout.size) {
    case 'sm':
      return 38;
    case 'md':
      return 50;
    case 'lg':
      return 68;
    case 'hero':
      return 96;
  }
}

function pillSize(layout: RecipeLayerLayout): number {
  switch (layout.size) {
    case 'sm':
      return 30;
    case 'md':
      return 38;
    case 'lg':
      return 46;
    case 'hero':
      return 58;
  }
}

/**
 * Recipe text/pill/HUD-chip layer. All Russian strings arrive from slots; the
 * component only applies layout data from the catalog.
 */
export function RecipeTextLayer({
  content,
  kind,
  layout,
  style,
  opacity,
  progress,
}: {
  content: string;
  kind: 'text' | 'pill' | 'hud-chip';
  layout: RecipeLayerLayout;
  style: StoryboardStyle;
  opacity: number;
  progress: number;
}) {
  const color = toneColor(layout.tone, style);
  const scale = 0.92 + progress * 0.08;
  const align = anchorAlign(layout.anchor);

  const base: CSSProperties = {
    fontFamily: style.typography.heading,
    textTransform: 'uppercase',
    lineHeight: 1.05,
    textAlign:
      align === 'flex-start' ? 'left' : align === 'flex-end' ? 'right' : 'center',
  };

  if (kind === 'hud-chip') {
    return (
      <div style={{ opacity, transform: `scale(${scale})` }}>
        <span
          style={{
            ...base,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color,
            background: 'rgba(5, 10, 20, 0.72)',
            border: `2px solid ${color}66`,
            borderRadius: 999,
            padding: '12px 24px',
            boxShadow: `0 0 34px ${color}22`,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 16px ${color}`,
            }}
          />
          {content}
        </span>
      </div>
    );
  }

  if (kind === 'pill') {
    return (
      <div style={{ opacity, transform: `scale(${scale})` }}>
        <span
          style={{
            ...base,
            display: 'inline-block',
            fontSize: pillSize(layout),
            fontWeight: 700,
            letterSpacing: '0.04em',
            color,
            background: 'rgba(5, 10, 20, 0.74)',
            border: `2px solid ${color}77`,
            borderRadius: 22,
            padding: '18px 32px',
            boxShadow: `0 16px 40px rgba(0,0,0,0.35), 0 0 46px ${color}22`,
          }}
        >
          {content}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        opacity,
        transform: `scale(${scale})`,
        fontSize: textSize(layout),
        fontWeight:
          layout.size === 'hero' || layout.size === 'lg'
            ? style.typography.headingWeight
            : 700,
        letterSpacing: layout.size === 'hero' ? '-0.04em' : '0.01em',
        color,
        textShadow: `0 6px 0 rgba(0,0,0,0.35), 0 0 42px ${color}33`,
      }}
    >
      {content}
    </div>
  );
}
