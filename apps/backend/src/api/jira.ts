import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../db/schema";

export function jiraRoutes(db: Kysely<Database>) {
  return {
    "/api/jira/config": {
      GET: async (req: Request) => {
        const url = new URL(req.url);
        const teamId = url.searchParams.get("teamId");
        if (!teamId) {
          return Response.json({ error: "teamId required" }, { status: 400 });
        }

        // Read from team metadata (stored as JSON in a simple key-value approach)
        // For now, we use a dedicated jira_configs table
        try {
          const config = await sql`
						SELECT * FROM jira_configs WHERE team_id = ${teamId}
					`.execute(db);

          if (config.rows.length === 0) {
            return Response.json({ config: null });
          }

          return Response.json({ config: config.rows[0] });
        } catch {
          return Response.json({ config: null });
        }
      },

      POST: async (req: Request) => {
        const { teamId, baseUrl, email, apiToken, projectKey } = await req.json();

        if (!teamId || !baseUrl || !email || !apiToken || !projectKey) {
          return Response.json({ error: "All fields required" }, { status: 400 });
        }

        await sql`
					CREATE TABLE IF NOT EXISTS jira_configs (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
						base_url TEXT NOT NULL,
						email TEXT NOT NULL,
						api_token TEXT NOT NULL,
						project_key TEXT NOT NULL,
						updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
					)
				`.execute(db);

        await sql`
					INSERT INTO jira_configs (team_id, base_url, email, api_token, project_key)
					VALUES (${teamId}, ${baseUrl}, ${email}, ${apiToken}, ${projectKey})
					ON CONFLICT (team_id)
					DO UPDATE SET
						base_url = ${baseUrl},
						email = ${email},
						api_token = ${apiToken},
						project_key = ${projectKey},
						updated_at = now()
				`.execute(db);

        return Response.json({ ok: true });
      },
    },
  };
}
