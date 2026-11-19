import '@fontsource/onest/400.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/800.css';
import { Player } from '@remotion/player';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ASSET_KEYS } from '../../assets.js';
import { PRIMITIVES, type PrimitiveId, type ParameterSpec } from '../../catalog.js';
import { CANVAS } from '../../platform.js';
import { SCENE_FPS } from '../../../video-target.js';
import { PREVIEW_CHANNEL, type GalleryValue } from '../catalog.js';
import {
  PREVIEW_DURATION_FRAMES,
  previewParams,
  previewScene,
  type PreviewParams,
} from '../preview.js';
import { SpecRenderer } from '../../devices/SpecRenderer.js';
import { UI_THEME_IDS, themeById, type UiThemeId } from '../../themes.js';

/**
 * The playground owns rendering only. Angular owns the list, the description
 * and the parameter controls, and posts a preview message on every change.
 */

interface PreviewState {
  readonly primitiveId: PrimitiveId;
  readonly params: PreviewParams;
  readonly themeId: UiThemeId;
}

const INITIAL_STATE: PreviewState = {
  primitiveId: 'label',
  params: previewParams('label'),
  themeId: 'studio-dark',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isPrimitiveId(value: unknown): value is PrimitiveId {
  return typeof value === 'string' && Object.hasOwn(PRIMITIVES, value);
}

function isThemeId(value: unknown): value is UiThemeId {
  return (
    typeof value === 'string' &&
    (UI_THEME_IDS as readonly string[]).includes(value)
  );
}

/** A message is untrusted input: only declared parameters of the wrong type are dropped. */
function valueMatches(spec: ParameterSpec, value: unknown): value is GalleryValue {
  switch (spec.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
    case 'color':
      return typeof value === 'string';
    case 'enum':
      return (spec.values ?? []).includes(value as string | number);
    case 'asset':
      return (
        typeof value === 'string' &&
        (ASSET_KEYS as readonly string[]).includes(value)
      );
  }
}

function parsePreview(data: unknown): PreviewState | null {
  const message = asRecord(data);

  if (
    message === null ||
    message['channel'] !== PREVIEW_CHANNEL ||
    message['type'] !== 'preview'
  ) {
    return null;
  }

  const primitiveId = message['primitiveId'];
  const themeId = message['themeId'];

  if (!isPrimitiveId(primitiveId) || !isThemeId(themeId)) {
    return null;
  }

  const incoming = asRecord(message['params']) ?? {};
  const declared = PRIMITIVES[primitiveId].parameters;
  const params: Record<string, GalleryValue> = {};

  for (const [name, spec] of Object.entries(declared)) {
    const value = incoming[name];

    if (valueMatches(spec, value)) {
      params[name] = value;
    }
  }

  return { primitiveId, params, themeId };
}

function postToHost(message: Record<string, string>): void {
  window.parent.postMessage({ channel: PREVIEW_CHANNEL, ...message }, window.location.origin);
}

function App() {
  const [state, setState] = useState<PreviewState>(INITIAL_STATE);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const next = parsePreview(event.data);

      if (next !== null) {
        setState(next);
      }
    };

    window.addEventListener('message', onMessage);
    /* One frame later: the host may mount the iframe before its listener runs. */
    requestAnimationFrame(() => postToHost({ type: 'ready' }));

    return () => window.removeEventListener('message', onMessage);
  }, []);

  const scene = useMemo(
    () => previewScene(state.primitiveId, state.params, state.themeId),
    [state],
  );
  const theme = useMemo(() => themeById(state.themeId), [state.themeId]);

  return (
    <div
      data-gallery-primitive={state.primitiveId}
      data-gallery-theme={state.themeId}
      style={{ width: '100%', height: '100%' }}
    >
      <Player
        component={SpecRenderer}
        inputProps={{ scene, theme }}
        durationInFrames={PREVIEW_DURATION_FRAMES}
        fps={SCENE_FPS}
        compositionWidth={CANVAS.width}
        compositionHeight={CANVAS.height}
        autoPlay
        loop
        controls
        initiallyMuted
        clickToPlay={false}
        doubleClickToFullscreen={false}
        acknowledgeRemotionLicense
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

const container = document.getElementById('root');

if (container === null) {
  throw new Error('gallery playground: #root is missing from index.html');
}

createRoot(container).render(<App />);
