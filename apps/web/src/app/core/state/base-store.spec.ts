import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BaseStore } from './base-store';

@Injectable()
class TestStore extends BaseStore {
  readonly relativeIds: Array<string | null> = [];

  runQuery<T>(source: Observable<T>): Observable<T> {
    return this.query(source);
  }

  runCommand<T>(key: string, factory: () => Observable<T>): Promise<T | null> {
    return this.command(key, factory);
  }

  runMutation<T>(
    key: string,
    factory: () => Observable<T>,
    onSuccess?: (value: T | null) => void,
  ): void {
    this.run(key, factory, onSuccess);
  }

  fail(message: string): void {
    this.setError(message);
  }

  protected override onRelativeIdChanged(id: string | null): void {
    this.relativeIds.push(id);
  }
}

function setup(): TestStore {
  TestBed.configureTestingModule({ providers: [TestStore] });

  return TestBed.inject(TestStore);
}

describe('BaseStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps loading true while any query is in flight', () => {
    const store = setup();
    const first = new Subject<number>();
    const second = new Subject<number>();
    let firstValue: number | undefined;
    let secondValue: number | undefined;

    store.runQuery(first).subscribe((value) => (firstValue = value));
    store.runQuery(second).subscribe((value) => (secondValue = value));

    expect(store.loading()).toBe(true);

    first.next(1);
    first.complete();

    expect(firstValue).toBe(1);
    expect(store.loading()).toBe(true);

    second.next(2);
    second.complete();

    expect(secondValue).toBe(2);
    expect(store.loading()).toBe(false);
  });

  it('normalizes a query failure and finishes loading', () => {
    const store = setup();
    const conflict = new HttpErrorResponse({
      status: 409,
      error: {
        error: {
          code: 'CONFLICT',
          message: 'Переход невозможен',
          requestId: 'req-1',
        },
      },
    });

    store.runQuery(throwError(() => conflict)).subscribe();

    expect(store.error()).toBe('Переход невозможен');
    expect(store.loading()).toBe(false);
  });

  it('runs a command once per in-flight key', async () => {
    const store = setup();
    const subject = new Subject<string>();
    const factory = vi.fn(() => subject.asObservable());

    const first = store.runCommand('save', factory);
    const second = store.runCommand('save', factory);

    await expect(second).resolves.toBeNull();
    expect(factory).toHaveBeenCalledOnce();
    expect(store.pending()).toBe(true);

    subject.next('saved');
    subject.complete();

    await expect(first).resolves.toBe('saved');
    expect(store.pending()).toBe(false);
  });

  it('tracks pending for independent commands separately', async () => {
    const store = setup();
    const first = new Subject<number>();
    const second = new Subject<number>();

    const firstResult = store.runCommand('first', () => first.asObservable());
    const secondResult = store.runCommand('second', () => second.asObservable());

    expect(store.pending()).toBe(true);

    first.next(1);
    first.complete();
    await firstResult;

    expect(store.pending()).toBe(true);

    second.next(2);
    second.complete();
    await secondResult;

    expect(store.pending()).toBe(false);
  });

  it('normalizes a command failure and returns null', async () => {
    const store = setup();

    const result = await store.runCommand('save', () => throwError(() => new Error('queue down')));

    expect(result).toBeNull();
    expect(store.error()).toBe('queue down');
    expect(store.pending()).toBe(false);
  });

  it('resolves a pending command with null when the store is destroyed', async () => {
    const store = setup();
    const subject = new Subject<string>();

    const result = store.runCommand('save', () => subject.asObservable());

    TestBed.resetTestingModule();

    await expect(result).resolves.toBeNull();
    expect(store.error()).toBeNull();
  });

  it('runs a mutation and reports the value once', async () => {
    const store = setup();
    const subject = new Subject<string>();
    const onSuccess = vi.fn();
    let pendingInside = true;

    store.runMutation('save', () => subject.asObservable(), (value) => {
      pendingInside = store.pending();
      onSuccess(value);
    });

    expect(store.pending()).toBe(true);

    subject.next('saved');
    subject.complete();

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('saved'));

    expect(pendingInside).toBe(false);
    expect(store.pending()).toBe(false);
  });

  it('skips onSuccess on failure and keeps the message in error()', async () => {
    const store = setup();
    const onSuccess = vi.fn();

    store.runMutation(
      'save',
      () => throwError(() => new Error('queue down')),
      onSuccess,
    );

    await vi.waitFor(() => expect(store.error()).toBe('queue down'));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(store.pending()).toBe(false);
  });

  it('does not notify the second caller of a duplicate mutation', async () => {
    const store = setup();
    const subject = new Subject<string>();
    const factory = vi.fn(() => subject.asObservable());
    const first = vi.fn();
    const second = vi.fn();

    store.runMutation('save', factory, first);
    store.runMutation('save', factory, second);

    expect(factory).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    subject.next('saved');
    subject.complete();

    await vi.waitFor(() => expect(first).toHaveBeenCalledWith('saved'));
    expect(second).not.toHaveBeenCalled();
  });

  it('does not treat a destroyed store as a successful mutation', async () => {
    const store = setup();
    const subject = new Subject<string>();
    const onSuccess = vi.fn();

    store.runMutation('save', () => subject.asObservable(), onSuccess);

    TestBed.resetTestingModule();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(store.error()).toBeNull();
  });

  it('applies relative id once per value and resets the error', () => {
    const store = setup();

    store.fail('stale error');

    store.setRelativeId('run-1');
    store.setRelativeId('run-1');
    store.setRelativeId(null);

    expect(store.relativeIds).toEqual(['run-1', null]);
    expect(store.relativeId()).toBeNull();
    expect(store.error()).toBeNull();
  });
});
