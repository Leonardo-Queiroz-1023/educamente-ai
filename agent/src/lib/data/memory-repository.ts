/**
 * Repositório em memória. Usado no modo demonstração (dados enviados pelo navegador,
 * nada é gravado em banco) e nos testes.
 */
import { randomUUID } from "node:crypto";
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

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export class InMemoryRepository implements DataRepository {
  classes: (ClassInfo & { teacher_id: string })[] = [];
  students: (StudentRef & { class_id: string })[] = [];
  assessments: (AssessmentRow & { class_id: string })[] = [];
  results: ResultRow[] = [];
  activities: ActivityRow[] = [];
  analyses: (AnalysisSummary & { class_id: string; teacher_id: string })[] = [];

  async getOwnedClass(classId: string, teacherId: string) {
    const c = this.classes.find((x) => x.id === classId && x.teacher_id === teacherId);
    return c ? { id: c.id, name: c.name, grade: c.grade, school_year: c.school_year } : null;
  }
  async listStudents(classId: string) {
    return this.students.filter((s) => s.class_id === classId).map(({ id, created_at }) => ({ id, created_at }));
  }
  async listAssessments(classId: string, f: AssessmentFilters = {}) {
    return this.assessments
      .filter((a) => a.class_id === classId)
      .filter((a) => !f.assessmentId || a.id === f.assessmentId)
      .filter((a) => !f.subject || norm(a.subject) === norm(f.subject))
      .filter((a) => !f.content || norm(a.content).includes(norm(f.content)))
      .filter((a) => !f.startDate || a.assessment_date >= f.startDate)
      .filter((a) => !f.endDate || a.assessment_date <= f.endDate)
      .map(({ class_id: _c, ...a }) => a);
  }
  async listResults(ids: string[]) {
    return this.results.filter((r) => ids.includes(r.assessment_id));
  }
  async listActivities(classId: string, f: { subject?: string; content?: string; origin?: string; limit?: number } = {}): Promise<ActivitySummary[]> {
    return this.activities
      .filter((a) => a.class_id === classId && (!f.origin || a.origin === f.origin))
      .slice(0, f.limit ?? 20)
      .map((a) => ({ id: a.id, title: a.title, subject: a.subject, content: a.content, activity_type: a.activity_type, status: a.status, origin: a.origin, complexity: a.complexity, created_at: a.created_at }));
  }
  async listAnalyses(classId: string, limit = 10) {
    return this.analyses.filter((a) => a.class_id === classId).slice(0, limit);
  }
  async insertAnalysis(row: NewAnalysis) {
    const saved = { ...row, id: randomUUID(), created_at: new Date().toISOString() };
    this.analyses.push(saved);
    return { id: saved.id, created_at: saved.created_at };
  }
  async insertActivity(row: NewActivity) {
    const now = new Date().toISOString();
    const saved: ActivityRow = { ...row, id: randomUUID(), created_at: now, updated_at: now, application_date: null, deadline: null, approved_at: null, approved_by: null };
    this.activities.push(saved);
    return saved;
  }
  async getActivity(id: string) {
    return this.activities.find((a) => a.id === id) ?? null;
  }
  async updateActivity(id: string, patch: ActivityPatch) {
    const i = this.activities.findIndex((a) => a.id === id);
    this.activities[i] = { ...this.activities[i], ...patch, updated_at: new Date().toISOString() };
    return this.activities[i];
  }
}
