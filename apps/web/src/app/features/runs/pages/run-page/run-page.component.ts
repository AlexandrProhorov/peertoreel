import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, Injector, input, type OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import type { RunState, StageQueueName } from '@peertoreel/contracts';
import {
  artifactLabel,
  formatBytes,
  isAudio,
  sortArtifacts,
} from '../../data-access/artifact-labels';
import {
  runStageLabel,
  runStateLabel,
  runStateTone,
  transitionLabel,
} from '../../data-access/run-labels';
import {
  qcCheckLabel,
  qcStatusLabel,
  qcVerdictLabel,
} from '../../data-access/qc-labels';
import { RunDetailStoreService } from '../../data-access/run-detail-store.service';
import { PublishCardComponent } from '../../ui/publish-card/publish-card.component';

interface RegenerationAction {
  stage: StageQueueName;
  label: string;
  hint: string;
}

const REGENERATION_ACTIONS: readonly RegenerationAction[] = [
  {
    stage: 'script',
    label: 'Перегенерировать сценарий',
    hint: 'Сценарий; остановится на проверке сценария.',
  },
  {
    stage: 'voiceover',
    label: 'Перегенерировать озвучку',
    hint: 'Озвучка → визуалы → рендер.',
  },
  {
    stage: 'visuals',
    label: 'Перегенерировать визуалы',
    hint: 'Визуалы → рендер.',
  },
];

/**
 * These edges belong to stage processors. Showing them as manual buttons
 * creates dead ends: the state changes but no job starts.
 */
const STAGE_OWNED_TRANSITIONS = new Set<string>([
  'RESEARCHING:SCRIPT_READY',
  'SCRIPT_READY:VOICE_READY',
  'VOICE_READY:VISUALS_READY',
  'VISUALS_READY:RENDERING',
  'RENDERING:REVIEW',
  'RENDERING:VISUALS_READY',
  // Defensive: older contracts allowed this dead-end edge from REVIEW.
  'REVIEW:RENDERING',
]);

const REVIEW_REGENERATION_TARGETS = new Set<RunState>([
  'SCRIPT_READY',
  'VOICE_READY',
  'VISUALS_READY',
]);

/**
 * Manual export owns these edges: the publish card renders one action and
 * writes two audit rows, so raw buttons would create a PUBLISHING dead end.
 */
const PUBLISH_OWNED_TRANSITIONS = new Set<string>([
  'SCHEDULED:PUBLISHING',
  'PUBLISHING:PUBLISHED',
]);

/** Forward edges rendered as the single filled primary button. */
const PRIMARY_TRANSITIONS = new Set<string>([
  'DRAFT:RESEARCHING',
  'REVIEW:SCHEDULED',
]);

@Component({
  selector: 'app-run-page',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    PublishCardComponent,
  ],
  templateUrl: './run-page.component.html',
  styleUrl: './run-page.component.scss',
})
export class RunPageComponent implements OnInit {
  readonly id = input.required<string>();

