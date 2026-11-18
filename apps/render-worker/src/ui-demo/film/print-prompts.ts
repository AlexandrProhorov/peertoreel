import {
  DIRECTOR_SYSTEM_PROMPT,
  buildUserPrompt,
} from '../director/contract-brief.js';
import { ARC_SYSTEM_PROMPT, arcSchema, buildArcPrompt } from './arc.js';
import { sceneContext } from './scene-context.js';

/**
 * Prints the exact prompts the film director sends, ready to paste into another
 * model. Generated from the same code, so the text cannot drift from what the
 * pipeline really uses.
 *
 *   ui:prompts --topic "Почему мы помним начало и конец, но не середину"
 *   ui:prompts --topic "..." --scene 2
 */

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Option ${name} requires a value`);
  }

  return value;
}

const topic =
  optionValue('--topic') ?? 'Почему мы помним начало и конец, но не середину';
const sceneIndex = Math.max(1, Number(optionValue('--scene') ?? '2'));

/* A sample arc: the scene prompt needs a film to sit in. Replace it with the
   model's own arc when you compare full runs. */
const arc = arcSchema.parse({
  thesis: 'Память хранит края события, а середину стирает',
  scenes: [
    { id: 'hook', role: 'крючок', action: 'середина гаснет', intent: 'зритель видит, что середина исчезает', seconds: 3, theme: 'studio-dark' },
    { id: 'proof', role: 'доказательство', action: 'три блока, средний гаснет', intent: 'зритель понимает механизм', seconds: 8, theme: 'studio-light' },
    { id: 'turn', role: 'поворот', action: 'шкала ломается посередине', intent: 'середина не восстанавливается', seconds: 9, theme: 'studio-lime' },
    { id: 'verdict', role: 'вывод', action: 'остаются два края', intent: 'вывод про края', seconds: 8, theme: 'studio-dark' },
  ],
});
const planned = arc.scenes[Math.min(sceneIndex, arc.scenes.length) - 1] ?? arc.scenes[0];

if (planned === undefined) {
  throw new Error('arc has no scenes');
}

console.log('===== ARC: SYSTEM =====');
console.log(ARC_SYSTEM_PROMPT);
console.log('===== ARC: USER =====');
console.log(buildArcPrompt(topic));
console.log('===== SCENE: SYSTEM =====');
console.log(DIRECTOR_SYSTEM_PROMPT);
console.log('===== SCENE: USER =====');
console.log(
  buildUserPrompt(topic, {
    seconds: planned.seconds,
    themeId: planned.theme,
    context: sceneContext(arc, planned, Math.min(sceneIndex, arc.scenes.length) - 1),
  }),
);
console.log('\n===== CALL =====');
console.log('temperature: 0.8, max_tokens: 8000, response_format: {"type":"json_object"}');
