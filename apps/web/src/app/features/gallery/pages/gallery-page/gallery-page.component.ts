import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  type GalleryParameter,
  type GalleryValue,
} from '../../data-access/gallery-catalog';
import { enumFromInput, displayValue } from '../../data-access/gallery-params';
import { GalleryStoreService } from '../../data-access/gallery-store.service';
import { PrimitivePreviewComponent } from '../../ui/primitive-preview/primitive-preview.component';

function inputElement(event: Event): HTMLInputElement | null {
  return event.target instanceof HTMLInputElement ? event.target : null;
}

function selectElement(event: Event): HTMLSelectElement | null {
  return event.target instanceof HTMLSelectElement ? event.target : null;
}

/** Sliders are useless with a step of 1 on a 0..1 parameter. */
function stepFor(parameter: GalleryParameter): number {
  if (parameter.min === undefined || parameter.max === undefined) {
    return 1;
  }

  const span = parameter.max - parameter.min;

  if (span <= 1) {
    return 0.01;
  }

  return span <= 20 ? 0.1 : 1;
}

@Component({
  selector: 'app-gallery-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    PrimitivePreviewComponent,
  ],
  templateUrl: './gallery-page.component.html',
  styleUrl: './gallery-page.component.scss',
})
export class GalleryPageComponent {
  protected readonly store = inject(GalleryStoreService);

  protected readonly stepFor = stepFor;
  protected readonly displayValue = displayValue;

  protected valueOf(name: string): GalleryValue {
    return this.store.params()[name] ?? '';
  }

  protected isTrue(name: string): boolean {
    return this.store.params()[name] === true;
  }

  protected onTheme(event: Event): void {
    const element = selectElement(event);

    if (element !== null) {
      this.store.setTheme(element.value);
    }
  }

  protected onNumber(parameter: GalleryParameter, event: Event): void {
    const element = inputElement(event);

    if (element !== null) {
      this.store.setParam(parameter.name, Number(element.value));
    }
  }

  protected onText(parameter: GalleryParameter, event: Event): void {
    const element = inputElement(event);

    if (element !== null) {
      this.store.setParam(parameter.name, element.value);
    }
  }

  protected onEnum(parameter: GalleryParameter, event: Event): void {
    const element = selectElement(event);

    if (element !== null) {
      this.store.setParam(parameter.name, enumFromInput(parameter, element.value));
    }
  }
}
