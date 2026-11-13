import { z } from "zod";
import { createProvider } from "../../../../src/lib/ai";
import { runAnalysis } from "../../../../src/lib/agent/tasks";
import { DEMO_TEACHER_ID, SnapshotSchema, requireDemo, snapshotRepository } from "../../../../src/lib/demo";
import { preflight, readJson, respond, route } from "../../../../src/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  snapshot: SnapshotSchema,
  assessment_id: z.string().uuid().optional(),
  subject: z.string().trim().max(80).optional(),
  content: z.string().trim().max(160).optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
});

/** Análise sem login (modo demonstração), sobre os dados enviados pelo navegador. */
export const POST = route(async (req: Request) => {
  requireDemo(req);
  const body = await readJson(req, Body);
  const { repo, classInfo } = snapshotRepository(body.snapshot);
  return respond(req, 200, async (emit) => {
    const outcome = await runAnalysis(
      { repo, teacherId: DEMO_TEACHER_ID, classInfo, provider: createProvider, emit },
      {
        kind: "analysis",
        classId: classInfo.id,
        assessmentId: body.assessment_id,
        subject: body.subject || undefined,
        content: body.content || undefined,
        startDate: body.start_date,
        endDate: body.end_date,
      },
    );
    return { ...outcome, demo: true };
  });
});

export const OPTIONS = (req: Request) => preflight(req);
