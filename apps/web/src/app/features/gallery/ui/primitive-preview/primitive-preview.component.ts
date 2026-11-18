import { DestroyRef, Component, effect, inject, input, signal, viewChild, ElementRef } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type { GalleryValue } from '../../data-access/gallery-catalog';
import {
  buildPreviewMessage,
  parseFrameEvent,
  previewUrl,
  type GalleryPreviewMessage,
} from '../../data-access/gallery-preview';

/**
 * The iframe boundary: the playground renders primitives in their own React
 * environment, Angular tells it what to draw. Messages are posted only after
 * the frame announces `ready`; the last one is replayed otherwise.
 */
@Component({
  selector: 'app-primitive-preview',
  templateUrl: './primitive-preview.component.html',
  styleUrl: './primitive-preview.component.scss',
})
export class PrimitivePreviewComponent {
  readonly primitiveId = input.required<string>();
  readonly params = input.required<Record<string, GalleryValue>>();
  readonly themeId = input.required<string>();

  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>(
    'frame',
  );
  private readonly pending = signal<GalleryPreviewMessage | null>(null);

  protected readonly isReady = signal(false);
  protected readonly failed = signal<string | null>(null);

  /**
   * A resource URL binding is sanitized by Angular and our own static asset is
   * rejected as untrusted (NG0904). The path is generated from `base href`, not
   * from user input, so it is trusted explicitly.
   */
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly src: SafeResourceUrl =
    this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl(document.baseURI));

  /** A plain field, not a signal: `flush` is called from the effect and must not re-enter it. */
  private frameReady = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const message = buildPreviewMessage(
        this.primitiveId(),
        this.params(),
        this.themeId(),
      );

      this.pending.set(message);
      this.flush();
    });

    window.addEventListener('message', this.onMessage);
    destroyRef.onDestroy(() => window.removeEventListener('message', this.onMessage));
  }

  protected onLoad(): void {
    /* A reloaded iframe announces `ready` again; the stored message is replayed. */
    this.frameReady = false;
    this.isReady.set(false);
    this.failed.set(null);
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if (event.source !== this.frame().nativeElement.contentWindow) {
      return;
    }

    const parsed = parseFrameEvent(event.data);

    if (parsed === null) {
      return;
    }

    if (parsed.type === 'error') {
      this.failed.set(parsed.message);
      return;
    }

    this.frameReady = true;
    this.isReady.set(true);
    this.flush();
  };

  private flush(): void {
    if (!this.frameReady) {
      return;
    }

    const message = this.pending();

    if (message === null) {
      return;
    }

    const target = this.frame().nativeElement.contentWindow;

    if (target !== null) {
      target.postMessage(message, window.location.origin);
    }
  }
}
