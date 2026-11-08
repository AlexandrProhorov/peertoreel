import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import type { Artifact, PublishCard, RunState } from '@peertoreel/contracts';
import { of, throwError, type Observable } from 'rxjs';
import { vi } from 'vitest';
import { PublishCardApiService } from '../../api/publish-card-api.service';
import { PublishCardStoreService } from '../../data-access/publish-card-store.service';
import { PublishCardComponent } from './publish-card.component';

const runId = '11111111-1111-4111-8111-111111111111';

const card: PublishCard = {
  id: '33333333-3333-4333-8333-333333333333',
  runId,
  title: 'Топ 5 пород собак',
  hashtags: ['пород', 'собак'],
  privacyLevel: null,
  isAigc: true,
  scheduledAt: null,
  exportedAt: null,
  publishedAt: null,
  state: 'draft',
  publishId: null,
  postId: null,
  failReason: null,
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

const draft: Artifact = {
  id: '44444444-4444-4444-8444-444444444444',
  stage: 'render',
  type: 'draft_mp4',
  contentType: 'video/mp4',
  sizeBytes: 14_579_335,
  createdAt: '2026-11-06T09:00:00.000Z',
  url: 'http://storage.test/draft.mp4',
};

function notFound(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 404,
    error: {
      error: {
        code: 'NOT_FOUND',
        message: 'Карточки нет',
        requestId: 'req-1',
      },
    },
  });
}

function serverError(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 500,
    error: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Сервер недоступен',
        requestId: 'req-1',
      },
    },
  });
}

interface SetupOptions {
  cardResult?: Observable<PublishCard>;
  runState?: RunState;
  draft?: Artifact;
  api?: Partial<ApiMock>;
}

function apiMock() {
  return {
    card: vi.fn().mockReturnValue(of(card)),
    save: vi.fn().mockReturnValue(of(card)),
    markExported: vi.fn().mockReturnValue(of({ ...card, state: 'exported' as const })),
    markPublished: vi.fn().mockReturnValue(of({ ...card, state: 'published' as const })),
  };
}

type ApiMock = ReturnType<typeof apiMock>;

function setup(options: SetupOptions = {}) {
  const api: ApiMock = {
    ...apiMock(),
    ...options.api,
  };

  if (!options.api?.card) {
    api.card.mockReturnValue(options.cardResult ?? of(card));
  }

  TestBed.configureTestingModule({
    providers: [
      PublishCardStoreService,
      provideAnimationsAsync(),
      { provide: PublishCardApiService, useValue: api },
    ],
  });

  const fixture = TestBed.createComponent(PublishCardComponent);

  fixture.componentRef.setInput('runId', runId);
  fixture.componentRef.setInput('runState', options.runState ?? 'SCHEDULED');
  fixture.componentRef.setInput('defaultTitle', 'топ 5 пород собак');
  fixture.componentRef.setInput('draft', options.draft ?? draft);
  fixture.detectChanges();
  fixture.detectChanges();

  return { fixture, api, component: fixture.componentInstance };
}

function formOf(component: PublishCardComponent): FormGroup {
  return (component as unknown as { form: FormGroup }).form;
}

function invoke<T>(component: PublishCardComponent, method: string): T {
  const fn = (component as unknown as Record<string, () => T>)[method];

  if (!fn) {
    throw new Error(`Unknown component method: ${method}`);
  }

  return fn.call(component);
}

