import { z } from "zod";
import { ActivityEditSchema } from "../../../../../src/lib/activity-review";
import { COMPLEXITIES, validateActivityStructure } from "../../../../../src/lib/domain/activity";
import { requireDemo } from "../../../../../src/lib/demo";
import { json, preflight, readJson, route } from "../../../../../src/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  activity: ActivityEditSchema.extend({
    content: z.string().max(160),
    complexity: z.enum(COMPLEXITIES),
    justification: z.string().max(4000).optional(),
  }),
});

/**
 * Modo demonstração: confere a estrutura de uma atividade editada ou a ser aprovada
 * (as mesmas regras do fluxo com login). Não chama a IA e não grava nada.
 */
export const POST = route(async (req: Request) => {
  requireDemo(req, { rateLimit: false });
  const { activity: a } = await readJson(req, Body);
  const issues = validateActivityStructure(
    { ...a, personalization_rationale: a.justification ?? null },
    { complexity: a.complexity, content: a.content },
  );
  return json(req, { valid: issues.length === 0, issues });
});

export const OPTIONS = (req: Request) => preflight(req);