  protected readonly store = inject(RunDetailStoreService);
  private readonly router = inject(Router);
  protected readonly stateLabel = runStateLabel;
  protected readonly stageLabel = runStageLabel;
  protected readonly stateTone = runStateTone;
  protected readonly transitionLabel = transitionLabel;
  protected readonly qcVerdictLabel = qcVerdictLabel;
  protected readonly qcStatusLabel = qcStatusLabel;
  protected readonly qcCheckLabel = qcCheckLabel;
  protected readonly artifactLabel = artifactLabel;
  protected readonly formatBytes = formatBytes;
  protected readonly isAudio = isAudio;
  protected readonly artifacts = computed(() => sortArtifacts(this.store.artifacts()));
  /** The draft gets its own block above the history; the rest stay in artifacts. */
  protected readonly draft = computed(
    () => this.artifacts().find((artifact) => artifact.type === 'draft_mp4') ?? null,
  );
  protected readonly otherArtifacts = computed(() =>
    this.artifacts().filter(
      (artifact) =>
        artifact.type !== 'draft_mp4' && artifact.type !== 'qc_report',
    ),
  );
  protected readonly regenerationActions = REGENERATION_ACTIONS;
  protected readonly canRegenerate = computed(() => this.store.selected()?.state === 'REVIEW');
  /** Human decisions and "back" edges; stage-owned transitions are hidden. */
  protected readonly regularActions = computed<RunState[]>(() => {
    const run = this.store.selected();

    if (!run) {
      return [];
    }

    return this.store.allowed().filter((to) => {
      if (STAGE_OWNED_TRANSITIONS.has(`${run.state}:${to}`)) {
        return false;
      }

      if (PUBLISH_OWNED_TRANSITIONS.has(`${run.state}:${to}`)) {
        return false;
      }

      if (run.state === 'REVIEW' && to === 'SCHEDULED') {
        const qc = this.store.qcReport();

        return !!qc && qc.verdict !== 'fail';
      }

      return !(run.state === 'REVIEW' && REVIEW_REGENERATION_TARGETS.has(to));
    });
  });
  protected readonly reason = new FormControl('', { nonNullable: true });
  protected readonly primaryActions = computed<RunState[]>(() => {
    const run = this.store.selected();

    if (!run) {
      return [];
    }

    return this.regularActions().filter((to) => {
      if (run.state === 'FAILED') {
        return to !== 'FAILED';
      }

      return PRIMARY_TRANSITIONS.has(`${run.state}:${to}`);
    });
  });
  protected readonly secondaryActions = computed<RunState[]>(() => {
    const primary = new Set(this.primaryActions());

    return this.regularActions().filter((to) => to !== 'FAILED' && !primary.has(to));
  });
  protected readonly canStop = computed(() => this.regularActions().includes('FAILED'));

  private readonly injector = inject(Injector);

  ngOnInit(): void {
    // The route is scoped to the store, but Angular reuses the component when
    // only the `id` parameter changes. setRelativeId resets and reloads.
    effect(() => this.store.setRelativeId(this.id()), {
      injector: this.injector,
    });
  }

  protected goToRuns(): void {
    void this.router.navigateByUrl('/runs');
  }

  protected runStage(stage: StageQueueName): void {
    this.store.runStage(stage);
  }

  protected regenerate(stage: StageQueueName): void {
    if (this.store.pending() || this.store.stageRunning()) {
      return;
    }

    this.store.regenerate(stage);
  }

  /** The publish card wrote two audit rows; re-read the run and its history. */
  protected onPublished(): void {
    this.store.reload();
  }

  protected stageTitle(stage: StageQueueName): string {
    switch (stage) {
      case 'script':
        return 'Генерация сценария';
      case 'voiceover':
        return 'Генерация озвучки';
      case 'visuals':
        return 'Подбор визуалов';
      case 'render':
        return 'Сборка черновика';
      case 'qc':
        return 'Проверка качества';
    }
  }

  protected stageHint(stage: StageQueueName): string {
    switch (stage) {
      case 'script':
        return 'LLM соберёт сценарий из темы и сохранит его JSON-артефактом.';
      case 'voiceover':
        return 'ElevenLabs озвучит сценарий и вернёт тайминги слов для субтитров.';
      case 'visuals':
        return 'Pixabay подберёт вертикальные клипы и фото под каждый beat; если ассет не найден, сцена соберётся с fallback-фоном.';
      case 'render':
        return 'FFmpeg соберёт вертикальный черновик из визуалов, озвучки и караоке-субтитров.';
      case 'qc':
        return 'Проверит длительность, громкость, синхронизацию, стоп-слова и темп речи перед одобрением.';
    }
  }

  protected transition(to: RunState): void {
    if (this.store.pending()) {
      return;
    }

    const run = this.store.selected();

    // VISUALS_READY → VOICE_READY is the visuals regeneration edge; run the
    // stage instead of leaving the user on a bare state transition.
    if (run?.state === 'VISUALS_READY' && to === 'VOICE_READY') {
      this.regenerate('visuals');
      return;
    }

    const reason = this.reason.value.trim();

    if (to === 'FAILED' && reason.length === 0) {
      this.reason.markAsTouched();
      return;
    }

    this.store.transition(to, reason.length > 0 ? reason : undefined, () =>
      this.reason.reset(),
    );
  }
}
