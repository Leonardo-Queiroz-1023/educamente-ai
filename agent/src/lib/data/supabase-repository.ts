import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../errors";
import type {
  ActivityPatch,
  ActivityRow,
  ActivitySummary,
  AnalysisSummary,
  AssessmentFilters,
  AssessmentRow,
  ClassInfo,
  DataRepository,
  NewActivity,
  NewAnalysis,
  ResultRow,
  StudentRef,
} from "./repository";

/** Escapa curingas do ILIKE para que o texto do professor seja buscado literalmente. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function fail(action: string, error: { message: string; code?: string }): never {
  if (error.code === "42703" || error.code === "PGRST204") {
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      "O banco ainda não tem as colunas do agente. Aplique a migration supabase/migrations/202611120001_ai_agent.sql.",
    );
  }
  throw new AppError("DATA_ERROR", `Falha ao ${action} no Supabase. Tente novamente em instantes.`, {
    code: error.code ?? null,
  });
}

export class SupabaseRepository implements DataRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getOwnedClass(classId: string, teacherId: string): Promise<ClassInfo | null> {
    const { data, error } = await this.db
      .from("classes")
      .select("id, name, grade, school_year")
      .eq("id", classId)
      .eq("teacher_id", teacherId)
      .maybeSingle();
    if (error) fail("consultar a turma", error);
    return data;
  }

  async listStudents(classId: string): Promise<StudentRef[]> {
    // Só o identificador: nomes de estudantes não saem do navegador do professor.
    const { data, error } = await this.db
      .from("students")
      .select("id, created_at")
      .eq("class_id", classId)
      .order("created_at")
      .order("id");
    if (error) fail("consultar os estudantes", error);
    return data ?? [];
  }

  async listAssessments(classId: string, f: AssessmentFilters = {}): Promise<AssessmentRow[]> {
    let q = this.db
      .from("assessments")
      .select("id, title, subject, content, assessment_date, total_points")
      .eq("class_id", classId);
    if (f.assessmentId) q = q.eq("id", f.assessmentId);
    if (f.subject) q = q.ilike("subject", likeLiteral(f.subject));
    if (f.content) q = q.ilike("content", `%${likeLiteral(f.content)}%`);
    if (f.startDate) q = q.gte("assessment_date", f.startDate);
    if (f.endDate) q = q.lte("assessment_date", f.endDate);
    const { data, error } = await q.order("assessment_date").order("id");
    if (error) fail("consultar as avaliações", error);
    return (data ?? []).map((a) => ({ ...a, total_points: Number(a.total_points) }));
  }

  async listResults(assessmentIds: string[]): Promise<ResultRow[]> {
    if (!assessmentIds.length) return [];
    const { data, error } = await this.db
      .from("assessment_results")
      .select("id, assessment_id, student_id, score")
      .in("assessment_id", assessmentIds);
    if (error) fail("consultar os resultados", error);
    return (data ?? []).map((r) => ({ ...r, score: Number(r.score) }));
  }

  async listActivities(
    classId: string,
    f: { subject?: string; content?: string; origin?: string; limit?: number } = {},
  ): Promise<ActivitySummary[]> {
    let q = this.db
      .from("activities")
      .select("id, title, subject, content, activity_type, status, origin, complexity, created_at")
      .eq("class_id", classId);
    if (f.subject) q = q.ilike("subject", likeLiteral(f.subject));
    if (f.content) q = q.ilike("content", `%${likeLiteral(f.content)}%`);
    if (f.origin) q = q.eq("origin", f.origin);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(f.limit ?? 20);
    if (error) fail("consultar as atividades", error);
    return data ?? [];
  }

  async listAnalyses(classId: string, limit = 10): Promise<AnalysisSummary[]> {
    const { data, error } = await this.db
      .from("pedagogical_analyses")
      .select("id, assessment_id, subject, content, summary, analysis_data, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) fail("consultar as análises anteriores", error);
    return data ?? [];
  }

  async insertAnalysis(row: NewAnalysis): Promise<{ id: string; created_at: string }> {
    const { data, error } = await this.db.from("pedagogical_analyses").insert(row).select("id, created_at").single();
    if (error) fail("salvar a análise", error);
    return data;
  }

  async insertActivity(row: NewActivity): Promise<ActivityRow> {
    const { data, error } = await this.db.from("activities").insert(row).select("*").single();
    if (error) fail("salvar a atividade", error);
    return data as ActivityRow;
  }

  async getActivity(id: string): Promise<ActivityRow | null> {
    const { data, error } = await this.db.from("activities").select("*").eq("id", id).maybeSingle();
    if (error) fail("consultar a atividade", error);
    return (data as ActivityRow | null) ?? null;
  }

  async updateActivity(id: string, patch: ActivityPatch): Promise<ActivityRow> {
    const { data, error } = await this.db.from("activities").update(patch).eq("id", id).select("*").single();
    if (error) fail("atualizar a atividade", error);
    return data as ActivityRow;
  }
}
