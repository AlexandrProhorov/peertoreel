import {
  CANVAS,
  CONTENT_BOUNDS,
  CRITICAL_SAFE_BOUNDS,
  PLATFORM_OVERLAY,
  boundsHeight,
  boundsWidth,
  contains,
  intersects,
  type Bounds,
} from '../platform.js';
import type { UiDevice } from '../spec.js';
import type {
  MeasuredBox,
  MeasuredRect,
  SceneMeasurement,
  Violation,
} from './measure.js';

export interface LintGeometry {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly platform: { readonly right: number; readonly bottom: number };
  readonly content: Bounds;
  readonly criticalSafe: Bounds;
}

export const DEFAULT_GEOMETRY: LintGeometry = {
  canvas: CANVAS,
  platform: PLATFORM_OVERLAY,
  content: CONTENT_BOUNDS,
  criticalSafe: CRITICAL_SAFE_BOUNDS,
};

/**
 * What a device must expose to the linter. Roles are `data-ui-critical` values;
 * a missing required role means the layout lost a piece of its contract.
 */
export const DEVICE_CONTRACTS: Record<
  UiDevice,
  { readonly surfaces: readonly string[]; readonly requiredRoles: readonly string[] }
> = {
  'prompt-card': {
    surfaces: ['card'],
    requiredRoles: ['card-text'],
  },
  'text-selection': {
    surfaces: [],
    requiredRoles: ['title', 'selected-line'],
  },
  'chat-reconstruction': {
    surfaces: [],
    requiredRoles: ['title', 'message'],
  },
  'title-stack': {
    surfaces: [],
    requiredRoles: ['title'],
  },
  'social-proof': {
    surfaces: [],
    requiredRoles: ['title', 'proof-text'],
  },
  'prediction-input': {
    surfaces: ['input'],
    requiredRoles: ['prompt-text', 'answer-text'],
  },
  'object-reveal': {
    surfaces: ['stage'],
    requiredRoles: ['caption'],
  },
  'input-transform': {
    surfaces: ['input'],
    requiredRoles: ['prompt-text'],
  },
  'impact-arrival': {
    surfaces: ['card'],
    requiredRoles: ['headline', 'index-label'],
  },
  'scale-break': {
    surfaces: [],
    requiredRoles: ['title', 'from-label', 'to-label'],
  },
  /** The renderer draws an arbitrary composition; its roles come from the spec. */
  spec: {
    surfaces: [],
    requiredRoles: [],
  },
};

const KNOWN_ROLES = new Set([
  'badge-label',
  'card-text',
  'caption',
  'title',
  'line',
  'selected-line',
  'message',
  'eyebrow',
  'subtitle',
  'proof-name',
  'proof-text',
  'prompt-text',
  'answer-text',
  'waiting-label',
  'headline',
  'index-label',
  'from-label',
  'to-label',
  'spec-text',
]);

const EDGE_EPSILON = 0.5;
/** Overlap smaller than one pixel of area is a rounding artefact, not a collision. */
const MIN_OVERLAP_AREA = 1;
/** A related pair overlaps on purpose; an unrelated one needs 10 % of the smaller box. */
const UNRELATED_OVERLAP_SHARE = 0.1;

function toBounds(rect: MeasuredRect): Bounds {
  return {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  };
}

function canvasBounds(geometry: LintGeometry): Bounds {
  return {
    left: 0,
    top: 0,
    right: geometry.canvas.width,
    bottom: geometry.canvas.height,
  };
}

function platformZones(geometry: LintGeometry): Array<{
  name: string;
  bounds: Bounds;
}> {
  return [
    {
      name: 'right rail',
      bounds: {
        left: geometry.canvas.width - geometry.platform.right,
        top: 0,
        right: geometry.canvas.width,
        bottom: geometry.canvas.height,
      },
    },
    {
      name: 'bottom bar',
      bounds: {
        left: 0,
        top: geometry.canvas.height - geometry.platform.bottom,
        right: geometry.canvas.width,
        bottom: geometry.canvas.height,
      },
    },
  ];
}

function shrunk(bounds: Bounds, amount: number): Bounds {
  return {
    left: bounds.left + amount,
    top: bounds.top + amount,
    right: bounds.right - amount,
    bottom: bounds.bottom - amount,
  };
}

function overlapArea(a: Bounds, b: Bounds): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

  return width > 0 && height > 0 ? width * height : 0;
}

function formatRect(rect: MeasuredRect): string {
  return `x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} h=${Math.round(rect.height)}`;
}

