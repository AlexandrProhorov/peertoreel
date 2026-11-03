import { z } from 'zod';

const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

export const ttsTimestampsResponseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: alignmentSchema.nullable().optional(),
  normalized_alignment: alignmentSchema.nullable().optional(),
});

export type TtsAlignment = z.infer<typeof alignmentSchema>;
export type TtsTimestampsResponse = z.infer<typeof ttsTimestampsResponseSchema>;

export interface SynthesizeRequest {
  text: string;
  voiceId: string;
  modelId: string;
  apiKey: string;
  outputFormat?: string;
}

export interface SynthesizeResult {
  audio: Buffer;
  alignment: TtsAlignment;
}

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}

/** 429 and 5xx are transient; auth/permission errors are terminal. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function synthesizeWithTimestamps(
  request: SynthesizeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SynthesizeResult> {
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${request.voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': request.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        text: request.text,
        model_id: request.modelId,
        output_format: request.outputFormat ?? 'mp3_44100_128',
      }),
    },
  );

  if (!response.ok) {
    // Provider error bodies explain the cause (bad voice id, model not on plan)
    // and never contain the API key; truncate so a long message cannot flood logs.
    const detail = (await response.text()).slice(0, 300);

    throw new TtsError(
      `ElevenLabs responded with ${response.status}: ${detail}`,
      response.status,
      isRetryableStatus(response.status),
    );
  }

  const payload = ttsTimestampsResponseSchema.parse(await response.json());
  const alignment = payload.alignment ?? payload.normalized_alignment;

  if (!alignment) {
    throw new TtsError('ElevenLabs returned no character alignment', 200, false);
  }

  return {
    audio: Buffer.from(payload.audio_base64, 'base64'),
    alignment,
  };
}
