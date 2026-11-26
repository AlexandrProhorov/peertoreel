import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { TYPE_SCALE, type TypeToken } from '../typography.js';
import { textStyle } from '../typography.js';
import type { UiTheme } from '../themes.js';
import { drawColor } from './colors.js';
import { nodeMotion } from './motion.js';
import type { DrawNode, DrawTransition } from './schema.js';

/**
 * Draws the node tree. There is no object knowledge here on purpose: the
 * renderer only knows boxes, text, icons and lines, so a price tag and a push
 * take the same path and a new object needs no new code.
 *
 * Time is read from the node: `at` says when it starts, `transition` says how it
 * arrives. The layout never moves — a printed row is missing, not squeezed in.
 */

function colour(theme: UiTheme, value: string | undefined, fallback: string): string {
  return drawColor(theme, value, fallback);
}

function tokenOf(value: string | undefined): TypeToken {
  if (value !== undefined && value in TYPE_SCALE) {
    return value as TypeToken;
  }

  return 'body';
}

/**
 * Printed children arrive top-down — a receipt prints its header, then the rows,
 * then the total. `at` only breaks ties inside one row: seconds are not a
 * position, and mixing them with pixels puts the total first.
 */
function printOrder(children: readonly DrawNode[]): number[] {
  return children
    .map((child, index) => ({
      index,
      y: child.kind === 'line' ? Math.min(child.y1, child.y2) : child.y,
      at: child.at ?? Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => left.y - right.y || left.at - right.at)
    .map((entry) => entry.index);
}

function Node({
  node,
  theme,
  frame,
  fps,
  durationSec,
  opacity,
}: {
  node: DrawNode;
  theme: UiTheme;
  frame: number;
  fps: number;
  durationSec: number;
  opacity: number;
}): React.ReactElement | null {
  const transition: DrawTransition = node.transition ?? 'appear';
  const motion = nodeMotion({
    transition,
    at: node.at ?? 0,
    frame,
    fps,
    durationSec,
    text: node.kind === 'text' ? node.text : undefined,
    childCount: node.kind === 'box' ? (node.children?.length ?? 0) : 0,
  });
  const alpha = opacity * motion.opacity;

  if (alpha <= 0.001) {
    return null;
  }

  switch (node.kind) {
    case 'box': {
      const fill = node.fill === undefined ? undefined : colour(theme, node.fill, theme.surface);
      const children = node.children ?? [];
      const shown =
        transition === 'print'
          ? new Set(printOrder(children).slice(0, motion.childCount))
          : undefined;

      return (
        <div
          id={node.id}
          style={{
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.w,
            height: node.h,
            borderRadius: node.r ?? 0,
            transform: nodeMotionTransform(node, motion.offsetY),
            background: fill ?? 'transparent',
            border:
              node.stroke === undefined
                ? undefined
                : `${String(node.strokeWidth ?? 2)}px solid ${colour(theme, node.stroke, theme.muted)}`,
            boxShadow: node.shadow === true ? '0 18px 48px rgba(0, 0, 0, 0.35)' : undefined,
            overflow: node.clip === true ? 'hidden' : undefined,
            opacity: alpha * (node.opacity ?? 1),
          }}
        >
          {children.map((child, index) =>
            shown === undefined || shown.has(index) ? (
              <Node
                key={`${String(index)}-${child.kind}`}
                node={child}
                theme={theme}
                frame={frame}
                fps={fps}
                durationSec={durationSec}
                opacity={1}
              />
            ) : null,
          )}
        </div>
      );
    }
    case 'text': {
      /* The validator owns readability: it judges the surface actually painted
         under the text and records a fix. The renderer only resolves the colour. */
      const readable = colour(theme, node.color, theme.ink);
      const base = textStyle(tokenOf(node.token), readable);
      const { fontSize, ...rest } = base;

      return (
        <div
          id={node.id}
          style={{
            ...rest,
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.w,
            ...(node.h === undefined ? {} : { height: node.h }),
            wordBreak: 'break-word',
            fontSize: typeof fontSize === 'number' ? fontSize : undefined,
            ...(node.weight === undefined ? {} : { fontWeight: node.weight }),
            textAlign: node.align ?? 'left',
            transform: nodeMotionTransform(node, motion.offsetY),
            opacity: alpha * (node.opacity ?? 1),
          }}
        >
          {motion.text}
        </div>
      );
    }
    case 'icon':
      return (
        <div
          id={node.id}
          style={{
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.size,
            height: node.size,
            fontSize: node.size,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: nodeMotionTransform(node, motion.offsetY),
            opacity: alpha,
          }}
        >
          {node.emoji}
        </div>
      );
    case 'line': {
      const endX = node.x1 + (node.x2 - node.x1) * motion.drawn;
      const endY = node.y1 + (node.y2 - node.y1) * motion.drawn;

      return (
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 1080,
            height: 1920,
            opacity: alpha,
          }}
          viewBox="0 0 1080 1920"
        >
          <line
            x1={node.x1}
            y1={node.y1}
            x2={endX}
            y2={endY}
            stroke={colour(theme, node.color, theme.muted)}
            strokeWidth={node.width ?? 2}
            strokeDasharray={node.dashed === true ? '10 10' : undefined}
          />
        </svg>
      );
    }
    default:
      return null;
  }
}

function nodeMotionTransform(node: DrawNode, offsetY: number): string | undefined {
  const rotate = node.kind === 'box' && node.rot !== undefined ? `rotate(${String(node.rot)}deg)` : '';
  const slide = offsetY === 0 ? '' : `translateY(${String(offsetY)}px)`;

  if (rotate === '' && slide === '') {
    return undefined;
  }

  return [rotate, slide].filter((part) => part !== '').join(' ');
}

export function DrawScene({
  nodes,
  theme,
  durationInFrames,
}: {
  nodes: readonly DrawNode[];
  theme: UiTheme;
  durationInFrames: number;
}): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationSec = durationInFrames / Math.max(1, fps);

  return (
    <AbsoluteFill style={{ background: theme.background }}>
      {nodes.map((node, index) => (
        <Node
          key={`${String(index)}-${node.kind}`}
          node={node}
          theme={theme}
          frame={frame}
          fps={fps}
          durationSec={durationSec}
          opacity={1}
        />
      ))}
    </AbsoluteFill>
  );
}
