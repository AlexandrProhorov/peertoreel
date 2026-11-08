import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  QcReport,
  Run,
  RunDetail,
  StageJobSnapshot,
  StageQueueName,
  TransitionRunRequest,
} from '@peertoreel/contracts';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, vi } from 'vitest';
import { RunsApiService } from '../api/runs-api.service';
import { RunDetailStoreService } from './run-detail-store.service';

const run: Run = {
  id: '11111111-1111-4111-8111-111111111111',
  topic: 'Почему небо синее',
  state: 'DRAFT',
  currentStage: 'topic_discovery',
  failedStage: null,
  failureReason: null,
  resumeState: null,
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
};

const draftDetail: RunDetail = { ...run, events: [] };
const researchingDetail: RunDetail = {
  ...run,
  state: 'RESEARCHING',
  currentStage: 'research',
  events: [],
};
const renderingDetail: RunDetail = {
  ...run,
  state: 'RENDERING',
  currentStage: 'render',
  events: [],
};
const voiceReadyDetail: RunDetail = {
  ...run,
  state: 'VOICE_READY',
  currentStage: 'voiceover',
  events: [],
};
const reviewDetail: RunDetail = {
  ...run,
  state: 'REVIEW',
  currentStage: 'qc',
  events: [],
};

const qcReport: QcReport = {
  verdict: 'pass',
  checks: [{ id: 'duration', status: 'pass', message: '47.9 с' }],
  metrics: {
    durationSec: 47.9,
    audioDurationSec: 47.9,
    videoDurationSec: 47.9,
    integratedLufs: -14.2,
    truePeakDb: -1.3,
    loudnessRange: 7.2,
    words: 150,
    wordsPerMinute: 188,
    maxSentenceWords: 12,
    audioGaps: [0.08],
    stopWords: [],
    isAigc: true,
  },
  createdAt: '2026-11-05T16:00:00.000Z',
};

const notFound = new HttpErrorResponse({
  status: 404,
  error: {
    error: {
      code: 'NOT_FOUND',
      message: 'Job не найден',
      requestId: 'req-1',
    },
  },
});

const conflict = new HttpErrorResponse({
  status: 409,
  error: {
    error: {
      code: 'CONFLICT',
      message: 'Переход DRAFT → REVIEW невозможен для этого run',
      requestId: 'req-1',
    },
  },
});

function activeJob(stage: StageJobSnapshot['stage']): StageJobSnapshot {
  return {
    jobId: `${stage}-job`,
    stage,
    status: 'active',
    progress: 40,
  };
}

