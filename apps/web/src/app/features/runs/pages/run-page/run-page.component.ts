import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { RunState } from '@kadence/contracts';
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
    RouterLink,
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

  protected readonly store = inject(RunsStoreService);
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
