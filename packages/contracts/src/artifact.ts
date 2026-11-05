import { z } from 'zod';
import { runStageSchema } from './run.js';

/** A file produced by a stage; the object itself lives in S3. */
export const artifactSchema = z.object({
  id: z.uuid(),
  stage: runStageSchema,
  type: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
  createdAt: z.iso.datetime(),
  /** Short-lived signed URL for reading the object. */
  url: z.url(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const runArtifactsResponseSchema = z.object({
  artifacts: z.array(artifactSchema),
});
export type RunArtifactsResponse = z.infer<typeof runArtifactsResponseSchema>;

export const ARTIFACT_TYPES = [
  'script_json',
  'voiceover_mp3',
  'word_timings',
  'subtitles_ass',
  'visuals_json',
  'visual_clip',
  'visual_image',
  'draft_mp4',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
