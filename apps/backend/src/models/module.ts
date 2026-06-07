import { z } from "zod";

export const ModuleStatus = z.enum(["on-track", "at-risk", "blocked"]);

export const CreateModuleSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  owner_user_id: z.string().uuid().nullable().optional(),
  status: ModuleStatus,
  eta: z.string().date().nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export const UpdateModuleSchema = CreateModuleSchema.partial();

export type ModuleStatusType = z.infer<typeof ModuleStatus>;
export type CreateModule = z.infer<typeof CreateModuleSchema>;
export type UpdateModule = z.infer<typeof UpdateModuleSchema>;
