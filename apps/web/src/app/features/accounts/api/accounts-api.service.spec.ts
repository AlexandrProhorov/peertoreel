import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { TikTokAccount, TikTokCreatorInfo } from '@kadence/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AccountsApiService } from './accounts-api.service';

const now = '2026-11-07T10:00:00.000Z';

const account: TikTokAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  openId: 'open-1',
  displayName: 'Kadence',
  avatarUrl: null,
  scope: 'user.info.basic,video.publish',
  accessExpiresAt: now,
  refreshExpiresAt: now,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const creatorInfo: TikTokCreatorInfo = {
  username: 'kadence',
  nickname: 'Kadence',
  avatarUrl: null,
  privacyLevelOptions: ['SELF_ONLY'],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 300,
};

describe('AccountsApiService', () => {
  let api: AccountsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(AccountsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('lists connected accounts', () => {
    let result: TikTokAccount[] | undefined;

    api.list().subscribe((accounts) => {
      result = accounts;
    });

    const request = http.expectOne('http://api.test/api/v1/accounts/tiktok');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accounts: [account] });

    expect(result).toEqual([account]);
  });

  it('requests the authorization URL', () => {
    api.authorize().subscribe();

    const request = http.expectOne(
      'http://api.test/api/v1/accounts/tiktok/authorize',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ url: 'https://www.tiktok.com/v2/auth/authorize/?state=s' });
  });

  it('disconnects with DELETE', () => {
    api.disconnect(account.id).subscribe();

    const request = http.expectOne(
      `http://api.test/api/v1/accounts/tiktok/${account.id}`,
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null);
  });

  it('reads creator info', () => {
    let result: TikTokCreatorInfo | undefined;

    api.creatorInfo(account.id).subscribe((info) => {
      result = info;
    });

    const request = http.expectOne(
      `http://api.test/api/v1/accounts/tiktok/${account.id}/creator-info`,
    );
    expect(request.request.method).toBe('GET');
    request.flush(creatorInfo);

    expect(result?.privacyLevelOptions).toEqual(['SELF_ONLY']);
  });

  it('rejects a malformed account payload', () => {
    let failed = false;

    api.list().subscribe({ error: () => (failed = true) });

    http
      .expectOne('http://api.test/api/v1/accounts/tiktok')
      .flush({ accounts: [{ openId: 'open-1' }] });

    expect(failed).toBe(true);
  });
});
