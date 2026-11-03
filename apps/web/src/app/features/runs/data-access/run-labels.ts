import type { RunStage, RunState } from '@kadence/contracts';

const STATE_LABELS: Record<RunState, string> = {
  DRAFT: 'Черновик',
  RESEARCHING: 'Исследование',
  SCRIPT_READY: 'Сценарий готов',
  VOICE_READY: 'Озвучка готова',
  VISUALS_READY: 'Визуалы готовы',
  RENDERING: 'Рендер',
  REVIEW: 'На ревью',
  SCHEDULED: 'Запланировано',
  PUBLISHING: 'Публикация',
  PUBLISHED: 'Опубликовано',
  FAILED: 'Ошибка',
};

const STAGE_LABELS: Record<RunStage, string> = {
  topic_discovery: 'Тема',
  research: 'Исследование',
  script: 'Сценарий',
  voiceover: 'Озвучка',
  visuals: 'Визуалы',
  render: 'Рендер',
  qc: 'QC',
  publish: 'Публикация',
};

export function runStateLabel(state: RunState): string {
  return STATE_LABELS[state];
}

export function runStageLabel(stage: RunStage | null): string {
  return stage ? STAGE_LABELS[stage] : '—';
}

const TRANSITION_LABELS: Partial<Record<`${RunState}:${RunState}`, string>> = {
  'DRAFT:RESEARCHING': 'Начать исследование',
  'RESEARCHING:SCRIPT_READY': 'Принять бриф',
  'SCRIPT_READY:VOICE_READY': 'Утвердить сценарий',
  'SCRIPT_READY:RESEARCHING': 'Переделать бриф',
  'VOICE_READY:VISUALS_READY': 'Собрать визуалы',
  'VOICE_READY:SCRIPT_READY': 'Перегенерировать сценарий',
  'VISUALS_READY:RENDERING': 'Запустить рендер',
  'VISUALS_READY:VOICE_READY': 'Перегенерировать озвучку',
  'RENDERING:REVIEW': 'Отправить на ревью',
  'RENDERING:VISUALS_READY': 'Перегенерировать визуалы',
  'REVIEW:SCHEDULED': 'Одобрить',
  'REVIEW:SCRIPT_READY': 'Перегенерировать сценарий',
  'REVIEW:VOICE_READY': 'Перегенерировать озвучку',
  'REVIEW:VISUALS_READY': 'Перегенерировать визуалы',
  'REVIEW:RENDERING': 'Перерендерить',
  'SCHEDULED:PUBLISHING': 'Публиковать',
  'SCHEDULED:REVIEW': 'Вернуть на ревью',
  'PUBLISHING:PUBLISHED': 'Отметить опубликованным',
};

export function transitionLabel(from: RunState, to: RunState): string {
  if (to === 'FAILED') {
    return 'Остановить с ошибкой';
  }

  if (from === 'FAILED') {
    return 'Повторить стадию';
  }

  return TRANSITION_LABELS[`${from}:${to}`] ?? runStateLabel(to);
}

/** Vivid badge modifier for a state. */
export function runStateTone(
  state: RunState,
): 'muted' | 'active' | 'ready' | 'error' {
  if (state === 'FAILED') {
    return 'error';
  }

  if (state === 'PUBLISHED') {
    return 'ready';
  }

  if (state === 'DRAFT') {
    return 'muted';
  }

  return 'active';
}
