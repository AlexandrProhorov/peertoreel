import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  PUBLISH_PRIVACY_LEVELS,
  PUBLISH_TITLE_MAX_LENGTH,
  type Artifact,
  type PublishPrivacyLevel,
  type RunState,
} from '@peertoreel/contracts';
import { PublishCardStoreService } from '../../data-access/publish-card-store.service';
import {
  fromDateTimeLocal,
  hashtagsValidator,
  parseHashtagsInput,
  publishText,
  toDateTimeLocal,
  toHashtagsInput,
} from '../../data-access/publish-card-form';
import {
  publishCardStateLabel,
  publishPrivacyLabel,
} from '../../data-access/publish-labels';

/**
 * Publish card + manual export. Renders and delegates: the scoped store owns
 * loading/pending/errors, the parent run page owns the run state.
 */
@Component({
  selector: 'app-publish-card',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: './publish-card.component.html',
  styleUrl: './publish-card.component.scss',
})
export class PublishCardComponent {
  readonly runId = input.required<string>();
  readonly runState = input.required<RunState>();
  readonly defaultTitle = input<string>('');
  readonly draft = input<Artifact | null>(null);
  readonly published = output<void>();

  protected readonly store = inject(PublishCardStoreService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly privacyLevels = PUBLISH_PRIVACY_LEVELS;
  protected readonly privacyLabel = publishPrivacyLabel;
  protected readonly stateLabel = publishCardStateLabel;
  protected readonly titleMaxLength = PUBLISH_TITLE_MAX_LENGTH;

  protected readonly form = this.fb.group({
    title: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(PUBLISH_TITLE_MAX_LENGTH),
      ],
    }),
    hashtags: this.fb.control('', { validators: [hashtagsValidator] }),
    privacyLevel: this.fb.control<PublishPrivacyLevel | null>(null),
    scheduledAt: this.fb.control(''),
  });

  protected readonly readOnly = computed(() => this.runState() !== 'SCHEDULED');
  protected readonly canPublish = computed(
    () => this.runState() === 'SCHEDULED' && this.store.card() !== null,
  );
  protected readonly copied = signal(false);
  protected readonly copyError = signal<string | null>(null);
  private cardKey: string | null = null;
  private boundId: string | null = null;

  constructor() {
    // The store is route-scoped and survives the component: returning from
    // REVIEW to SCHEDULED recreates the card with the same run id, so a
    // same-id `setRelativeId` no-op would show the stale card. Reload instead.
    effect(() => {
      const id = this.runId();

      if (this.boundId === id) {
        return;
      }

      this.boundId = id;

      if (untracked(() => this.store.relativeId()) === id) {
        this.store.load();
      } else {
        this.store.setRelativeId(id);
      }
    });

    // Reset the form only when the server card changes, not on background
    // refreshes: unsaved edits must survive a run reload.
    effect(() => {
      const card = this.store.card();
      const missing = this.store.missing();
      // Only editable fields are part of the key: a state/timestamp change
      // (e.g. mark-exported) must not wipe unsaved caption edits.
      const key = card
        ? [
            card.id,
            card.title,
            card.hashtags.join('|'),
            card.privacyLevel ?? '',
            card.scheduledAt ?? '',
          ].join('~')
        : null;

      if (!card && !missing) {
        this.cardKey = null;
        return;
      }

      if (key !== null && key === this.cardKey) {
        return;
      }

      this.cardKey = key;
      this.copied.set(false);
      this.copyError.set(null);

      this.form.reset(
        card
          ? {
              title: card.title,
              hashtags: toHashtagsInput(card.hashtags),
              privacyLevel: card.privacyLevel,
              scheduledAt: toDateTimeLocal(card.scheduledAt),
            }
          : {
              title: this.defaultTitle(),
              hashtags: '',
              privacyLevel: null,
              scheduledAt: '',
            },
        { emitEvent: false },
      );
    });

    effect(() => {
      if (this.readOnly()) {
        this.form.disable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    });
  }

  protected save(): void {
    if (this.readOnly() || this.store.pending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    void this.store.save({
      title: raw.title.trim(),
      hashtags: parseHashtagsInput(raw.hashtags),
      privacyLevel: raw.privacyLevel,
      scheduledAt: fromDateTimeLocal(raw.scheduledAt),
    });
  }

  protected retry(): void {
    this.store.load();
  }

  protected downloadVideo(): void {
    if (this.runState() === 'SCHEDULED' && this.draft()) {
      void this.store.markExported();
    }
  }

  protected async copyText(): Promise<void> {
    const text = publishText({
      title: this.form.controls.title.value,
      hashtags: parseHashtagsInput(this.form.controls.hashtags.value),
    });

    this.copied.set(false);
    this.copyError.set(null);

    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API is unavailable');
      }

      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      try {
        this.copyWithTextarea(text);
        this.copied.set(true);
      } catch {
        this.copyError.set('Не удалось скопировать текст. Выделите его вручную.');
      }
    }
  }

  protected downloadJson(): void {
    const card = this.store.card();

    if (!card) {
      return;
    }

    const blob = new Blob([JSON.stringify(card, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `publish-card-${card.runId}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  protected async publishManually(): Promise<void> {
    if (this.store.pending() || !this.canPublish()) {
      return;
    }

    if (await this.store.markPublished()) {
      this.published.emit();
    }
  }

  private copyWithTextarea(text: string): void {
    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    document.body.append(textarea);
    textarea.select();

    if (typeof document.execCommand !== 'function') {
      textarea.remove();
      throw new Error('execCommand is unavailable');
    }

    const copied = document.execCommand('copy');
    textarea.remove();

    if (!copied) {
      throw new Error('Copy command was rejected');
    }
  }
}
