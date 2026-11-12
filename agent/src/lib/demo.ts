/**
 * Modo demonstração (MVP): a IA funciona sem login, sobre uma cópia dos dados da
 * turma enviada pelo navegador. Nada é lido nem gravado no Supabase; o resultado
 * volta para o navegador, que guarda no armazenamento local.
 *
 * Desligado por padrão (DEMO_MODE=true liga). Como a rota não exige login,
 * qualquer um que a alcance gasta a cota de IA: por isso há checagem de origem,
 * limite por IP e limites de tamanho. Não use em produção com dados reais.
 */
import { z } from "zod";
import { getConfig } from "./config";
import { InMemoryRepository } from "./data/memory-repository";
import type { ClassInfo } from "./data/repository";
import { AppError } from "./errors";
import { enforceRateLimit } from "./rate-limit";

export const DEMO_TEACHER_ID = "00000000-0000-4000-8000-000000000001";

const uuid = z.string().uuid();
const text = (max: number) => z.string().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((s) => s.slice(0, 10));

/** Cópia dos dados de UMA turma. Nomes de estudantes não fazem parte dela. */
export const SnapshotSchema = z.object({
  class: z.object({ id: uuid, name: text(120), grade: text(40).nullable().optional() }),
  students: z.array(z.object({ id: uuid, created_at: text(40).optional() })).max(80),
  assessments: z
    .array(
      z.object({
        id: uuid,
        title: text(200),
        subject: text(80),
        content: text(160),
        assessment_date: date,
        total_points: z.number().positive().max(10_000),
      }),
    )
    .max(150),
  results: z
    .array(z.object({ id: uuid, assessment_id: uuid, student_id: uuid, score: z.number().min(0).max(10_000) }))
    .max(5_000),
  activities: z
    .array(
      z.object({
        id: uuid,
        title: text(200),
        subject: text(80).nullable().optional(),
        content: text(160).nullable().optional(),
        activity_type: text(60).nullable().optional(),
        status: text(40),
        origin: z.enum(["teacher", "ai"]),
        complexity: text(40).nullable().optional(),
        created_at: text(40).optional(),
      }),
    )
    .max(100)
    .default([]),
  analyses: z
    .array(
      z.object({
        id: uuid,
        content: text(160).nullable().optional(),
        summary: text(2000),
        created_at: text(40),
      }),
    )
    .max(30)
    .default([]),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Barra a rota se o modo estiver desligado ou a origem não for o front-end configurado. */
export function requireDemo(req: Request, opts: { rateLimit?: boolean } = {}): void {
  const cfg = getConfig();
  if (!cfg.demoMode) {
    throw new AppError("FORBIDDEN", "O modo demonstração da IA está desligado. Entre com sua conta para usar a IA.");
  }
  const origin = req.headers.get("origin");
  if (!origin || !cfg.allowedOrigins.includes(origin)) {
    throw new AppError("FORBIDDEN", "Origem não autorizada para o modo demonstração.");
  }
  // Só as rotas que chamam a IA contam no limite.
  if (opts.rateLimit !== false) enforceRateLimit(`demo:${clientIp(req)}`, 10, 10 * 60_000);
}

/** Monta um repositório em memória com a cópia enviada; a turma "pertence" ao professor de demonstração. */
export function snapshotRepository(s: Snapshot): { repo: InMemoryRepository; classInfo: ClassInfo } {
  const repo = new InMemoryRepository();
  const classInfo: ClassInfo = { id: s.class.id, name: s.class.name, grade: s.class.grade ?? null, school_year: new Date().getFullYear() };
  repo.classes.push({ ...classInfo, teacher_id: DEMO_TEACHER_ID });

  const studentIds = new Set(s.students.map((x) => x.id));
  const assessmentIds = new Set(s.assessments.map((a) => a.id));
  repo.students = s.students.map((x, i) => ({
    id: x.id,
    class_id: s.class.id,
    created_at: x.created_at || new Date(Date.UTC(2000, 0, 1, 0, 0, i)).toISOString(),
  }));
  repo.assessments = s.assessments.map((a) => ({ ...a, class_id: s.class.id }));
  // Só resultados coerentes com a cópia: avaliação e estudante desta turma.
  repo.results = s.results.filter((r) => assessmentIds.has(r.assessment_id) && studentIds.has(r.student_id));

  const now = new Date().toISOString();
  repo.activities = s.activities.map((a) => ({
    id: a.id,
    title: a.title,
    description: null,
    class_id: s.class.id,
    subject: a.subject ?? null,
    content: a.content ?? null,
    objective: null,
    skill: null,
    activity_type: a.activity_type ?? null,
    application_date: null,
    deadline: null,
    instructions: null,
    questions: [],
    answer_key: [],
    status: a.status,
    origin: a.origin,
    teacher_guidance: null,
    justification: null,
    complexity: a.complexity ?? null,
    target_group: null,
    worked_examples: [],
    analysis_id: null,
    generation_metadata: {},
    approved_at: null,
    approved_by: null,
    created_at: a.created_at || now,
    updated_at: a.created_at || now,
  }));
  repo.analyses = s.analyses.map((a) => ({
    id: a.id,
    class_id: s.class.id,
    teacher_id: DEMO_TEACHER_ID,
    assessment_id: null,
    subject: null,
    content: a.content ?? null,
    summary: a.summary,
    analysis_data: {},
    created_at: a.created_at,
  }));
  return { repo, classInfo };
}
