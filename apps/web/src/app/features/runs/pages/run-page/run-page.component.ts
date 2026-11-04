import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import {
  STAGE_FOR_STATE,
  type RunState,
  type StageQueueName,
} from '@kadence/contracts';
import {
  artifactLabel,
  formatBytes,
  isAudio,
  isVideo,
  sortArtifacts,
} from '../../data-access/artifact-labels';
import {
  runStageLabel,
  runStateLabel,
  runStateTone,
  transitionLabel,
} from '../../data-access/run-labels';
import { RunsStoreService } from '../../data-access/runs-store.service';

@Component({
  selector: 'app-run-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './run-page.component.html',
  styleUrl: './run-page.component.scss',
})
export class RunPageComponent implements OnDestroy {
  readonly id = input.required<string>();

  protected readonly store = inject(RunsStoreService);
  private readonly router = inject(Router);
  protected readonly stateLabel = runStateLabel;
  protected readonly stageLabel = runStageLabel;
  protected readonly stateTone = runStateTone;
  protected readonly transitionLabel = transitionLabel;
  protected readonly artifactLabel = artifactLabel;
  protected readonly formatBytes = formatBytes;
  protected readonly isVideo = isVideo;
  protected readonly isAudio = isAudio;
  protected readonly artifacts = computed(() =>
    sortArtifacts(this.store.artifacts()),
  );
  protected readonly reason = new FormControl('', { nonNullable: true });

  private loadedId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.id();

      if (id !== this.loadedId) {
        this.loadedId = id;
        this.store.loadRun(id);
      }
    });
  }

  protected goToRuns(): void {
    this.store.clearStageJob();
    void this.router.navigateByUrl('/runs');
  }

  ngOnDestroy(): void {
    this.store.clearStageJob();
  }

  protected runStage(stage: StageQueueName): void {
    const run = this.store.selected();

    if (run) {
      this.store.runStage(run.id, stage);
    }
  }

  protected stageFor(state: RunState): StageQueueName | null {
    const stages: Partial<Record<RunState, StageQueueName>> = STAGE_FOR_STATE;

    return stages[state] ?? null;
  }

  protected stageTitle(stage: StageQueueName): string {
    switch (stage) {
      case 'script':
        return 'Генерация сценария';
      case 'voiceover':
        return 'Генерация озвучки';
      case 'render':
        return 'Сборка черновика';
    }
  }

  protected stageHint(stage: StageQueueName): string {
    switch (stage) {
      case 'script':
        return 'LLM соберёт сценарий из темы и сохранит его JSON-артефактом.';
      case 'voiceover':
        return 'ElevenLabs озвучит сценарий и вернёт тайминги слов для субтитров.';
      case 'render':
        return 'FFmpeg соберёт вертикальный черновик из озвучки и караоке-субтитров.';
    }
  }

  protected transition(to: RunState): void {
    const run = this.store.selected();

    if (!run || this.store.pending()) {
      return;
    }

    const reason = this.reason.value.trim();

    if (to === 'FAILED' && reason.length === 0) {
      this.reason.markAsTouched();
      return;
    }

    this.store.transition(run.id, to, reason.length > 0 ? reason : undefined);
    this.reason.reset();
  }
}
