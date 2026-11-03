import { z } from 'zod';

export const scriptBeatSchema = z.object({
  /** Text spoken and shown on screen for this beat. */
  text: z.string().min(1).max(240),
  /** Plain-language direction for the visuals stage (keywords, mood, action). */
  visualDirection: z.string().min(3).max(240),
  /** Planned length; real timing comes from TTS word alignment. */
  durationSec: z.number().min(1).max(20),
});
export type ScriptBeat = z.infer<typeof scriptBeatSchema>;

export const scriptSchema = z.object({
  title: z.string().min(3).max(100),
  hook: z.string().min(5).max(200),
  beats: z.array(scriptBeatSchema).min(2).max(12),
  cta: z.string().min(3).max(200),
});
export type Script = z.infer<typeof scriptSchema>;

/** Everything that must be voiced, in order: hook → beats → CTA. */
export function scriptSpeechText(script: Script): string {
  return [script.hook, ...script.beats.map((beat) => beat.text), script.cta]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Planned total length. Advisory only: use TTS alignment for real timing. */
export function scriptPlannedDurationSec(script: Script): number {
  const beats = script.beats.reduce((sum, beat) => sum + beat.durationSec, 0);

  return Math.round((beats + 6) * 10) / 10;
}
