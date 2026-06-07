import type { Generated, Insertable, Selectable, Updateable } from "kysely";

export interface Database {
  teams: TeamTable;
  users: UserTable;
  team_members: TeamMemberTable;
  projects: ProjectTable;
  modules: ModuleTable;
  iterations: IterationTable;
  tasks: TaskTable;
  artifacts: ArtifactTable;
  activity_events: ActivityEventTable;
  user_preferences: UserPreferenceTable;
  velocity_snapshots: VelocitySnapshotTable;
}

export interface TeamTable {
  id: Generated<string>;
  name: string;
  code: string;
  created_by: string;
  created_at: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  name: string;
  created_at: Generated<Date>;
}

export interface TeamMemberTable {
  id: Generated<string>;
  team_id: string;
  user_id: string;
  joined_at: Generated<Date>;
}

export interface ProjectTable {
  id: Generated<string>;
  team_id: string;
  git_remote_url: string;
  name: string;
  registered_at: Generated<Date>;
}

export type Team = Selectable<TeamTable>;
export type NewTeam = Insertable<TeamTable>;
export type TeamUpdate = Updateable<TeamTable>;

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;

export type TeamMember = Selectable<TeamMemberTable>;
export type NewTeamMember = Insertable<TeamMemberTable>;

export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;

export interface ModuleTable {
  id: Generated<string>;
  project_id: string;
  code: string;
  name: string;
  owner_user_id: string | null;
  status: string;
  eta: Date | null;
  tags: string[];
  created_at: Generated<Date>;
}

export type Module = Selectable<ModuleTable>;
export type NewModule = Insertable<ModuleTable>;
export type ModuleUpdate = Updateable<ModuleTable>;

export interface IterationTable {
  id: Generated<string>;
  project_id: string;
  code: string;
  label: string;
  start_date: Date;
  end_date: Date;
  state: string;
  scope: number;
  velocity: number;
  notes: string | null;
  created_at: Generated<Date>;
}

export type Iteration = Selectable<IterationTable>;
export type NewIteration = Insertable<IterationTable>;
export type IterationUpdate = Updateable<IterationTable>;

export interface TaskTable {
  id: Generated<string>;
  project_id: string;
  iteration_id: string | null;
  module_id: string | null;
  code: string;
  title: string;
  assignee_user_id: string | null;
  status: string;
  priority: string;
  points: number;
  opened_at: Date;
  created_at: Generated<Date>;
}

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type TaskUpdate = Updateable<TaskTable>;

export interface ArtifactTable {
  id: Generated<string>;
  project_id: string;
  path: string;
  kind: string;
  body: string;
  updated_by_user_id: string | null;
  size_bytes: number;
  updated_at: Date;
  created_at: Generated<Date>;
}

export type Artifact = Selectable<ArtifactTable>;
export type NewArtifact = Insertable<ArtifactTable>;
export type ArtifactUpdate = Updateable<ArtifactTable>;

export interface ActivityEventTable {
  id: Generated<string>;
  project_id: string;
  actor_user_id: string | null;
  actor_type: string;
  kind: string;
  ref: string;
  message: string;
  created_at: Generated<Date>;
}

export type ActivityEvent = Selectable<ActivityEventTable>;
export type NewActivityEvent = Insertable<ActivityEventTable>;

export interface UserPreferenceTable {
  id: Generated<string>;
  user_id: string;
  project_id: string | null;
  theme: string;
  accent: string;
  density: string;
  sidebar_collapsed: boolean;
  pinned_items: unknown;
  created_at: Generated<Date>;
  updated_at: Date;
}

export type UserPreference = Selectable<UserPreferenceTable>;
export type NewUserPreference = Insertable<UserPreferenceTable>;
export type UserPreferenceUpdate = Updateable<UserPreferenceTable>;

export interface VelocitySnapshotTable {
  id: Generated<string>;
  iteration_id: string;
  snapshot_date: Date;
  points_done: number;
  scope: number;
  created_at: Generated<Date>;
}

export type VelocitySnapshot = Selectable<VelocitySnapshotTable>;
export type NewVelocitySnapshot = Insertable<VelocitySnapshotTable>;