/** Lets fire-and-forget store commands settle in microtasks. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function setup(api: Partial<RunsApiService> = {}): RunDetailStoreService {
  TestBed.configureTestingModule({
    providers: [
      RunDetailStoreService,
      {
        provide: RunsApiService,
        useValue: {
          detail: vi.fn().mockReturnValue(of(draftDetail)),
          artifacts: vi.fn().mockReturnValue(of([])),
          qc: vi.fn().mockReturnValue(throwError(() => notFound)),
          stageJob: vi.fn().mockReturnValue(throwError(() => notFound)),
          ...api,
        },
      },
    ],
  });

  return TestBed.inject(RunDetailStoreService);
}

describe('RunDetailStoreService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads the run and its artifacts on the first relative id', () => {
    const artifacts = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        stage: 'voiceover' as const,
        type: 'voiceover_mp3',
        contentType: 'audio/mpeg',
        sizeBytes: 1024,
        createdAt: '2026-11-04T12:00:00.000Z',
        url: 'http://storage.test/voiceover.mp3',
      },
    ];
    const detail = vi.fn().mockReturnValue(of(draftDetail));
    const artifactsApi = vi.fn().mockReturnValue(of(artifacts));
    const store = setup({ detail, artifacts: artifactsApi });

    store.setRelativeId(run.id);

    expect(detail).toHaveBeenCalledWith(run.id);
    expect(artifactsApi).toHaveBeenCalledWith(run.id);
    expect(store.selected()).toEqual(draftDetail);
    expect(store.artifacts()).toEqual(artifacts);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('ignores the same relative id', () => {
    const detail = vi.fn().mockReturnValue(of(draftDetail));
    const store = setup({ detail });

    store.setRelativeId(run.id);
    store.setRelativeId(run.id);

    expect(detail).toHaveBeenCalledOnce();
  });

  it('clears scoped state when the relative id is reset', () => {
    const store = setup();

    store.setRelativeId(run.id);
    store.setRelativeId(null);

    expect(store.selected()).toBeNull();
    expect(store.artifacts()).toEqual([]);
    expect(store.stageJob()).toBeNull();
  });

  it('does not let a slow previous run overwrite the next one', () => {
    const other: RunDetail = {
      ...draftDetail,
      id: '33333333-3333-4333-8333-333333333333',
      topic: 'Другая тема',
    };
    const first = new Subject<RunDetail>();
    const detail = vi.fn((id: string) => (id === run.id ? first.asObservable() : of(other)));
    const store = setup({ detail });

    store.setRelativeId(run.id);
    expect(store.loading()).toBe(true);

    store.setRelativeId(other.id);
    expect(store.selected()?.id).toBe(other.id);

    first.next(draftDetail);
    first.complete();

    expect(store.selected()?.id).toBe(other.id);
  });

  it('normalizes a detail failure', () => {
    const store = setup({
      detail: vi.fn().mockReturnValue(throwError(() => conflict)),
    });

    store.setRelativeId(run.id);

    expect(store.error()).toBe('Переход DRAFT → REVIEW невозможен для этого run');
    expect(store.selected()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('rehydrates a running stage after the page is reopened', async () => {
    vi.useFakeTimers();

    const active = activeJob('script');
    const completed: StageJobSnapshot = {
      ...active,
      status: 'completed',
      progress: 100,
    };
    const detail = vi.fn().mockReturnValue(of(researchingDetail));
    const stageJob = vi.fn().mockReturnValueOnce(of(active)).mockReturnValueOnce(of(completed));
    const store = setup({ detail, stageJob });

    store.setRelativeId(run.id);

    expect(stageJob).toHaveBeenCalledWith(run.id, 'script');
    expect(store.stageJob()?.status).toBe('active');
    expect(store.watchingStage()).toBe('script');
    expect(store.stageRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1500);

    expect(store.stageJob()).toBeNull();
    expect(store.watchingStage()).toBeNull();
    expect(store.stageRunning()).toBe(false);
    expect(detail).toHaveBeenCalledTimes(2);
    expect(stageJob).toHaveBeenCalledTimes(2);
  });

  it('treats a missing stage job as no job, not as an error', () => {
    const stageJob = vi.fn().mockReturnValue(throwError(() => notFound));
    const detail = vi.fn().mockReturnValue(of(researchingDetail));
    const store = setup({ detail, stageJob });

    store.setRelativeId(run.id);

    expect(stageJob).toHaveBeenCalledWith(run.id, 'script');
    expect(store.stageJob()).toBeNull();
    expect(store.watchingStage()).toBeNull();
    expect(store.error()).toBeNull();
    expect(detail).toHaveBeenCalledOnce();
  });

  it('rehydrates render progress from the RENDERING state', () => {
    vi.useFakeTimers();

    const stageJob = vi.fn().mockReturnValue(of(activeJob('render')));
    const detail = vi.fn().mockReturnValue(of(renderingDetail));
    const store = setup({ detail, stageJob });

    store.setRelativeId(run.id);

    expect(stageJob).toHaveBeenCalledWith(run.id, 'render');
    expect(store.stageToRun()).toBeNull();
    expect(store.watchingStage()).toBe('render');
    expect(store.stageRunning()).toBe(true);
  });

  it('offers visuals from VOICE_READY and rehydrates its progress', () => {
    vi.useFakeTimers();

    const stageJob = vi.fn().mockReturnValue(of(activeJob('visuals')));
    const detail = vi.fn().mockReturnValue(of(voiceReadyDetail));
    const store = setup({ detail, stageJob });

    store.setRelativeId(run.id);

    expect(store.stageToRun()).toBe('visuals');
    expect(stageJob).toHaveBeenCalledWith(run.id, 'visuals');
    expect(store.watchingStage()).toBe('visuals');
    expect(store.stageRunning()).toBe(true);
  });

  it('keeps a stage failure visible after refreshing the run', async () => {
    vi.useFakeTimers();

    const active = activeJob('script');
    const failed: StageJobSnapshot = {
      ...active,
      status: 'failed',
      progress: 75,
      failedReason: 'FFmpeg упал',
    };
    const stageJob = vi.fn().mockReturnValueOnce(of(active)).mockReturnValueOnce(of(failed));
    const detail = vi.fn().mockReturnValue(of(researchingDetail));
    const store = setup({ detail, stageJob });

    store.setRelativeId(run.id);
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.error()).toBe('FFmpeg упал');
    expect(detail).toHaveBeenCalledTimes(2);
  });

  it('sends a transition and refreshes the run', async () => {
    const failedRun: Run = {
      ...run,
      state: 'FAILED',
      currentStage: 'research',
      failedStage: 'research',
      failureReason: 'Pixabay 429',
      resumeState: 'RESEARCHING',
    };
    let current: RunDetail = researchingDetail;
    const detail = vi.fn(() => of(current));
    const transition = vi.fn(() => {
      current = { ...failedRun, events: [] };
      return of(failedRun);
    });
    const store = setup({ detail, transition });

    store.setRelativeId(run.id);
    store.transition('FAILED', 'Pixabay 429');

    await vi.waitFor(() => expect(store.selected()?.state).toBe('FAILED'));

    expect(transition).toHaveBeenCalledWith(run.id, {
      to: 'FAILED',
      reason: 'Pixabay 429',
    });
    expect(store.allowed()).toEqual(['RESEARCHING']);
    expect(store.pending()).toBe(false);

    // The command refreshes the run after a manual transition.
    await vi.waitFor(() => expect(detail).toHaveBeenCalledTimes(2));
  });

  it('keeps the error from a rejected transition', async () => {
    const store = setup({
      detail: vi.fn().mockReturnValue(of(draftDetail)),
      transition: vi.fn().mockReturnValue(throwError(() => conflict)),
    });

    store.setRelativeId(run.id);
    store.transition('REVIEW');

    await vi.waitFor(() =>
      expect(store.error()).toBe('Переход DRAFT → REVIEW невозможен для этого run'),
    );

    expect(store.selected()?.state).toBe('DRAFT');
    expect(store.pending()).toBe(false);
  });

  it('starts a stage and shows it as queued before the first poll', async () => {
    const poll = new Subject<StageJobSnapshot>();
    const stageJob = vi
      .fn()
      .mockReturnValueOnce(throwError(() => notFound))
      .mockReturnValueOnce(poll.asObservable());
    const startStage = vi.fn().mockReturnValue(
      of({
        jobId: `script-${run.id}`,
        stage: 'script' as const,
        status: 'queued' as const,
      }),
    );
    const store = setup({
      detail: vi.fn().mockReturnValue(of(researchingDetail)),
      stageJob,
      startStage,
    });

    store.setRelativeId(run.id);
    store.runStage('script');

    await vi.waitFor(() => expect(store.stageJob()?.status).toBe('queued'));

    expect(startStage).toHaveBeenCalledWith(run.id, 'script');
    expect(stageJob).toHaveBeenCalledWith(run.id, 'script');
    expect(store.pending()).toBe(false);

    poll.next(activeJob('script'));
    expect(store.stageJob()?.status).toBe('active');

    poll.complete();
  });

  it('does not start a stage while one is already observed', async () => {
    const startStage = vi.fn();
    const store = setup({
      detail: vi.fn().mockReturnValue(of(researchingDetail)),
      stageJob: vi.fn().mockReturnValue(of(activeJob('script'))),
      startStage,
    });

    store.setRelativeId(run.id);
    store.runStage('script');
    await flush();

    expect(startStage).not.toHaveBeenCalled();
  });

  it('regenerates visuals and then chains render automatically', async () => {
    vi.useFakeTimers();

    const transition = vi.fn((_id: string, request: TransitionRunRequest) =>
      of({ ...run, state: request.to } as Run),
    );
    const startStage = vi.fn((_id: string, stage: StageQueueName) =>
      of({
        jobId: `${stage}-job`,
        stage,
        status: 'queued' as const,
      }),
    );
    const visualsActive = activeJob('visuals');
    const visualsDone: StageJobSnapshot = {
      ...visualsActive,
      status: 'completed',
      progress: 100,
    };
    const renderActive = activeJob('render');
    const renderDone: StageJobSnapshot = {
      ...renderActive,
      status: 'completed',
      progress: 100,
    };
    const stageJob = vi
      .fn()
      .mockReturnValueOnce(throwError(() => notFound))
      .mockReturnValueOnce(of(visualsActive))
      .mockReturnValueOnce(of(visualsDone))
      .mockReturnValueOnce(of(renderActive))
      .mockReturnValueOnce(of(renderDone));
    const store = setup({
      detail: vi.fn().mockReturnValue(of(reviewDetail)),
      transition,
      startStage,
      stageJob,
    });

    store.setRelativeId(run.id);
    await Promise.resolve();
    store.regenerate('visuals');
    await vi.advanceTimersByTimeAsync(0);

    expect(transition).toHaveBeenCalledWith(run.id, {
      to: 'VOICE_READY',
      reason: undefined,
    });
    expect(startStage).toHaveBeenNthCalledWith(1, run.id, 'visuals');

    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    expect(startStage).toHaveBeenNthCalledWith(2, run.id, 'render');

    await vi.advanceTimersByTimeAsync(1500);

    expect(store.stageJob()).toBeNull();
    expect(store.watchingStage()).toBeNull();
  });

  it('regenerates the script through RESEARCHING and stops at SCRIPT_READY', async () => {
    const transition = vi.fn((_id: string, request: TransitionRunRequest) =>
      of({ ...run, state: request.to } as Run),
    );
    const startStage = vi.fn((_id: string, stage: StageQueueName) =>
      of({
        jobId: `${stage}-job`,
        stage,
        status: 'queued' as const,
      }),
    );
    const store = setup({
      detail: vi.fn().mockReturnValue(of(reviewDetail)),
      transition,
      startStage,
      stageJob: vi
        .fn()
        .mockReturnValueOnce(throwError(() => notFound))
        .mockReturnValue(of(activeJob('script'))),
    });

    store.setRelativeId(run.id);
    await Promise.resolve();
    store.regenerate('script');

    await vi.waitFor(() =>
      expect(startStage).toHaveBeenCalledWith(run.id, 'script'),
    );

    expect(transition.mock.calls.map(([, request]) => request.to)).toEqual([
      'SCRIPT_READY',
      'RESEARCHING',
    ]);
  });

  it('does not regenerate outside REVIEW', async () => {
    const transition = vi.fn();
    const startStage = vi.fn();
    const store = setup({
      detail: vi.fn().mockReturnValue(of(researchingDetail)),
      transition,
      startStage,
    });

    store.setRelativeId(run.id);

    store.regenerate('visuals');
    await flush();

    expect(transition).not.toHaveBeenCalled();
    expect(startStage).not.toHaveBeenCalled();
  });

  it('offers the qc stage at REVIEW until a report exists', () => {
    const stageJob = vi.fn().mockReturnValue(throwError(() => notFound));
    const store = setup({
      detail: vi.fn().mockReturnValue(of(reviewDetail)),
      qc: vi.fn().mockReturnValue(throwError(() => notFound)),
      stageJob,
    });

    store.setRelativeId(run.id);

    expect(store.qcReport()).toBeNull();
    expect(store.stageToRun()).toBe('qc');
    expect(stageJob).toHaveBeenCalledWith(run.id, 'qc');
  });

  it('hides the qc stage when the report is already there', () => {
    const stageJob = vi.fn();
    const store = setup({
      detail: vi.fn().mockReturnValue(of(reviewDetail)),
      qc: vi.fn().mockReturnValue(of(qcReport)),
      stageJob,
    });

    store.setRelativeId(run.id);

    expect(store.qcReport()).toEqual(qcReport);
    expect(store.stageToRun()).toBeNull();
    expect(stageJob).not.toHaveBeenCalled();
  });
});

