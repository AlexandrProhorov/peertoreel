import {
  scriptSchema,
  stageJobDataSchema,
  type StageJobResult,
} from '@kadence/contracts';
import { buildArtifactKey } from '@kadence/storage';
import type { Job } from 'bullmq';
import { requireProviderKey, type WorkerEnv } from '../config/env.js';
import { generateJson } from '../llm/deepseek.js';
import { scriptSystemPrompt, scriptUserPrompt } from '../script/prompt.js';
import { saveArtifact } from './save-artifact.js';
import type { StageDeps } from './context.js';
import { loadRun, transitionRun } from './transition.js';

/** Topic в†’ validated script JSON в†’ SCRIPT_READY. */
export async function processScriptStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  // Idempotency: a completed stage must not regenerate (and re-charge) on retry.
  if (run.state === 'SCRIPT_READY') {
    return { runId, stage: 'script', state: run.state, artifacts: [] };
  }

  const topic = await deps.db.query.runs.findFirst({
    where: (table, { eq }) => eq(table.id, runId),
    columns: { topic: true },
  });

  if (!topic) {
    throw new Error(`Run ${runId} РёСЃС‡РµР· РґРѕ РЅР°С‡Р°Р»Р° СЃС‚Р°РґРёРё`);
  }

  await job.updateProgress(10);

  const { data: script, usage, attempts } = await generateJson(scriptSchema, {
    apiKey: requireProviderKey(deps.env.DEEPSEEK_API_KEY, 'DEEPSEEK_API_KEY'),
    baseUrl: deps.env.LLM_BASE_URL,
    model: deps.env.LLM_MODEL,
    system: scriptSystemPrompt(),
    user: scriptUserPrompt(topic.topic),
    maxTokens: 2000,
  });

  await job.updateProgress(60);

  const key = buildArtifactKey(runId, 'script', 'script.json');
  const body = Buffer.from(JSON.stringify(script, null, 2), 'utf8');

  await deps.storage.putObject(key, body, 'application/json');

  const artifact = await saveArtifact(deps.db, {
    runId,
    stage: 'script',
    type: 'script_json',
    objectKey: key,
    contentType: 'application/json',
    sizeBytes: body.byteLength,
    meta: {
      model: deps.env.LLM_MODEL,
      attempts,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      beats: script.beats.length,
    },
  });

  await job.updateProgress(85);

  const state = await transitionRun(deps.db, runId, 'SCRIPT_READY');

  await job.updateProgress(100);

  return {
    runId,
    stage: 'script',
    state,
    artifacts: [
      {
        type: artifact.type,
        objectKey: artifact.objectKey,
        sizeBytes: artifact.sizeBytes,
      },
    ],
  };
}
