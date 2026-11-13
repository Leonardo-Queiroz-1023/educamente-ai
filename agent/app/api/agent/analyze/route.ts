import { z } from "zod";
import { authenticate, requireOwnedClass } from "../../../../src/lib/auth";
import { createProvider } from "../../../../src/lib/ai";
import { runAnalysis } from "../../../../src/lib/agent/tasks";
import { preflight, readJson, respond, route } from "../../../../src/lib/http";
import { enforceRateLimit } from "../../../../src/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  class_id: z.string().uuid(),
  assessment_id: z.string().uuid().optional(),
  subject: z.string().trim().max(80).optional(),
  content: z.string().trim().max(160).optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
});

/** Análise de aprendizagem com IA. */
export const POST = route(async (req: Request) => {
  const body = await readJson(req, Body);
  const auth = await authenticate(req);
  const classInfo = await requireOwnedClass(auth, body.class_id);
  enforceRateLimit(auth.userId);
  return respond(req, 200, (emit) =>
    runAnalysis(
      { repo: auth.repo, teacherId: auth.teacherId, classInfo, provider: createProvider, emit },
      {
        kind: "analysis",
        classId: body.class_id,
        assessmentId: body.assessment_id,
        subject: body.subject || undefined,
        content: body.content || undefined,
        startDate: body.start_date,
        endDate: body.end_date,
      },
    ),
  );
});

export const OPTIONS = (req: Request) => preflight(req);
