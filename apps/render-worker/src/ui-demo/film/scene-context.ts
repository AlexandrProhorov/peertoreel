import type { Arc, ArcScene } from './arc.js';

/**
 * Phase 2 context: one scene knows where it sits in the film. Without this the
 * model writes four unrelated posters instead of four steps of an argument.
 */
export function sceneContext(arc: Arc, scene: ArcScene, index: number): string[] {
  const neighbours = arc.scenes
    .map((item, itemIndex) => `  ${itemIndex + 1}. [${item.role}] ${item.intent}`)
    .join('\n');
  const action =
    scene.action === undefined
      ? []
      : [`Визуальное действие этой сцены: ${scene.action}. Покажи именно его.`];

  return [
    `Фильм целиком: ${arc.thesis}`,
    `Это сцена ${index + 1} из ${arc.scenes.length}. Её роль: ${scene.role}.`,
    ...action,
    `Она должна дать зрителю: ${scene.intent}`,
    'Другие сцены фильма — не повторяй их и не пересказывай:',
    neighbours,
  ];
}
