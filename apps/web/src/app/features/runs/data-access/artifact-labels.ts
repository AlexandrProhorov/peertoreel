import type { Artifact } from '@peertoreel/contracts';
import type { RunStage } from '@peertoreel/contracts';

const TYPE_LABELS: Record<string, string> = {
  script_json: 'Сценарий',
  voiceover_mp3: 'Озвучка',
  word_timings: 'Тайминги слов',
  subtitles_ass: 'Субтитры',
  visuals_json: 'Визуалы (манифест)',
  visual_clip: 'Стоковый клип',
  visual_image: 'Стоковое изображение',
  storyboard_json: 'Раскадровка',
  scene_clip: 'Анимированная сцена',
  qc_report: 'Проверка качества',
  draft_mp4: 'Черновик видео',
};

export function artifactLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function isAudio(artifact: Artifact): boolean {
  return artifact.contentType.startsWith('audio/');
}

/** Stages in the order they run, for stable sorting in the UI. */
const STAGE_ORDER: RunStage[] = [
  'topic_discovery',
  'research',
  'script',
  'voiceover',
  'visuals',
  'render',
  'qc',
  'publish',
];

export function sortArtifacts(artifacts: readonly Artifact[]): Artifact[] {
  return [...artifacts].sort(
    (left, right) =>
      STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage),
  );
}
