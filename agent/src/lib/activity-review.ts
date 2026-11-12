/**
 * Revisão humana das atividades geradas: edição e aprovação pelo professor.
 * A IA nunca chega aqui; só o professor, com a própria sessão.
 */
import { z } from "zod";
import type { AuthContext } from "./auth";
import { requireOwnedClass } from "./auth";
import type { ActivityRow } from "./data/repository";
import { AnswerSchema, COMPLEXITIES, QuestionSchema, WorkedExampleSchema, validateActivityStructure, type Complexity } from "./domain/activity";
import { AppError } from "./errors";

export const ActivityEditSchema = z.object({
  title: z.string().max(200),
  objective: z.string().max(800),
  skill: z.string().max(300).optional(),
  instructions: z.string().max(4000),
  teacher_guidance: z.string().max(4000),
  worked_examples: z.array(WorkedExampleSchema.extend({ problem: z.string().max(2000), solution: z.string().max(4000) })).max(5),
  questions: z.array(QuestionSchema.extend({ statement: z.string().max(3000), options: z.array(z.string().max(500)).max(6) })).min(1).max(20),
  answer_key: z.array(AnswerSchema.extend({ answer: z.string().max(2000), explanation: z.string().max(3000) })).max(20),
});
export type ActivityEdit = z.infer<typeof ActivityEditSchema>;

async function loadOwnedAiActivity(auth: AuthContext, id: string): Promise<ActivityRow> {
  const row = await auth.repo.getActivity(id);
  if (!row) throw new AppError("NOT_FOUND", "Atividade não encontrada.");
  await requireOwnedClass(auth, row.class_id);
  if (row.origin !== "ai") throw new AppError("BAD_REQUEST", "Esta revisão é para atividades geradas com IA.");
  return row;
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const complexityOf = (row: ActivityRow): Complexity =>
  (COMPLEXITIES as readonly string[]).includes(row.complexity ?? "") ? (row.complexity as Complexity) : "consolidacao";

function structuralIssues(row: ActivityRow, edit?: ActivityEdit) {
  const src = edit ?? {
    title: row.title,
    objective: row.objective ?? "",
    instructions: row.instructions ?? "",
    teacher_guidance: row.teacher_guidance ?? "",
    worked_examples: asArray<ActivityEdit["worked_examples"][number]>(row.worked_examples),
    questions: asArray<ActivityEdit["questions"][number]>(row.questions),
    answer_key: asArray<ActivityEdit["answer_key"][number]>(row.answer_key),
  };
  return validateActivityStructure(
    { ...src, content: row.content ?? "", complexity: complexityOf(row), personalization_rationale: row.justification },
    { complexity: complexityOf(row), content: row.content ?? "" },
  );
}

/** Edição do professor. Volta a ser rascunho: precisa de nova aprovação. */
export async function editActivity(auth: AuthContext, id: string, edit: ActivityEdit): Promise<ActivityRow> {
  const row = await loadOwnedAiActivity(auth, id);
  const issues = structuralIssues(row, edit);
  if (issues.length) {
    throw new AppError("VALIDATION_FAILED", "A atividade editada tem problemas. Corrija e salve de novo.", { issues });
  }
  return auth.repo.updateActivity(id, {
    title: edit.title.trim(),
    objective: edit.objective.trim(),
    skill: edit.skill?.trim() || row.skill,
    instructions: edit.instructions.trim(),
    teacher_guidance: edit.teacher_guidance.trim(),
    worked_examples: edit.worked_examples,
    questions: edit.questions,
    answer_key: edit.answer_key,
    status: "draft",
    approved_at: null,
    approved_by: null,
    generation_metadata: {
      ...row.generation_metadata,
      edited_by_teacher_at: new Date().toISOString(),
    },
  });
}

/** Aprovação: só com a estrutura válida. Passa a "Planejada" no fluxo da plataforma. */
export async function approveActivity(auth: AuthContext, id: string): Promise<ActivityRow> {
  const row = await loadOwnedAiActivity(auth, id);
  const issues = structuralIssues(row);
  if (issues.length) {
    throw new AppError("VALIDATION_FAILED", "A atividade ainda tem problemas e não pode ser aprovada. Edite e corrija antes.", { issues });
  }
  return auth.repo.updateActivity(id, {
    status: "Planejada",
    approved_at: new Date().toISOString(),
    approved_by: auth.teacherId,
  });
}
