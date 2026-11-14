import type {
  AssetKind,
  ImageProvider,
  ImageProviderRequest,
  ImageProviderResult,
} from '@peertoreel/contracts';
import { sha256Hex } from './content-hash.js';
import { encodePng } from './raster-pipeline.js';

/**
 * Deterministic `ImageProvider` for tests and CLI runs (ADR-0017 D4/D9).
 * It never performs I/O: fixtures come from memory, "generation" is a pure
 * function of the requested key, and the reported cost is exactly 0.
 */

export interface FakeImageProviderOptions {
  /** SVG source by logical key (`subject/dog-wet-nose`). */
  readonly assets?: Readonly<Record<string, string>>;
  /** Generate a synthetic flat SVG for keys without a fixture. */
  readonly synthesize?: boolean;
  readonly enabled?: boolean;
  readonly supportedKinds?: readonly AssetKind[];
  /** Colors used by synthetic SVGs. */
  readonly palette?: readonly string[];
}

export interface FakeImageProvider extends ImageProvider {
  /** Requests the resolver/provider made, in order. */
  readonly calls: readonly ImageProviderRequest[];
  reset(): void;
}

const DEFAULT_PALETTE = ['#0B1220', '#F4F1EA', '#F59E0B', '#38BDF8'];

/**
 * A valid flat SVG with a full-bleed background rect on purpose: the resolver
 * path exercises background removal and palette quantization, not a happy path
 * that only works with authored files.
 */
export function syntheticFlatSvg(
  key: string,
  palette: readonly string[] = DEFAULT_PALETTE,
): string {
  const hash = sha256Hex(key);
  const ink = palette[0] ?? '#0B1220';
  const paper = palette[1] ?? '#F4F1EA';
  const accent = palette[2] ?? '#F59E0B';
  const cool = palette[3] ?? '#38BDF8';

  const centerX = 320 + (Number.parseInt(hash.slice(0, 2), 16) / 255) * 384;
  const centerY = 360 + (Number.parseInt(hash.slice(2, 4), 16) / 255) * 304;
  const radius = 160 + (Number.parseInt(hash.slice(4, 6), 16) / 255) * 120;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
    `<rect width="1024" height="1024" fill="${paper}"/>`,
    `<circle cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" r="${radius.toFixed(1)}" fill="${accent}" stroke="${ink}" stroke-width="18"/>`,
    `<path d="M 256 768 L 512 640 L 768 768" fill="none" stroke="${cool}" stroke-width="22" stroke-linecap="round"/>`,
    '</svg>',
  ].join('');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);

  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

/**
 * Deterministic RGBA cutout for raster tests: a transparent border with an
 * opaque square inside. Occupancy stays inside the 8–75 % cutout window, so the
 * same fixture exercises the resolver's PNG branch without a network call.
 */
export function syntheticCutoutPng(
  key: string,
  palette: readonly string[] = DEFAULT_PALETTE,
): Uint8Array {
  const size = 24;
  const margin = 6;
  const hash = sha256Hex(key);
  const color = hexToRgb(palette[2] ?? '#F59E0B');
  const data = new Uint8Array(size * size * 4);
  const offset = Number.parseInt(hash.slice(0, 2), 16) % 2;

  for (let y = margin + offset; y < size - margin; y += 1) {
    for (let x = margin; x < size - margin; x += 1) {
      const target = (y * size + x) * 4;

      data[target] = color.r;
      data[target + 1] = color.g;
      data[target + 2] = color.b;
      data[target + 3] = 255;
    }
  }

  return encodePng({ width: size, height: size, data });
}

export function createFakeImageProvider(
  options: FakeImageProviderOptions = {},
): FakeImageProvider {
  const fixtures = options.assets ?? {};
  const synthesize = options.synthesize ?? true;
  const enabled = options.enabled ?? true;
  const supportedKinds = options.supportedKinds ?? ['svg'];
  const palette = options.palette ?? DEFAULT_PALETTE;
  const calls: ImageProviderRequest[] = [];

  return {
    id: 'fake',
    enabled,
    calls,
    reset() {
      calls.length = 0;
    },
    supports(kind: AssetKind): boolean {
      return supportedKinds.includes(kind);
    },
    async generate(request: ImageProviderRequest): Promise<ImageProviderResult> {
      calls.push(request);

      const fixture = fixtures[request.key];

      if (fixture === undefined && !synthesize) {
        throw new Error(`Fake provider has no fixture for "${request.key}"`);
      }

      if (request.kind !== 'svg') {
        const png = syntheticCutoutPng(request.key, palette);

        return {
          provider: 'fake',
          model: 'fake-cutout-v1',
          source: 'library',
          costUsd: 0,
          asset: {
            data: Buffer.from(png).toString('base64'),
            encoding: 'base64',
            mimeType: 'image/png',
            width: 24,
            height: 24,
            license: { name: 'authored', commercialUse: true },
          },
        };
      }

      return {
        provider: 'fake',
        model: 'fake-flat-v1',
        source: 'library',
        costUsd: 0,
        asset: {
          data: fixture ?? syntheticFlatSvg(request.key, palette),
          encoding: 'utf8',
          mimeType: 'image/svg+xml',
          width: 1024,
          height: 1024,
          license: { name: 'authored', commercialUse: true },
        },
      };
    },
  };
}
