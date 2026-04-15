import { z } from 'zod';

// Schema for a User in the database, matching the provided schema
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

// You can add other table schemas here as needed
// For example, if you have a 'jobs' table:
/*
export const JobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  company_id: z.string().uuid(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Job = z.infer<typeof JobSchema>;
*/
