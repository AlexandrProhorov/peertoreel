import { TestBed } from '@angular/core/testing';
import { GALLERY_CATALOG } from './gallery-catalog';
import { GalleryStoreService } from './gallery-store.service';

function setup(): GalleryStoreService {
  TestBed.configureTestingModule({ providers: [GalleryStoreService] });

  return TestBed.inject(GalleryStoreService);
}

describe('GalleryStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens on a primitive the director may use', () => {
    const store = setup();

    /* `label` rather than `stage`: the first screen should show content, not a background. */
    expect(store.selectedId()).toBe('label');
    expect(store.selected()?.offeredToDirector).toBe(true);
  });

  it('starts with the catalogue defaults of the open primitive', () => {
    const store = setup();
    const selected = store.selected();

    expect(selected).not.toBeNull();

    for (const parameter of selected?.parameters ?? []) {
      expect(store.params()[parameter.name]).toBe(parameter.initial);
    }
  });

  it('resets the settings when another primitive is opened', () => {
    const store = setup();
    const target = GALLERY_CATALOG.primitives.find(
      (primitive) => primitive.id !== store.selectedId(),
    );

    if (target === undefined) {
      return;
    }

    store.select(target.id);

    expect(store.selectedId()).toBe(target.id);
    expect(Object.keys(store.params()).sort()).toEqual(
      target.parameters.map((parameter) => parameter.name).sort(),
    );
  });

  it('clamps a number into the declared range', () => {
    const store = setup();
    const parameter = store
      .selected()
      ?.parameters.find(
        (item) => item.type === 'number' && item.max !== undefined,
      );

    if (parameter?.max === undefined) {
      return;
    }

    store.setParam(parameter.name, parameter.max + 1000);

    expect(store.params()[parameter.name]).toBe(parameter.max);
  });

  it('ignores a parameter the open primitive does not declare', () => {
    const store = setup();
    const before = { ...store.params() };

    store.setParam('__missing__', 1);

    expect(store.params()).toEqual(before);
  });

  it('hides the asset primitives until the toggle is on', () => {
    const store = setup();
    const hidden = GALLERY_CATALOG.primitives.find(
      (primitive) => !primitive.offeredToDirector,
    );

    if (hidden === undefined) {
      throw new Error('the catalogue has no hidden primitive');
    }

    expect(store.visiblePrimitives()).not.toContainEqual(hidden);

    store.setShowHidden(true);

    expect(store.visiblePrimitives()).toContainEqual(hidden);
  });

  it('switches away from a hidden primitive when the toggle goes off', () => {
    const store = setup();
    const hidden = GALLERY_CATALOG.primitives.find(
      (primitive) => !primitive.offeredToDirector,
    );

    if (hidden === undefined) {
      return;
    }

    store.setShowHidden(true);
    store.select(hidden.id);
    store.setShowHidden(false);

    expect(store.selected()?.offeredToDirector).toBe(true);
    expect(store.visiblePrimitives()).not.toContainEqual(hidden);
  });

  it('accepts only themes from the catalogue', () => {
    const store = setup();
    const initial = store.themeId();

    store.setTheme('no-such-theme');

    expect(store.themeId()).toBe(initial);
  });
});
