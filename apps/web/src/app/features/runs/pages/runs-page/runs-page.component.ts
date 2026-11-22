import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import type { RunTtsProvider } from '@peertoreel/contracts';
import { runStageLabel, runStateLabel, runStateTone } from '../../data-access/run-labels';
import { RunsListStoreService } from '../../data-access/runs-list-store.service';

@Component({
  selector: 'app-runs-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatOptionModule,
    MatSelectModule,
  ],
  templateUrl: './runs-page.component.html',
  styleUrl: './runs-page.component.scss',
})
export class RunsPageComponent implements OnInit {
  protected readonly store = inject(RunsListStoreService);
  protected readonly stateLabel = runStateLabel;
  protected readonly stageLabel = runStageLabel;
  protected readonly stateTone = runStateTone;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.group({
    topic: ['', [Validators.required, Validators.maxLength(300)]],
    episode: [false],
    ttsProvider: ['elevenlabs' as RunTtsProvider],
  });

  ngOnInit(): void {
    this.store.load();

    this.form.controls.episode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((episode) => {
        if (episode) {
          this.form.controls.ttsProvider.setValue('google');
        } else {
          this.form.controls.ttsProvider.setValue('elevenlabs');
        }
      });
  }

  protected create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { topic, episode, ttsProvider } = this.form.getRawValue();

    this.store.create(topic, episode ? 'episode' : 'pipeline', ttsProvider, (run) => {
      this.form.reset();
      void this.router.navigate(['/runs', run.id]);
    });
  }
}
