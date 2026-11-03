import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SystemStoreService } from '../../data-access/system-store.service';

@Component({
  selector: 'app-system-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './system-page.component.html',
  styleUrl: './system-page.component.scss',
})
export class SystemPageComponent {
  protected readonly store = inject(SystemStoreService);

  protected readonly statusLabel = computed(() => {
    switch (this.store.status()) {
      case 'queued':
        return 'В очереди';
      case 'active':
        return 'Выполняется';
      case 'completed':
        return 'Готово';
      case 'failed':
        return 'Ошибка';
      default:
        return 'Не запускался';
    }
  });

  protected start(): void {
    this.store.start();
  }
}
