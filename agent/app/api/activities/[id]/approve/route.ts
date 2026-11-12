import { z } from "zod";
import { approveActivity } from "../../../../../src/lib/activity-review";
import { authenticate } from "../../../../../src/lib/auth";
import { AppError } from "../../../../../src/lib/errors";
import { json, preflight, route } from "../../../../../src/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Aprovação pelo professor. Nunca é chamada pelo agente. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw new AppError("BAD_REQUEST", "Atividade inválida.");
  const auth = await authenticate(req);
  const activity = await approveActivity(auth, id);
  return json(req, { activity });
});

export const OPTIONS = (req: Request) => preflight(req);