export function lintScene(
  measurement: SceneMeasurement,
  geometry: LintGeometry = DEFAULT_GEOMETRY,
): Violation[] {
  const violations: Violation[] = [];
  const add = (
    rule: Violation['rule'],
    element: string,
    message: string,
    rect?: MeasuredRect,
    severity: Violation['severity'] = 'error',
  ): void => {
    violations.push({
      sceneId: measurement.sceneId,
      device: measurement.device,
      frame: measurement.frame,
      rule,
      severity,
      element,
      message,
      ...(rect === undefined ? {} : { rect }),
    });
  };

  const contract = DEVICE_CONTRACTS[measurement.device as UiDevice];

  if (contract === undefined) {
    add('contract', measurement.device, `Unknown device "${measurement.device}"`);
    return violations;
  }

  const criticals = measurement.boxes.filter((box) => box.kind === 'critical');
  const surfaces = new Map(
    measurement.boxes
      .filter((box) => box.kind === 'surface')
      .map((box) => [box.name, box]),
  );

  if (!measurement.fontsReady) {
    add('font-fallback', 'document', 'Onest did not finish loading before measurement');
  }

  for (const surface of contract.surfaces) {
    if (!surfaces.has(surface)) {
      add('contract', surface, `Device "${measurement.device}" did not render surface "${surface}"`);
    }
  }

  for (const role of contract.requiredRoles) {
    if (!criticals.some((box) => box.name === role)) {
      add('contract', role, `Device "${measurement.device}" is missing critical role "${role}"`);
    }
  }

  const deviceBounds = canvasBounds(geometry);
  const shrunkDevice = shrunk(deviceBounds, EDGE_EPSILON);
  const shrunkContent = shrunk(geometry.content, EDGE_EPSILON);

  for (const box of criticals) {
    const bounds = toBounds(box.rect);

    if (!KNOWN_ROLES.has(box.name)) {
      add('contract', box.name, `Unknown critical role "${box.name}"`, box.rect, 'warning');
    }

    if (!contains(shrunkDevice, bounds)) {
      add(
        'critical-outside-device',
        box.name,
        `Text leaves the device: ${formatRect(box.rect)}`,
        box.rect,
      );
    }

    if (!contains(shrunkContent, bounds)) {
      add(
        'critical-outside-content',
        box.name,
        `Text leaves the content bounds: ${formatRect(box.rect)}`,
        box.rect,
      );
    }

    for (const zone of platformZones(geometry)) {
      if (overlapArea(bounds, zone.bounds) > MIN_OVERLAP_AREA) {
        add(
          'critical-in-platform-zone',
          box.name,
          `Text crosses the ${zone.name}: ${formatRect(box.rect)}`,
          box.rect,
        );
      }
    }

    if (box.overflowText === true) {
      add(
        'text-overflow',
        box.name,
        `Text is taller or wider than its own box: ${formatRect(box.rect)}`,
        box.rect,
      );
    }

    if (box.overflowX === true || box.overflowY === true) {
      add(
        'content-clipped',
        box.name,
        `Text is clipped (overflowX=${String(box.overflowX)} overflowY=${String(box.overflowY)})`,
        box.rect,
      );
    }

    if (box.fontFamily !== undefined && !box.fontFamily.includes('Onest')) {
      add(
        'font-fallback',
        box.name,
        `Fallback font in use: "${box.fontFamily}"`,
        box.rect,
      );
    }

    if (box.within !== undefined && box.within !== null) {
      const surface = surfaces.get(box.within);

      if (surface === undefined) {
        add(
          'contract',
          box.name,
          `Critical "${box.name}" expects surface "${box.within}" that does not exist`,
          box.rect,
        );
      } else if (!contains(shrunk(toBounds(surface.rect), EDGE_EPSILON), bounds)) {
        add(
          'critical-outside-content',
          box.name,
          `Text leaves surface "${box.within}": ${formatRect(box.rect)}`,
          box.rect,
        );
      }
    }
  }

  for (let i = 0; i < criticals.length; i += 1) {
    for (let j = i + 1; j < criticals.length; j += 1) {
      const first = criticals[i];
      const second = criticals[j];

      if (first === undefined || second === undefined) {
        continue;
      }

      if (first.overlapAllowed === true || second.overlapAllowed === true) {
        continue;
      }

      if (
        intersects(
          shrunk(toBounds(first.rect), MIN_OVERLAP_AREA),
          shrunk(toBounds(second.rect), MIN_OVERLAP_AREA),
        )
      ) {
        add(
          'critical-overlap',
          `${first.name}+${second.name}`,
          `Critical boxes overlap: "${first.name}" and "${second.name}"`,
          first.rect,
        );
      }
    }
  }

  /* The spec can be clean and the frame still broken: two surfaces the model
     placed side by side may paint over each other. Containment is design (a chip
     inside a card); a real intersection of unrelated boxes is not. */
  const content = measurement.boxes.filter((box) => box.kind !== 'device');

  for (let i = 0; i < content.length; i += 1) {
    for (let j = i + 1; j < content.length; j += 1) {
      const first = content[i];
      const second = content[j];

      if (first === undefined || second === undefined) {
        continue;
      }

      if (first.kind === 'critical' && second.kind === 'critical') {
        continue;
      }

      if (first.overlapAllowed === true || second.overlapAllowed === true) {
        continue;
      }

      if (
        contains(toBounds(first.rect), toBounds(second.rect)) ||
        contains(toBounds(second.rect), toBounds(first.rect))
      ) {
        continue;
      }

      const area = overlapArea(toBounds(first.rect), toBounds(second.rect));
      const smaller = Math.min(
        first.rect.width * first.rect.height,
        second.rect.width * second.rect.height,
      );

      if (area > MIN_OVERLAP_AREA && area >= smaller * UNRELATED_OVERLAP_SHARE) {
        add(
          'unrelated-overlap',
          `${first.name}+${second.name}`,
          `Unrelated boxes overlap: "${first.name}" and "${second.name}"`,
          first.rect,
          'warning',
        );
      }
    }
  }

  /* A hole was tried and rejected: measured on vertical bands it fired on airy
     layouts as often as on broken ones (precision 0.40 on five labelled frames),
     and band height does not separate the two. A hole is a group with something
     missing, which needs grouping before it can be measured. */

  return violations;
}

export function lintMeasurements(
  measurements: readonly SceneMeasurement[],
  geometry: LintGeometry = DEFAULT_GEOMETRY,
): Violation[] {
  return measurements.flatMap((measurement) => lintScene(measurement, geometry));
}

/** Content area a device may use, for contract assertions in tests. */
export function usableContentSize(geometry: LintGeometry = DEFAULT_GEOMETRY) {
  return {
    width: boundsWidth(geometry.content),
    height: boundsHeight(geometry.content),
  };
}

export type { MeasuredBox };
