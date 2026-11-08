import { Injectable } from '@angular/core';
import {
  tiktokAccountListResponseSchema,
  tiktokAuthorizeResponseSchema,
  tiktokCreatorInfoSchema,
  type TikTokAccount,
  type TikTokAuthorizeResponse,
  type TikTokCreatorInfo,
} from '@peertoreel/contracts';
import { map, type Observable } from 'rxjs';
import { BaseApiService } from '../../../core/api/base-api.service';

/** Transport for TikTok Login Kit accounts. Owns no state. */
@Injectable({ providedIn: 'root' })
export class AccountsApiService extends BaseApiService {
  list(): Observable<TikTokAccount[]> {
    return this.get('/accounts/tiktok', tiktokAccountListResponseSchema).pipe(
      map((response) => response.accounts),
    );
  }

  authorize(): Observable<TikTokAuthorizeResponse> {
    return this.get('/accounts/tiktok/authorize', tiktokAuthorizeResponseSchema);
  }

  disconnect(id: string): Observable<void> {
    return this.deleteVoid(`/accounts/tiktok/${id}`);
  }

  creatorInfo(id: string): Observable<TikTokCreatorInfo> {
    return this.get(
      `/accounts/tiktok/${id}/creator-info`,
      tiktokCreatorInfoSchema,
    );
  }
}
