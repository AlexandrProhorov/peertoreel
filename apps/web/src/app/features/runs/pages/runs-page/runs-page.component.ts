import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
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
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
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

  protected readonly form = this.fb.group({
    topic: ['', [Validators.required, Validators.maxLength(300)]],
  });

  ngOnInit(): void {
    this.store.load();
  }

  protected create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.create(this.form.getRawValue().topic).then((run) => {
      if (!run) {
        return;
      }

      this.form.reset();
      void this.router.navigate(['/runs', run.id]);
    });
  }
}
