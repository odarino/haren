import { z } from "zod";

export const ArtifactKind = z.enum(["spec", "rfc", "note", "runbook", "report"]);

export const CreateArtifactSchema = z.object({
  path: z.string().min(1),
  kind: ArtifactKind,
  body: z.string(),
  updated_by_user_id: z.string().uuid().nullable().optional(),
});

export const UpdateArtifactSchema = CreateArtifactSchema.partial();

export type ArtifactKindType = z.infer<typeof ArtifactKind>;
export type CreateArtifact = z.infer<typeof CreateArtifactSchema>;
export type UpdateArtifact = z.infer<typeof UpdateArtifactSchema>;
