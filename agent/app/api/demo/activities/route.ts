import { z } from "zod";
import { createProvider } from "../../../../src/lib/ai";
import { runGeneration } from "../../../../src/lib/agent/tasks";
import { ACTIVITY_TYPES, COMPLEXITIES, TARGET_GROUPS } from "../../../../src/lib/domain/activity";
import { DEMO_TEACHER_ID, SnapshotSchema, requireDemo, snapshotRepository } from "../../../../src/lib/demo";
import { preflight, readJson, respond, route } from "../../../../src/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  snapshot: SnapshotSchema,
  subject: z.string().trim().max(80).optional(),
  content: z.string().trim().min(1).max(160),
  skill: z.string().trim().max(300).optional(),
  objective: z.string().trim().max(600).optional(),
  target_group: z.enum(TARGET_GROUPS),
  student_ids: z.array(z.string().uuid()).max(60).default([]),
  complexity: z.enum(COMPLEXITIES),
  question_count: z.number().int().min(1).max(15),
  activity_type: z.enum(ACTIVITY_TYPES),
  teacher_notes: z.string().trim().max(1000).optional(),
  analysis_id: z.string().uuid().optional(),
  regenerate_of: z.string().uuid().optional(),
});

/** Geração sem login (modo demonstração). A atividade volta para o navegador como rascunho. */
export const POST = route(async (req: Request) => {
  requireDemo(req);
  const body = await readJson(req, Body);
  const { repo, classInfo } = snapshotRepository(body.snapshot);
  return respond(req, 201, async (emit) => ({ ...(await runGeneration(
    // A análise de referência vive só no navegador: não é ligada por chave estrangeira aqui.
    { repo, teacherId: DEMO_TEACHER_ID, classInfo, provider: createProvider, emit },
    {
      kind: "generation",
      classId: classInfo.id,
      subject: body.subject || undefined,
      content: body.content,
      skill: body.skill || undefined,
      objective: body.objective || undefined,
      targetGroup: body.target_group,
      studentIds: body.target_group === "estudantes_selecionados" ? body.student_ids : [],
      complexity: body.complexity,
      questionCount: body.question_count,
      activityType: body.activity_type,
      teacherNotes: body.teacher_notes || undefined,
      analysisId: body.analysis_id,
      regenerateOf: body.regenerate_of,
    },
  )), demo: true }));
});

export const OPTIONS = (req: Request) => preflight(req);
