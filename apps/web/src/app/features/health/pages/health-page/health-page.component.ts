import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HealthStoreService } from '../../data-access/health-store.service';

@Component({
  selector: 'app-health-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './health-page.component.html',
  styleUrl: './health-page.component.scss',
})
export class HealthPageComponent implements OnInit {
  protected readonly store = inject(HealthStoreService);

  protected readonly databaseStatus = computed(
    () => this.store.data()?.checks.database ?? 'down',
  );
  protected readonly redisStatus = computed(
    () => this.store.data()?.checks.redis ?? 'down',
  );

  ngOnInit(): void {
    this.store.load();
  }

  protected refresh(): void {
    this.store.load();
  }
}