function textOf(fixture: ComponentFixture<PublishCardComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('PublishCardComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('fills the form from the card and shows the AIGC badge', () => {
    const { fixture, component } = setup();
    const form = formOf(component);

    expect(form.controls['title']?.value).toBe('Топ 5 пород собак');
    expect(form.controls['hashtags']?.value).toBe('#пород #собак');
    expect(form.controls['privacyLevel']?.value).toBeNull();
    expect(form.controls['scheduledAt']?.value).toBe('');
    expect(textOf(fixture)).toContain('AI-generated: да');
    expect(textOf(fixture)).toContain('TikTok ещё не подключён');
  });

  it('starts from the topic when the card does not exist yet', () => {
    const { fixture, component } = setup({
      cardResult: throwError(() => notFound()),
    });

    expect(formOf(component).controls['title']?.value).toBe('топ 5 пород собак');
    expect(formOf(component).controls['hashtags']?.value).toBe('');
    expect(textOf(fixture)).toContain('Карточка ещё не создана');
  });

  it('saves a trimmed title, parsed hashtags and an ISO schedule', () => {
    const { component, api } = setup();
    const form = formOf(component);

    form.controls['title']?.setValue('  Новый заголовок  ');
    form.controls['hashtags']?.setValue('#пород, собак');
    form.controls['privacyLevel']?.setValue('SELF_ONLY');
    form.controls['scheduledAt']?.setValue('2026-11-07T09:30');

    invoke(component, 'save');

    expect(api.save).toHaveBeenCalledWith(runId, {
      title: 'Новый заголовок',
      hashtags: ['пород', 'собак'],
      privacyLevel: 'SELF_ONLY',
      scheduledAt: expect.any(String),
    });
  });

  it('does not submit a whitespace-only title', () => {
    const { component, api } = setup();
    const form = formOf(component);

    form.controls['title']?.setValue('   ');
    invoke(component, 'save');

    expect(form.controls['title']?.touched).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('copies the current form text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { fixture, component } = setup();

    await invoke<Promise<void>>(component, 'copyText');
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('Топ 5 пород собак\n\n#пород #собак');
    expect(textOf(fixture)).toContain('Текст скопирован');
  });

  it('falls back to a textarea when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    const { component } = setup();

    await invoke<Promise<void>>(component, 'copyText');

    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('downloads the card as a JSON blob', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:card');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const { component } = setup();

    invoke(component, 'downloadJson');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:card');
    expect(click).toHaveBeenCalled();
  });

  it('marks the run published manually and notifies the parent', async () => {
    const { component, api } = setup();
    const published = vi.fn();
    component.published.subscribe(published);

    await invoke<Promise<void>>(component, 'publishManually');

    expect(api.markPublished).toHaveBeenCalledWith(runId);
    expect(published).toHaveBeenCalled();
  });

  it('is read-only while the run is publishing', () => {
    const { fixture, component } = setup({
      runState: 'PUBLISHING',
      cardResult: of({ ...card, state: 'exported' }),
    });

    expect(formOf(component).disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type="submit"]')).toBeNull();
  });

  it('uses the download URL for the video link', () => {
    const { fixture } = setup({
      draft: { ...draft, downloadUrl: 'http://storage.test/download.mp4' },
    });

    const link = fixture.nativeElement.querySelector('a[download]') as
      | HTMLAnchorElement
      | null;

    expect(link?.getAttribute('href')).toBe('http://storage.test/download.mp4');
  });

  it('offers a retry when the card fails to load', () => {
    const cardMock = vi
      .fn()
      .mockReturnValueOnce(throwError(() => serverError()))
      .mockReturnValue(of(card));
    const { fixture, component } = setup({ api: { card: cardMock } });

    expect(cardMock).toHaveBeenCalledTimes(1);
    expect(textOf(fixture)).toContain('Сервер недоступен');
    expect(textOf(fixture)).toContain('Повторить загрузку');

    invoke(component, 'retry');
    fixture.detectChanges();
    fixture.detectChanges();

    expect(formOf(component).controls['title']?.value).toBe('Топ 5 пород собак');
    expect(textOf(fixture)).not.toContain('Повторить загрузку');
  });

  it('keeps unsaved caption edits when the export timestamp changes', async () => {
    const { fixture, component, api } = setup();

    formOf(component).controls['title']?.setValue('Несохранённый заголовок');
    api.markExported.mockReturnValue(
      of({
        ...card,
        state: 'exported',
        exportedAt: '2026-11-06T10:05:00.000Z',
        updatedAt: '2026-11-06T10:05:00.000Z',
      }),
    );

    const store = (component as unknown as { store: PublishCardStoreService })
      .store;

    await store.markExported();
    fixture.detectChanges();

    expect(formOf(component).controls['title']?.value).toBe(
      'Несохранённый заголовок',
    );
  });

  it('reloads the card when the component is recreated for the same run', () => {
    const { fixture, api } = setup();

    expect(formOf(fixture.componentInstance).controls['title']?.value).toBe(
      card.title,
    );
    fixture.destroy();

    api.card.mockReturnValue(of({ ...card, title: 'Свежая карточка' }));

    const second = TestBed.createComponent(PublishCardComponent);

    second.componentRef.setInput('runId', runId);
    second.componentRef.setInput('runState', 'SCHEDULED');
    second.componentRef.setInput('defaultTitle', 'топ 5 пород собак');
    second.componentRef.setInput('draft', draft);
    second.detectChanges();
    second.detectChanges();

    expect(
      formOf(second.componentInstance).controls['title']?.value,
    ).toBe('Свежая карточка');
  });
});
