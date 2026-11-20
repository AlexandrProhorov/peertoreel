import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import {
  LINT_LOG_PREFIX,
  type MeasuredBox,
  type MeasuredRect,
  type SceneMeasurement,
} from './measure.js';

/**
 * Browser-side measurement. Runs inside the real Remotion page, after the fonts
 * are ready and layout has settled, then prints one JSON line that the CLI reads
 * from `onBrowserLog`. Rules live on the Node side and stay unit-testable.
 */
/**
 * Layout rect: the element's untransformed box relative to the scene root.
 * `getBoundingClientRect` inflates boxes for rotated/scaled elements, which
 * turns an entrance tilt into a false "text overlap". Containment and overlap
 * are layout properties, so they are measured from the offset chain; the visual
 * rect is only a fallback when the chain never reaches the root.
 */
function rectOf(element: HTMLElement, root: HTMLElement): MeasuredRect {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  let guard = 0;

  while (node !== null && node !== root && guard < 64) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
    guard += 1;
  }

  if (node === root) {
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  }

  const rect = element.getBoundingClientRect();
  const origin = root.getBoundingClientRect();

  return {
    x: rect.x - origin.x,
    y: rect.y - origin.y,
    width: rect.width,
    height: rect.height,
  };
}

function clippingOf(element: HTMLElement): { x: boolean; y: boolean } {
  let node: HTMLElement | null = element;
  let x = false;
  let y = false;

  while (node !== null) {
    const style = window.getComputedStyle(node);
    const clipsX = style.overflowX !== 'visible';
    const clipsY = style.overflowY !== 'visible';

    if (clipsX && node.scrollWidth > node.clientWidth + 1) {
      x = true;
    }

    if (clipsY && node.scrollHeight > node.clientHeight + 1) {
      y = true;
    }

    node = node.parentElement;
  }

  return { x, y };
}

/** Typographic rounding stays under this; a visible spill is far above it. */
const OVERFLOW_SHARE = 0.06;
const OVERFLOW_FLOOR = 12;

function overflowsBy(content: number, box: number): boolean {
  return content - box > Math.max(OVERFLOW_FLOOR, box * OVERFLOW_SHARE);
}

function criticalBox(element: HTMLElement, root: HTMLElement): MeasuredBox {
  const clipping = clippingOf(element);
  const style = window.getComputedStyle(element);
  const within = element.dataset.uiWithin ?? null;

  return {
    kind: 'critical',
    name: element.dataset.uiCritical ?? 'unnamed',
    rect: rectOf(element, root),
    fontFamily: style.fontFamily,
    overflowX: clipping.x,
    overflowY: clipping.y,
    /* Only a box whose size is declared by the spec can "overflow": a
       content-sized element grows with its text, and its scroll metrics are
       noise. The 4px tolerance absorbs line-height rounding. */
    /* Overflow is measured on the scroll box, not only on a declared size: a
       block of text wraps, but a single long word paints past its box, and that
       is exactly the frame a reviewer sees as broken. Typographic rounding
       (a descender, a line-height of 1.67) must not count: the spill has to be
       visible, so a small tolerance is not enough and a share of the box is
       required. */
    overflowText:
      overflowsBy(element.scrollHeight, element.offsetHeight) ||
      overflowsBy(element.scrollWidth, element.offsetWidth),
    ...(element.dataset.uiElement === undefined
      ? {}
      : { elementId: element.dataset.uiElement }),
    contentHeight: element.scrollHeight,
    contentWidth: element.scrollWidth,
    boxHeight: element.offsetHeight,
    boxWidth: element.offsetWidth,
    overlapAllowed: element.dataset.uiOverlapAllowed === 'true',
    within,
    ...(element.textContent === null
      ? {}
      : { text: element.textContent.slice(0, 80) }),
  };
}

function measureDocument(): SceneMeasurement[] {
  const measurements: SceneMeasurement[] = [];

  for (const sceneRoot of document.querySelectorAll<HTMLElement>(
    '[data-ui-lint-scene]',
  )) {
    const root = sceneRoot;
    const sceneId = sceneRoot.dataset.uiLintScene ?? 'unknown';
    const frame = Number(sceneRoot.dataset.uiFrame ?? '0');
    const stage = sceneRoot.querySelector<HTMLElement>('[data-ui-stage]');
    const deviceElement = sceneRoot.querySelector<HTMLElement>(
      '[data-ui-device]',
    );
    const device = deviceElement?.dataset.uiDevice ?? 'unknown';
    const boxes: MeasuredBox[] = [];

    if (stage !== null) {
      boxes.push({
        kind: 'device',
        name: device,
        rect: rectOf(stage, root),
      });
    }

    for (const surface of sceneRoot.querySelectorAll<HTMLElement>(
      '[data-ui-surface]',
    )) {
      boxes.push({
        kind: 'surface',
        name: surface.dataset.uiSurface ?? 'unnamed',
        rect: rectOf(surface, root),
      });
    }

    for (const critical of sceneRoot.querySelectorAll<HTMLElement>(
      '[data-ui-critical]',
    )) {
      boxes.push(criticalBox(critical, root));
    }

    measurements.push({
      sceneId,
      device,
      frame,
      fontsReady:
        document.fonts.check('600 56px Onest') &&
        document.fonts.check('800 92px Onest'),
      boxes,
    });
  }

  return measurements;
}

export function LintProbe() {
  const [handle] = useState(() => delayRender('ui-lint measurement'));

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const measurements = measureDocument();

      console.log(`${LINT_LOG_PREFIX}${JSON.stringify(measurements)}`);

      if (!cancelled) {
        continueRender(handle);
      }
    };

    run().catch((error: unknown) => {
      console.error(
        `${LINT_LOG_PREFIX}${JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );

      if (!cancelled) {
        continueRender(handle);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  return null;
}
