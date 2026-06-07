import { z } from "zod";

export const Theme = z.enum(["light", "dark"]);

export const Density = z.enum(["compact", "comfy"]);

export const AccentPalette = z.enum([
  "blue-yellow-green-purple",
  "indigo-amber-emerald-violet",
  "cyan-amber-lime-pink",
  "mono",
]);

export const PinnedItemSchema = z.object({
  view: z.string().min(1),
  target: z.string().min(1),
  label: z.string().min(1),
});

export const UpsertPreferenceSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  theme: Theme,
  accent: AccentPalette,
  density: Density,
  sidebar_collapsed: z.boolean(),
  pinned_items: z.array(PinnedItemSchema).default([]),
});

export type ThemeType = z.infer<typeof Theme>;
export type DensityType = z.infer<typeof Density>;
export type AccentPaletteType = z.infer<typeof AccentPalette>;
export type PinnedItem = z.infer<typeof PinnedItemSchema>;
export type UpsertPreference = z.infer<typeof UpsertPreferenceSchema>;
