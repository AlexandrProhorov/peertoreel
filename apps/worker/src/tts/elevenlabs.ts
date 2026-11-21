/**
 * The adapter moved to `@peertoreel/providers`: TTS is a provider used by more
 * than one app. This file keeps the worker's import path stable.
 */
export {
  isRetryableStatus,
  synthesizeWithTimestamps,
  ttsTimestampsResponseSchema,
  TtsError,
  type SynthesizeRequest,
  type SynthesizeResult,
  type TtsAlignment,
  type TtsTimestampsResponse,
} from '@peertoreel/providers';
