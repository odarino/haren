import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { generateTeamCode } from "../lib/team-code";

export function teamRoutes(db: Kysely<Database>) {
  return {
    "/api/teams": {
      POST: async (req: Request) => {
        const { name, userName } = await req.json();
        if (!name || !userName) {
          return Response.json({ error: "name and userName required" }, { status: 400 });
        }

        const code = generateTeamCode();

        const user = await db
          .insertInto("users")
          .values({ name: userName })
          .returningAll()
          .executeTakeFirstOrThrow();

        const team = await db
          .insertInto("teams")
          .values({ name, code, created_by: user.id })
          .returningAll()
          .executeTakeFirstOrThrow();

        await db
          .insertInto("team_members")
          .values({ team_id: team.id, user_id: user.id })
          .execute();

        return Response.json({ team, user }, { status: 201 });
      },
    },

    "/api/teams/join": {
      POST: async (req: Request) => {
        const { code, userName } = await req.json();
        if (!code || !userName) {
          return Response.json({ error: "code and userName required" }, { status: 400 });
        }

        const team = await db
          .selectFrom("teams")
          .selectAll()
          .where("code", "=", code)
          .executeTakeFirst();

        if (!team) {
          return Response.json({ error: "Invalid team code" }, { status: 404 });
        }

        const user = await db
          .insertInto("users")
          .values({ name: userName })
          .returningAll()
          .executeTakeFirstOrThrow();

        await db
          .insertInto("team_members")
          .values({ team_id: team.id, user_id: user.id })
          .execute();

        return Response.json({ team, user });
      },
    },

    "/api/teams/:id": {
      GET: async (req: Request) => {
        const id = (req as any).params.id;

        const team = await db
          .selectFrom("teams")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst();

        if (!team) {
          return Response.json({ error: "Team not found" }, { status: 404 });
        }

        const members = await db
          .selectFrom("team_members")
          .innerJoin("users", "users.id", "team_members.user_id")
          .select(["users.id", "users.name", "team_members.joined_at"])
          .where("team_members.team_id", "=", id)
          .execute();

        return Response.json({ team, members });
      },
    },

    "/api/teams/:id/regenerate-code": {
      POST: async (req: Request) => {
        const id = (req as any).params.id;
        const { userId } = await req.json();

        const team = await db
          .selectFrom("teams")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst();

        if (!team) {
          return Response.json({ error: "Team not found" }, { status: 404 });
        }
        if (team.created_by !== userId) {
          return Response.json({ error: "Only team creator can regenerate code" }, { status: 403 });
        }

        const newCode = generateTeamCode();
        await db.updateTable("teams").set({ code: newCode }).where("id", "=", id).execute();

        return Response.json({ code: newCode });
      },
    },

    "/api/teams/:id/members/:userId": {
      DELETE: async (req: Request) => {
        const teamId = (req as any).params.id;
        const targetUserId = (req as any).params.userId;

        await db
          .deleteFrom("team_members")
          .where("team_id", "=", teamId)
          .where("user_id", "=", targetUserId)
          .execute();

        return Response.json({ ok: true });
      },
    },
  };
}
