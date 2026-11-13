import { createProvider } from "../../../../src/lib/ai";
import { requireDemo } from "../../../../src/lib/demo";
import { GradeRequestSchema, gradeOpenAnswers } from "../../../../src/lib/grading";
import { json, preflight, readJson, route } from "../../../../src/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Modo demonstração (portal da escola): corrige questões dissertativas com a IA.
 * Sem login; protegida por DEMO_MODE, origem autorizada e limite por IP (requireDemo).
 * Nada é gravado: o navegador guarda o resultado.
 */
export const POST = route(async (req: Request) => {
  requireDemo(req);
  const body = await readJson(req, GradeRequestSchema);
  const result = await gradeOpenAnswers(createProvider(), body);
  return json(req, { ...result, demo: true });
});

export const OPTIONS = (req: Request) => preflight(req);
