import type { QcCheckId, QcVerdict } from '@peertoreel/contracts';

const VERDICT_LABELS: Record<QcVerdict, string> = {
  pass: 'Пройдено',
  warn: 'Внимание',
  fail: 'Ошибка',
};

const STATUS_LABELS: Record<QcVerdict, string> = {
  pass: 'ок',
  warn: 'внимание',
  fail: 'ошибка',
};

const CHECK_LABELS: Record<QcCheckId, string> = {
  duration: 'Длительность',
  loudness: 'Громкость',
  sync: 'Синхронизация',
  stop_words: 'Стоп-слова',
  aigc: 'AIGC-флаг',
  readability: 'Читаемость',
};

export function qcVerdictLabel(verdict: QcVerdict): string {
  return VERDICT_LABELS[verdict];
}

export function qcStatusLabel(status: QcVerdict): string {
  return STATUS_LABELS[status];
}

export function qcCheckLabel(id: QcCheckId): string {
  return CHECK_LABELS[id];
}
