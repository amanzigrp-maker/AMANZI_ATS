import { z } from 'zod';

export const UserSchema = z.object({
  userid: z.number().int(),
  email: z.string().email(),
  passwordhash: z.string(),
  role: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'blocked', 'disabled']).nullable(),
  avatar_url: z.string().optional().nullable(),
  lastlogin: z.date().optional().nullable(),
  createdat: z.date(),
  updatedat: z.date(),
  deleted_at: z.date().optional().nullable(),
  deleted_by: z.number().int().optional().nullable(),
  created_by: z.number().int().optional().nullable(),
});

export type User = z.infer<typeof UserSchema>;
