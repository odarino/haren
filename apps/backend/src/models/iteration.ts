import { z } from "zod";

export const IterationState = z.enum(["planned", "active", "shipped"]);

export const CreateIterationSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  start_date: z.string().date(),
  end_date: z.string().date(),
  state: IterationState,
  scope: z.number().int().nonnegative(),
  velocity: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
});

export const UpdateIterationSchema = CreateIterationSchema.partial();

export type IterationStateType = z.infer<typeof IterationState>;
export type CreateIteration = z.infer<typeof CreateIterationSchema>;
export type UpdateIteration = z.infer<typeof UpdateIterationSchema>;
