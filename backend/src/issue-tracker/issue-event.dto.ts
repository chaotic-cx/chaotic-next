import { z } from 'zod';

export const githubIssueEventSchema = z.object({
  action: z.string(),
  label: z
    .object({
      name: z.string(),
    })
    .optional(),
  comment: z
    .object({
      user: z.object({ login: z.string() }).optional(),
    })
    .optional(),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    labels: z.array(z.object({ name: z.string() })),
    user: z
      .object({
        login: z.string(),
      })
      .optional(),
  }),
});

export type GithubIssueEventDto = z.infer<typeof githubIssueEventSchema>;
