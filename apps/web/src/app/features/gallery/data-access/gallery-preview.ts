import { GALLERY_CATALOG, type GalleryValue } from './gallery-catalog';

/**
 * The iframe protocol. Angular owns selection and settings, the playground owns
 * rendering; the only thing that crosses the boundary is "draw this".
 */

export const GALLERY_CHANNEL = GALLERY_CATALOG.preview.channel;

export interface GalleryPreviewMessage {
  readonly channel: string;
  readonly type: 'preview';
  readonly primitiveId: string;
  readonly params: Record<string, GalleryValue>;
  readonly themeId: string;
}

export type GalleryFrameEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'error'; readonly message: string };

export function buildPreviewMessage(
  primitiveId: string,
  params: Record<string, GalleryValue>,
  themeId: string,
): GalleryPreviewMessage {
  return {
    channel: GALLERY_CHANNEL,
    type: 'preview',
    primitiveId,
    params: { ...params },
    themeId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** A browser message is untrusted input; anything unexpected is ignored. */
export function parseFrameEvent(data: unknown): GalleryFrameEvent | null {
  const event = asRecord(data);

  if (event === null || event['channel'] !== GALLERY_CHANNEL) {
    return null;
  }

  if (event['type'] === 'ready') {
    return { type: 'ready' };
  }

  if (event['type'] === 'error') {
    const message = event['message'];

    return {
      type: 'error',
      message: typeof message === 'string' ? message : 'Превью не отрисовалось',
    };
  }

  return null;
}

/** The playground is a static asset of the web app, so `base href` decides the path. */
export function previewUrl(baseUri: string): string {
  return new URL(GALLERY_CATALOG.preview.path, baseUri).toString();
}
