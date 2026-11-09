import type {
  DerivedWord,
  QcCheck,
  QcCheckId,
  QcMetrics,
  QcVerdict,
  Script,
} from '@peertoreel/contracts';
import type { MediaProbe } from '../media/ffprobe.js';
import type { LoudnormMeasurement } from '../media/loudnorm.js';

export interface QcInput {
  script: Script;
  words: DerivedWord[];
  probe: MediaProbe;
  loudness: LoudnormMeasurement;
}

export interface QcResult {
  verdict: QcVerdict;
  checks: QcCheck[];
  metrics: QcMetrics;
}

const LOUDNESS_TARGET = -14;
const TRUE_PEAK_TARGET = -1;

const STOP_WORDS = [
  'шок',
  'секрет',
  'скидка',
  'акция',
  'купи',
  'купить',
  'заработок',
  'инвестиц',
  'крипт',
  'гаранти',
  'бесплатно',
  'ссылка в шапке',
  'переходи',
  'жми',
  'лайкни',
  'розыгрыш',
  'промокод',
  'казино',
  'ставк',
  'быстрый доход',
];

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function check(
  id: QcCheckId,
  status: QcVerdict,
  message: string,
): QcCheck {
  return { id, status, message };
}

function scriptText(script: Script): string {
  return [script.hook, ...script.beats.map((beat) => beat.text), script.cta].join(
    ' ',
  );
}

function maxSentenceWords(text: string): number {
  return text
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim().split(/\s+/u).filter(Boolean).length)
    .reduce((max, count) => Math.max(max, count), 0);
}

function durationCheck(input: QcInput): QcCheck {
  const { durationSec, audioDurationSec, videoDurationSec } = input.probe;
  const expectedEnd = input.words.at(-1)?.endSec ?? 0;

  if (durationSec <= 0 || audioDurationSec <= 0 || videoDurationSec <= 0) {
    return check('duration', 'fail', 'В черновике нет корректной длительности');
  }

  if (expectedEnd > durationSec + 0.5) {
    return check(
      'duration',
      'fail',
      `Речь длиннее черновика: слова до ${expectedEnd.toFixed(1)} с, видео ${durationSec.toFixed(1)} с`,
    );
  }

  if (durationSec < 20 || durationSec > 70) {
    return check(
      'duration',
      'warn',
      `Нестандартная длительность: ${durationSec.toFixed(1)} с`,
    );
  }

  return check(
    'duration',
    'pass',
    `${durationSec.toFixed(1)} с; аудио ${audioDurationSec.toFixed(1)} с, видео ${videoDurationSec.toFixed(1)} с`,
  );
}

function loudnessCheck(input: QcInput): QcCheck {
  const integrated = Number(input.loudness.input_i);
  const truePeak = Number(input.loudness.input_tp);
  const deviation = Math.abs(integrated - LOUDNESS_TARGET);

  if (!Number.isFinite(integrated) || !Number.isFinite(truePeak)) {
    return check('loudness', 'fail', 'Не удалось измерить громкость');
  }

  if (deviation > 3 || truePeak > -0.1) {
    return check(
      'loudness',
      'fail',
      `${integrated.toFixed(1)} LUFS, true peak ${truePeak.toFixed(1)} dBTP`,
    );
  }

  if (deviation > 1.5 || truePeak > TRUE_PEAK_TARGET) {
    return check(
      'loudness',
      'warn',
      `${integrated.toFixed(1)} LUFS, true peak ${truePeak.toFixed(1)} dBTP`,
    );
  }

  return check(
    'loudness',
    'pass',
    `${integrated.toFixed(1)} LUFS, true peak ${truePeak.toFixed(1)} dBTP`,
  );
}

function syncCheck(input: QcInput): QcCheck {
  const { durationSec, audioDurationSec, videoDurationSec, audioGaps } =
    input.probe;
  const maxGap = audioGaps.length > 0 ? Math.max(...audioGaps) : 0;
  const streamDiff = Math.abs(audioDurationSec - videoDurationSec);
  const expectedEnd = input.words.at(-1)?.endSec ?? 0;

  if (maxGap > 0.5 || streamDiff > 0.5 || expectedEnd > durationSec + 0.5) {
    return check(
      'sync',
      'fail',
      `Разрыв аудио ${maxGap.toFixed(2)} с; аудио/видео ${streamDiff.toFixed(2)} с`,
    );
  }

  if (maxGap > 0.2 || streamDiff > 0.2) {
    return check(
      'sync',
      'warn',
      `Небольшой разрыв аудио ${maxGap.toFixed(2)} с`,
    );
  }

  return check('sync', 'pass', 'Аудио и видео синхронны');
}

function stopWordsCheck(input: QcInput): QcCheck {
  const text = scriptText(input.script).toLowerCase();
  const found = STOP_WORDS.filter((word) => text.includes(word));

  if (found.length > 0) {
    return check(
      'stop_words',
      'warn',
      `Найдены стоп-слова: ${[...new Set(found)].join(', ')}`,
    );
  }

  return check('stop_words', 'pass', 'Стоп-слов не найдено');
}

function aigcCheck(): QcCheck {
  return check('aigc', 'pass', 'Флаг is_aigc=true будет отправлен при публикации');
}

function readabilityCheck(input: QcInput): QcCheck {
  const duration = input.probe.durationSec;
  const wpm = duration > 0 ? input.words.length / (duration / 60) : 0;
  const longestSentence = maxSentenceWords(scriptText(input.script));

  if (wpm < 60 || wpm > 260 || longestSentence > 35) {
    return check(
      'readability',
      'fail',
      `${wpm.toFixed(0)} слов/мин, самое длинное предложение ${longestSentence} слов`,
    );
  }

  if (wpm < 90 || wpm > 200 || longestSentence > 25) {
    return check(
      'readability',
      'warn',
      `${wpm.toFixed(0)} слов/мин, самое длинное предложение ${longestSentence} слов`,
    );
  }

  return check(
    'readability',
    'pass',
    `${wpm.toFixed(0)} слов/мин, предложения до ${longestSentence} слов`,
  );
}

export function runQcChecks(input: QcInput): QcResult {
  const checks = [
    durationCheck(input),
    loudnessCheck(input),
    syncCheck(input),
    stopWordsCheck(input),
    aigcCheck(),
    readabilityCheck(input),
  ];
  const verdict = checks.some((item) => item.status === 'fail')
    ? 'fail'
    : checks.some((item) => item.status === 'warn')
      ? 'warn'
      : 'pass';
  const text = scriptText(input.script).toLowerCase();
  const stopWords = [
    ...new Set(STOP_WORDS.filter((word) => text.includes(word))),
  ];
  const duration = input.probe.durationSec;
  const metrics: QcMetrics = {
    durationSec: round(duration, 2),
    audioDurationSec: round(input.probe.audioDurationSec, 2),
    videoDurationSec: round(input.probe.videoDurationSec, 2),
    integratedLufs: round(Number(input.loudness.input_i), 1),
    truePeakDb: round(Number(input.loudness.input_tp), 1),
    loudnessRange: round(Math.max(0, Number(input.loudness.input_lra)), 1),
    words: input.words.length,
    wordsPerMinute: round(duration > 0 ? input.words.length / (duration / 60) : 0),
    maxSentenceWords: maxSentenceWords(scriptText(input.script)),
    audioGaps: input.probe.audioGaps.map((gap) => round(gap, 3)),
    stopWords,
    isAigc: true,
  };

  return { verdict, checks, metrics };
}
