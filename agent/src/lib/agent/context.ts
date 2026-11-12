import type { AiProvider } from "../ai/provider";
import type { ActivityRow, AssessmentRow, ClassInfo, DataRepository, ResultRow } from "../data/repository";
import type { ActivityDraft, Complexity, TargetGroup, ValidationIssue } from "../domain/activity";
import type { PerformanceAnalysis } from "../domain/analytics";
import type { InterventionPlan } from "../domain/plan";
import type { Pseudonymizer } from "../domain/pseudonyms";

export interface AnalysisRequest {
  kind: "analysis";
  classId: string;
  assessmentId?: string;
  subject?: string;
  content?: string;
  startDate?: string;
  endDate?: string;
}

export interface GenerationRequest {
  kind: "generation";
  classId: string;
  subject?: string;
  content: string;
  skill?: string;
  objective?: string;
  targetGroup: TargetGroup;
  studentCodes: string[];
  complexity: Complexity;
  questionCount: number;
  activityType: string;
  teacherNotes?: string;
  analysisId?: string;
  regenerateOf?: string;
}

export interface SemanticReview {
  content_match: boolean;
  objective_alignment: boolean;
  instructions_clear: boolean;
  answers_correct: boolean;
  level_appropriate: boolean;
  invented_student_info: boolean;
  issues: { question: number | null; problem: string; suggestion: string }[];
}

export interface DraftState {
  id: string;
  draft: ActivityDraft;
  structuralIssues?: ValidationIssue[];
  review?: SemanticReview;
  passed?: boolean;
}

/** Estado de uma execução do agente. Tudo que a interface mostra sai daqui. */
export class RunContext {
  readonly operations: string[] = [];
  /** Avaliações efetivamente consultadas (ids), para o resumo de transparência. */
  readonly assessmentsSeen = new Set<string>();
  readonly studentsAnalyzed = new Set<string>();
  fetched?: { assessments: AssessmentRow[]; results: ResultRow[] };
  performance?: PerformanceAnalysis;
  plan?: InterventionPlan;
  readonly drafts = new Map<string, DraftState>();
  generations = 0;
  validations = 0;
  savedActivity?: ActivityRow;
  savedAnalysis?: { id: string; created_at: string; summary: string; attention_points: string[]; recommendations: { text: string; evidence: string }[] };
  readonly toolErrors: string[] = [];

  constructor(
    readonly repo: DataRepository,
    readonly provider: AiProvider,
    readonly teacherId: string,
    readonly classInfo: ClassInfo,
    readonly pseudo: Pseudonymizer,
    readonly studentCount: number,
    readonly request: AnalysisRequest | GenerationRequest,
  ) {}

  log(line: string): void {
    this.operations.push(line);
  }
}
