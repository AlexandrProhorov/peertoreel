/**
 * Raw measurement contract between the browser probe and the Node-side rules.
 * Everything is scene-local: the probe subtracts the stage origin, so the rules
 * can compare against `platform.ts` constants directly.
 */
export interface MeasuredRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type MeasuredKind = 'device' | 'surface' | 'critical';

export interface MeasuredBox {
  readonly kind: MeasuredKind;
  /** `data-ui-surface` value, `data-ui-critical` role, or the device id. */
  readonly name: string;
  readonly rect: MeasuredRect;
  readonly fontFamily?: string;
  readonly overflowX?: boolean;
  readonly overflowY?: boolean;
  /** Content is bigger than the element's own box, clipped or not. */
  readonly overflowText?: boolean;
  /** `data-ui-element`: which spec element this box belongs to. */
  readonly elementId?: string;
  readonly contentHeight?: number;
  readonly contentWidth?: number;
  readonly boxHeight?: number;
  readonly boxWidth?: number;
  readonly overlapAllowed?: boolean;
  /** `data-ui-within`: the surface a critical box must stay inside. */
  readonly within?: string | null;
  readonly text?: string;
}

export interface SceneMeasurement {
  readonly sceneId: string;
  readonly device: string;
  readonly frame: number;
  readonly fontsReady: boolean;
  readonly boxes: readonly MeasuredBox[];
}

export const LINT_LOG_PREFIX = '##ui-lint ';

export type LintRule =
  | 'critical-outside-device'
  | 'critical-outside-content'
  | 'critical-in-platform-zone'
  | 'content-clipped'
  | 'text-overflow'
  | 'critical-overlap'
  | 'unrelated-overlap'
  | 'composition-hole'
  | 'font-fallback'
  | 'contract';

export interface Violation {
  readonly sceneId: string;
  readonly device: string;
  readonly frame: number;
  readonly rule: LintRule;
  readonly severity: 'error' | 'warning';
  readonly element: string;
  readonly message: string;
  readonly rect?: MeasuredRect;
}
