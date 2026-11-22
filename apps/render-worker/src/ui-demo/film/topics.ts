import { z } from 'zod';

/** The input file the director reads: a slug for the folder and a topic line. */
export const topicsSchema = z.array(
  z.object({ slug: z.string().min(1).max(40), topic: z.string().min(1).max(300) }),
);

export type TopicEntry = z.infer<typeof topicsSchema>[number];
