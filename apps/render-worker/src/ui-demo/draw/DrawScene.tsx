import { AbsoluteFill } from 'remotion';
import { contrast, toneColor } from '../quality.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';
import { textStyle } from '../typography.js';
import type { UiTheme } from '../themes.js';
import type { DrawNode } from './schema.js';

/**
 * Draws the node tree. There is no object knowledge here on purpose: the
 * renderer only knows boxes, text, icons and lines, so a price tag and a push
 * take the same path and a new object needs no new code.
 */

function colour(theme: UiTheme, value: string | undefined, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  return toneColor(theme, value) ?? value;
}

function tokenOf(value: string | undefined): TypeToken {
  if (value !== undefined && value in TYPE_SCALE) {
    return value as TypeToken;
  }

  return 'body';
}

function Node({
  node,
  theme,
  bg,
}: {
  node: DrawNode;
  theme: UiTheme;
  bg: string;
}): React.ReactElement | null {
  switch (node.kind) {
    case 'box': {
      const fill = node.fill === undefined ? undefined : colour(theme, node.fill, theme.surface);
      const inner = fill ?? bg;

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
            transform: node.rot === undefined ? undefined : `rotate(${String(node.rot)}deg)`,
            background: fill ?? 'transparent',
            border:
              node.stroke === undefined
                ? undefined
                : `${String(node.strokeWidth ?? 2)}px solid ${colour(theme, node.stroke, theme.muted)}`,
            boxShadow: node.shadow === true ? '0 18px 48px rgba(0, 0, 0, 0.35)' : undefined,
            overflow: node.clip === true ? 'hidden' : undefined,
            opacity: node.opacity ?? 1,
          }}
        >
          {(node.children ?? []).map((child, index) => (
            <Node key={`${String(index)}-${child.kind}`} node={child} theme={theme} bg={inner} />
          ))}
        </div>
      );
    }
    case 'text': {
      const wanted = colour(theme, node.color, theme.ink);
      /* Text on its own surface must stay readable: a caption in the tone of the
         card behind it is not styling, it is a hole. */
      const ratio = contrast(wanted, bg);
      const readable =
        ratio !== null && ratio >= 3.2
          ? wanted
          : (contrast(theme.ink, bg) ?? 0) >= (contrast(theme.surface, bg) ?? 0)
            ? theme.ink
            : theme.surface;
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
            opacity: node.opacity ?? 1,
          }}
        >
          {node.text}
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
          }}
        >
          {node.emoji}
        </div>
      );
    case 'line':
      return (
        <svg
          style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920 }}
          viewBox="0 0 1080 1920"
        >
          <line
            x1={node.x1}
            y1={node.y1}
            x2={node.x2}
            y2={node.y2}
            stroke={colour(theme, node.color, theme.muted)}
            strokeWidth={node.width ?? 2}
            strokeDasharray={node.dashed === true ? '10 10' : undefined}
          />
        </svg>
      );
    default:
      return null;
  }
}

export function DrawScene({
  nodes,
  theme,
}: {
  nodes: readonly DrawNode[];
  theme: UiTheme;
}): React.ReactElement {
  return (
    <AbsoluteFill style={{ background: theme.background }}>
      {nodes.map((node, index) => (
        <Node key={`${String(index)}-${node.kind}`} node={node} theme={theme} bg={theme.background} />
      ))}
    </AbsoluteFill>
  );
}
