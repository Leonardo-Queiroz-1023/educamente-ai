import { z } from "zod";
import { ActivityEditSchema, editActivity } from "../../../../src/lib/activity-review";
import { authenticate } from "../../../../src/lib/auth";
import { AppError } from "../../../../src/lib/errors";
import { json, preflight, readJson, route } from "../../../../src/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edição de uma atividade gerada com IA, feita pelo professor. */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw new AppError("BAD_REQUEST", "Atividade inválida.");
  const body = await readJson(req, ActivityEditSchema);
  const auth = await authenticate(req);
  const activity = await editActivity(auth, id, body);
  return json(req, { activity });
});

export const OPTIONS = (req: Request) => preflight(req);
