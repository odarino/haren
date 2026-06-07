import { z } from "zod";

export const TaskStatus = z.enum(["todo", "doing", "review", "blocked", "done"]);

export const TaskPriority = z.enum(["p1", "p2", "p3"]);

export const CreateTaskSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  iteration_id: z.string().uuid().nullable().optional(),
  module_id: z.string().uuid().nullable().optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  status: TaskStatus,
  priority: TaskPriority,
  points: z.number().int().nonnegative(),
  opened_at: z.string().date().optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial();

export const TaskFiltersSchema = z.object({
  module: z.string().uuid().optional(),
  iteration: z.string().uuid().optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type TaskStatusType = z.infer<typeof TaskStatus>;
export type TaskPriorityType = z.infer<typeof TaskPriority>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type TaskFilters = z.infer<typeof TaskFiltersSchema>;
