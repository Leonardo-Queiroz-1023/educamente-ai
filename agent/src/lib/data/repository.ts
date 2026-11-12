/**
 * Acesso aos dados da EducaMente AI. A implementação real (supabase-repository.ts)
 * roda com o token do professor, então o RLS do banco limita tudo às turmas dele.
 * Os testes usam uma implementação em memória com a mesma interface.
 */

export interface ClassInfo {
  id: string;
  name: string;
  grade: string | null;
  school_year: number;
}

export interface StudentRef {
  id: string;
  created_at: string;
}

export interface AssessmentRow {
  id: string;
  title: string;
  subject: string;
  content: string;
  assessment_date: string;
  total_points: number;
}

export interface ResultRow {
  id: string;
  assessment_id: string;
  student_id: string;
  score: number;
}

export interface AssessmentFilters {
  assessmentId?: string;
  subject?: string;
  content?: string;
  startDate?: string;
  endDate?: string;
}

export interface ActivitySummary {
  id: string;
  title: string;
  subject: string | null;
  content: string | null;
  activity_type: string | null;
  status: string;
  origin: string;
  complexity: string | null;
  created_at: string;
}

export interface AnalysisSummary {
  id: string;
  assessment_id: string | null;
  subject: string | null;
  content: string | null;
  summary: string;
  analysis_data: Record<string, unknown>;
  created_at: string;
}

export interface NewAnalysis {
  class_id: string;
  teacher_id: string;
  assessment_id: string | null;
  subject: string | null;
  content: string | null;
  summary: string;
  analysis_data: Record<string, unknown>;
}

/** Linha completa de activities, incluindo as colunas da migration do agente. */
export interface ActivityRow {
  id: string;
  title: string;
  description: string | null;
  class_id: string;
  subject: string | null;
  content: string | null;
  objective: string | null;
  skill: string | null;
  activity_type: string | null;
  application_date: string | null;
  deadline: string | null;
  instructions: string | null;
  questions: unknown;
  answer_key: unknown;
  status: string;
  origin: string;
  teacher_guidance: string | null;
  justification: string | null;
  complexity: string | null;
  target_group: string | null;
  worked_examples: unknown;
  analysis_id: string | null;
  generation_metadata: Record<string, unknown>;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NewActivity = Omit<
  ActivityRow,
  "id" | "created_at" | "updated_at" | "application_date" | "deadline" | "approved_at" | "approved_by"
>;

export type ActivityPatch = Partial<
  Pick<
    ActivityRow,
    | "title"
    | "objective"
    | "skill"
    | "instructions"
    | "questions"
    | "answer_key"
    | "worked_examples"
    | "teacher_guidance"
    | "status"
    | "approved_at"
    | "approved_by"
    | "generation_metadata"
  >
>;

export interface DataRepository {
  getOwnedClass(classId: string, teacherId: string): Promise<ClassInfo | null>;
  listStudents(classId: string): Promise<StudentRef[]>;
  listAssessments(classId: string, filters?: AssessmentFilters): Promise<AssessmentRow[]>;
  listResults(assessmentIds: string[]): Promise<ResultRow[]>;
  listActivities(classId: string, filters?: { subject?: string; content?: string; origin?: string; limit?: number }): Promise<ActivitySummary[]>;
  listAnalyses(classId: string, limit?: number): Promise<AnalysisSummary[]>;
  insertAnalysis(row: NewAnalysis): Promise<{ id: string; created_at: string }>;
  insertActivity(row: NewActivity): Promise<ActivityRow>;
  getActivity(id: string): Promise<ActivityRow | null>;
  updateActivity(id: string, patch: ActivityPatch): Promise<ActivityRow>;
}
