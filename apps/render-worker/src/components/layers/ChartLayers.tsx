import type {
  RecipeChartKind,
  RecipeLayerLayout,
  StoryboardStyle,
} from '@peertoreel/contracts';
import { interpolate } from 'remotion';
import type { ResolvedRecipeChartItem } from '../../recipes.js';
import { toneColor } from './recipe-layout.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Legacy `battery-gauge` chart object (fixture regression). */
export function BatteryGauge({
  animationProgress,
  style,
}: {
  animationProgress: number;
  style: StoryboardStyle;
}) {
  const charge = interpolate(animationProgress, [0, 1], [100, 60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 150,
        right: 150,
        top: '36%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 22,
      }}
    >
      <div
        style={{
          width: '100%',
          height: 190,
          border: `8px solid ${style.palette.text}cc`,
          borderRadius: 26,
          padding: 16,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${charge}%`,
            borderRadius: 12,
            background: `linear-gradient(90deg, ${style.palette.accent}, ${style.palette.cold})`,
            transition: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -28,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 70,
            borderRadius: 6,
            background: style.palette.text,
          }}
        />
      </div>
    </div>
  );
}

function ComparisonBars({
  items,
  style,
  progress,
  size,
}: {
  items: readonly ResolvedRecipeChartItem[];
  style: StoryboardStyle;
  progress: number;
  size: RecipeLayerLayout['size'];
}) {
  const barHeight = size === 'md' ? 26 : 34;
  const fontSize = size === 'md' ? 34 : 40;
  const colors = [style.palette.accent, style.palette.cold];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 34 }}>
      {items.map((item, index) => {
        const fraction = clamp(item.fraction ?? 0, 0, 1);
        const animated = interpolate(progress, [0.05, 0.75], [0, fraction], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const color = colors[index % colors.length] ?? style.palette.accent;

        return (
          <div key={`${item.label}-${index}`} style={{ width: '100%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 24,
                marginBottom: 12,
                fontFamily: style.typography.heading,
                textTransform: 'uppercase',
                color:
                  index === 0 ? style.palette.text : `${style.palette.text}cc`,
              }}
            >
              <span style={{ fontSize, fontWeight: 700 }}>{item.label}</span>
              <span
                style={{
                  fontSize: fontSize + 14,
                  fontWeight: style.typography.headingWeight,
                  color,
                }}
              >
                {item.value}
              </span>
            </div>
            <div
              style={{
                height: barHeight,
                borderRadius: barHeight / 2,
                background: `${style.palette.text}18`,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${animated * 100}%`,
                  height: '100%',
                  borderRadius: barHeight / 2,
                  background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                  boxShadow: `0 0 28px ${color}55`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProcessSteps({
  items,
  style,
  progress,
  size,
  accent,
}: {
  items: readonly ResolvedRecipeChartItem[];
  style: StoryboardStyle;
  progress: number;
  size: RecipeLayerLayout['size'];
  accent: string;
}) {
  const circle = size === 'md' ? 58 : 72;
  const labelSize = size === 'md' ? 38 : 46;

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
        position: 'relative',
      }}
    >
      {items.map((item, index) => {
        const stepProgress = interpolate(
          progress,
          [index * 0.14, index * 0.14 + 0.36],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        return (
          <div
            key={`${item.label}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              opacity: stepProgress,
              transform: `translateX(${(1 - stepProgress) * 34}px)`,
            }}
          >
            <div
              style={{
                flex: '0 0 auto',
                width: circle,
                height: circle,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: style.typography.heading,
                fontWeight: style.typography.headingWeight,
                fontSize: 30,
                color: '#0b1220',
                background: accent,
                boxShadow: `0 0 30px ${accent}55`,
              }}
            >
              {index + 1}
            </div>
            <div style={{ flex: '1 1 auto' }}>
              <div
                style={{
                  fontFamily: style.typography.heading,
                  fontWeight: 700,
                  fontSize: labelSize,
                  lineHeight: 1.08,
                  textTransform: 'uppercase',
                  color: style.palette.text,
                }}
              >
                {item.label}
              </div>
              {item.detail ? (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: style.typography.body,
                    fontSize: 28,
                    color: `${style.palette.text}aa`,
                  }}
                >
                  {item.detail}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Universal comparison/process chart. Labels and numbers are Remotion text. */
export function RecipeChartLayer({
  chart,
  items,
  layout,
  style,
  progress,
  opacity,
}: {
  chart: RecipeChartKind;
  items: readonly ResolvedRecipeChartItem[];
  layout: RecipeLayerLayout;
  style: StoryboardStyle;
  progress: number;
  opacity: number;
}) {
  const accent = toneColor(layout.tone, style);

  return (
    <div style={{ width: '100%', opacity }}>
      {chart === 'comparison-bars' ? (
        <ComparisonBars
          items={items}
          style={style}
          progress={progress}
          size={layout.size}
        />
      ) : (
        <ProcessSteps
          items={items}
          style={style}
          progress={progress}
          size={layout.size}
          accent={accent}
        />
      )}
    </div>
  );
}
