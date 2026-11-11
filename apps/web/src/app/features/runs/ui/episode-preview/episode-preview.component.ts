import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { EpisodeVisual, StoryboardScene } from '@peertoreel/contracts';
import { scenePartLabel, sceneRecipeLabel } from '../../data-access/episode-preview';
import { EpisodeStore } from '../../data-access/episode-store.service';

/**
 * Storyboard preview of an episode run. It reads the scoped `EpisodeStore`;
 * the page decides when the gate makes the preview meaningful.
 */
@Component({
  selector: 'app-episode-preview',
  imports: [DecimalPipe, MatButtonModule, MatCardModule, MatProgressBarModule],
  templateUrl: './episode-preview.component.html',
  styleUrl: './episode-preview.component.scss',
})
export class EpisodePreviewComponent {
  protected readonly store = inject(EpisodeStore);
  protected readonly manifest = computed(
    () => this.store.storyboard()?.manifest ?? null,
  );
  protected readonly scenes = computed<StoryboardScene[]>(
    () => this.store.storyboard()?.storyboard.scenes ?? [],
  );
  protected readonly images = computed(() => {
    const byScene = new Map<string, EpisodeVisual[]>();

    for (const image of this.store.storyboard()?.visuals.images ?? []) {
      const images = byScene.get(image.sceneId) ?? [];
      images.push(image);
      byScene.set(image.sceneId, images);
    }

    return byScene;
  });

  protected readonly partLabel = scenePartLabel;
  protected readonly recipeLabel = sceneRecipeLabel;

  protected imagesForScene(sceneId: string): EpisodeVisual[] {
    return this.images().get(sceneId) ?? [];
  }
}
