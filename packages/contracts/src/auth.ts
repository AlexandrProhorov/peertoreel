import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'editor']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
  role: userRoleSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authSessionSchema = z.object({
  user: authUserSchema,
  expiresAt: z.iso.datetime(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const loginResponseSchema = authSessionSchema;
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = authSessionSchema;
export type MeResponse = z.infer<typeof meResponseSchema>;
