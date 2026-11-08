import { z } from 'zod';
import { publishPrivacyLevelSchema } from './publish.js';

/** Scopes requested by the web Login Kit flow. */
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish'] as const;

export const tiktokAccountSchema = z.object({
  id: z.uuid(),
  openId: z.string().min(1),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  scope: z.string(),
  accessExpiresAt: z.iso.datetime(),
  refreshExpiresAt: z.iso.datetime(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TikTokAccount = z.infer<typeof tiktokAccountSchema>;

export const tiktokAccountListResponseSchema = z.object({
  accounts: z.array(tiktokAccountSchema),
});
export type TikTokAccountListResponse = z.infer<
  typeof tiktokAccountListResponseSchema
>;

export const tiktokAuthorizeResponseSchema = z.object({
  /** TikTok authorization page to open in the browser. */
  url: z.url(),
});
export type TikTokAuthorizeResponse = z.infer<
  typeof tiktokAuthorizeResponseSchema
>;

export const tiktokCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().optional(),
});
export type TikTokCallbackQuery = z.infer<typeof tiktokCallbackQuerySchema>;

export const tiktokCreatorInfoSchema = z.object({
  username: z.string(),
  nickname: z.string(),
  avatarUrl: z.url().nullable(),
  privacyLevelOptions: z.array(publishPrivacyLevelSchema).min(1),
  commentDisabled: z.boolean(),
  duetDisabled: z.boolean(),
  stitchDisabled: z.boolean(),
  maxVideoPostDurationSec: z.number().int().positive(),
});
export type TikTokCreatorInfo = z.infer<typeof tiktokCreatorInfoSchema>;
