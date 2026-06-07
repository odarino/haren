import { z } from "zod";

export const ActivityKind = z.enum([
  "commit",
  "comment",
  "merge",
  "review",
  "status",
  "agent",
]);

export const ActorType = z.enum(["user", "agent"]);

export const CreateActivitySchema = z.object({
  actor_user_id: z.string().uuid().nullable().optional(),
  actor_type: ActorType,
  kind: ActivityKind,
  ref: z.string().min(1),
  message: z.string().min(1),
});

export const ActivityFiltersSchema = z.object({
  kind: ActivityKind.optional(),
  actor: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type ActivityKindType = z.infer<typeof ActivityKind>;
export type ActorTypeType = z.infer<typeof ActorType>;
export type CreateActivity = z.infer<typeof CreateActivitySchema>;
export type ActivityFilters = z.infer<typeof ActivityFiltersSchema>;
