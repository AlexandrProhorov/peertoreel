import { Component, inject, Injector } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStateService } from './core/auth/session-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  protected readonly session = inject(SessionStateService);
  protected readonly currentYear = new Date().getFullYear();
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /**
   * The auth feature (and its Zod payload schemas) is imported on demand so
   * anonymous visitors do not download it.
   */
  protected logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');

    void import('./features/auth/data-access/auth-store.service').then(
      (module) => this.injector.get(module.AuthStoreService).logout(),
    );
  }
}
