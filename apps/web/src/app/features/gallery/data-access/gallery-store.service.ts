import { computed, Injectable, signal } from '@angular/core';
import { BaseStore } from '../../../core/state/base-store';
import {
  GALLERY_CATALOG,
  initialParams,
  type GalleryCatalog,
  type GalleryPrimitive,
  type GalleryValue,
} from './gallery-catalog';
import { coerceParam } from './gallery-params';

function firstOffered(catalog: GalleryCatalog): GalleryPrimitive {
  const primitive =
    catalog.primitives.find((item) => item.id === 'label' && item.offeredToDirector) ??
    catalog.primitives.find((item) => item.offeredToDirector) ??
    catalog.primitives[0];

  if (primitive === undefined) {
    throw new Error('the gallery catalogue has no primitives');
  }

  return primitive;
}

/**
 * Sandbox state: which primitive is open, its settings and the theme. Nothing
 * is fetched — the catalogue ships with the bundle — but the store keeps the
 * same shape as every other feature so components stay presentational.
 */
@Injectable()
export class GalleryStoreService extends BaseStore {
  private readonly catalogState = signal<GalleryCatalog>(GALLERY_CATALOG);
  readonly catalog = this.catalogState.asReadonly();

  private readonly showHiddenState = signal(false);
  readonly showHidden = this.showHiddenState.asReadonly();

  private readonly themeIdState = signal<string>(
    GALLERY_CATALOG.themes[0]?.id ?? 'studio-dark',
  );
  readonly themeId = this.themeIdState.asReadonly();
  readonly themes = computed(() => this.catalog().themes);

  readonly visiblePrimitives = computed(() =>
    this.catalog().primitives.filter(
      (primitive) => primitive.offeredToDirector || this.showHiddenState(),
    ),
  );

  private readonly selectedIdState = signal(firstOffered(GALLERY_CATALOG).id);
  readonly selectedId = this.selectedIdState.asReadonly();

  readonly selected = computed<GalleryPrimitive | null>(
    () =>
      this.catalog().primitives.find(
        (primitive) => primitive.id === this.selectedIdState(),
      ) ?? null,
  );

  private readonly paramsState = signal<Record<string, GalleryValue>>({});
  readonly params = this.paramsState.asReadonly();

  constructor() {
    super();
    this.paramsState.set(initialParams(firstOffered(GALLERY_CATALOG)));
  }

  select(id: string): void {
    const primitive = this.catalog().primitives.find((item) => item.id === id);

    if (primitive === undefined) {
      return;
    }

    this.selectedIdState.set(id);
    this.paramsState.set(initialParams(primitive));
  }

  setParam(name: string, value: GalleryValue): void {
    const parameter = this.selected()?.parameters.find(
      (item) => item.name === name,
    );

    if (parameter === undefined) {
      return;
    }

    this.paramsState.update((params) => ({
      ...params,
      [name]: coerceParam(parameter, value),
    }));
  }

  resetParams(): void {
    const primitive = this.selected();

    if (primitive !== null) {
      this.paramsState.set(initialParams(primitive));
    }
  }

  setTheme(id: string): void {
    if (this.catalog().themes.some((theme) => theme.id === id)) {
      this.themeIdState.set(id);
    }
  }

  /** Hiding the group must not leave a hidden primitive open. */
  toggleHidden(): void {
    this.setShowHidden(!this.showHiddenState());
  }

  setShowHidden(next: boolean): void {
    if (this.showHiddenState() === next) {
      return;
    }

    this.showHiddenState.set(next);

    const selected = this.selected();

    if (!next && selected !== null && !selected.offeredToDirector) {
      this.select(firstOffered(this.catalog()).id);
    }
  }
}
