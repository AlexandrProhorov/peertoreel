import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import type { RunState, StageQueueName } from '@kadence/contracts';
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
import { RunDetailStoreService } from '../../data-access/run-detail-store.service';

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
export class RunPageComponent {
  readonly id = input.required<string>();

  protected readonly store = inject(RunDetailStoreService);
  private readonly router = inject(Router);
  protected readonly stateLabel = runStateLabel;
  protected readonly stageLabel = runStageLabel;
  protected readonly stateTone = runStateTone;
  protected readonly transitionLabel = transitionLabel;
  protected readonly artifactLabel = artifactLabel;
  protected readonly formatBytes = formatBytes;
  protected readonly isVideo = isVideo;
  protected readonly isAudio = isAudio;
  protected readonly artifacts = computed(() => sortArtifacts(this.store.artifacts()));
  protected readonly reason = new FormControl('', { nonNullable: true });

  constructor() {
    // The route is scoped to the store, but Angular reuses the component when
    // only the `id` parameter changes. setRelativeId resets and reloads.
    effect(() => this.store.setRelativeId(this.id()));
  }

  protected goToRuns(): void {
    void this.router.navigateByUrl('/runs');
  }

  protected runStage(stage: StageQueueName): void {
    void this.store.runStage(stage);
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
    if (this.store.pending()) {
      return;
    }

    const reason = this.reason.value.trim();

    if (to === 'FAILED' && reason.length === 0) {
      this.reason.markAsTouched();
      return;
    }

    void this.store.transition(to, reason.length > 0 ? reason : undefined).then((ok) => {
      if (ok) {
        this.reason.reset();
      }
    });
  }
}
