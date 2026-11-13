/**
 * As duas tarefas do agente expostas à plataforma: análise de aprendizagem e
 * geração de atividade. Cada uma valida o acesso, confere se há dados, roda o
 * agente e devolve só o que de fato aconteceu.
 */
import type { AiProvider } from "../ai/provider";
import type { ActivityRow, ClassInfo, DataRepository } from "../data/repository";
import { AppError } from "../errors";
import { Pseudonymizer } from "../domain/pseudonyms";
import type { PerformanceAnalysis } from "../domain/analytics";
import { RunContext, type AnalysisRequest, type GenerationRequest } from "./context";
import { ANALYSIS_SYSTEM, GENERATION_SYSTEM, analysisUserMessage, generationUserMessage } from "./prompts";
import { runAgent } from "./run-agent";
import { ANALYSIS_TOOLS, GENERATION_TOOLS } from "./tools";
import { noEmit, type EmitFn } from "./events";

export interface TaskDeps {
  repo: DataRepository;
  teacherId: string;
  classInfo: ClassInfo;
  /** Criado só quando a IA é realmente necessária (sem dados, nenhuma chamada é feita). */
  provider: () => AiProvider;
  /** Progresso em tempo real (opcional). Sem ele, nada muda na resposta final. */
  emit?: EmitFn;
}

export interface AnalysisOutcome {
  status: "ok" | "insufficient_data";
  message: string;
  analysis: {
    id: string;
    created_at: string;
    summary: string;
    attention_points: string[];
    recommendations: { text: string; evidence: string }[];
  } | null;
  evidence: PerformanceAnalysis | null;
  suggested_complexity: string | null;
  focus_content: string | null;
  students: { code: string; student_id: string }[];
  operations: string[];
}

export interface GenerationOutcome {
  status: "ok";
  activity: ActivityRow;
  validation: { passed: boolean; structural_issues: unknown[]; review: unknown };
  students: { code: string; student_id: string }[];
  operations: string[];
}

async function setup(deps: TaskDeps) {
  (deps.emit ?? noEmit)({ type: "status", phase: "checking", label: "Conferindo os dados da turma" });
  const students = await deps.repo.listStudents(deps.classInfo.id);
  return { pseudo: new Pseudonymizer(students.map((s) => s.id)), studentCount: students.length };
}

export async function runAnalysis(deps: TaskDeps, req: AnalysisRequest): Promise<AnalysisOutcome> {
  const { pseudo, studentCount } = await setup(deps);

  // Conferência de dados antes de chamar a IA: sem resultados, não há o que analisar.
  const assessments = await deps.repo.listAssessments(deps.classInfo.id, {
    assessmentId: req.assessmentId,
    subject: req.subject,
    content: req.content,
    startDate: req.startDate,
    endDate: req.endDate,
  });
  const results = await deps.repo.listResults(assessments.map((a) => a.id));
  if (!results.length) {
    return {
      status: "insufficient_data",
      message: assessments.length
        ? `Há ${assessments.length} avaliação(ões) com estes filtros, mas nenhum resultado registrado. Lance as notas para que a IA possa analisar.`
        : "Não há avaliações registradas para esta turma com estes filtros. Registre avaliações e resultados para que a IA possa analisar.",
      analysis: null,
      evidence: null,
      suggested_complexity: null,
      focus_content: null,
      students: [],
      operations: [`Consultou ${assessments.length} avaliação(ões) e 0 resultado(s) da turma: dados insuficientes, a IA não foi acionada.`],
    };
  }

  const ctx = new RunContext(deps.repo, deps.provider(), deps.teacherId, deps.classInfo, pseudo, studentCount, req, deps.emit);
  await runAgent(ctx, { system: ANALYSIS_SYSTEM, userMessage: analysisUserMessage(req, deps.classInfo.name), tools: ANALYSIS_TOOLS });

  if (!ctx.savedAnalysis || !ctx.performance) {
    throw new AppError("AGENT_INCOMPLETE", "A IA não concluiu a análise. Nenhum dado foi alterado; tente de novo.", { operations: ctx.operations });
  }
  return {
    status: "ok",
    message: "Análise concluída e registrada no histórico.",
    analysis: {
      id: ctx.savedAnalysis.id,
      created_at: ctx.savedAnalysis.created_at,
      summary: ctx.savedAnalysis.summary,
      attention_points: ctx.savedAnalysis.attention_points,
      recommendations: ctx.savedAnalysis.recommendations,
    },
    evidence: ctx.performance,
    suggested_complexity: ctx.performance.suggested_complexity,
    focus_content: ctx.performance.focus_content,
    students: pseudo.legend(),
    operations: ctx.operations,
  };
}

export async function runGeneration(
  deps: TaskDeps,
  req: Omit<GenerationRequest, "studentCodes"> & { studentIds: string[] },
): Promise<GenerationOutcome> {
  const { pseudo, studentCount } = await setup(deps);
  const students = new Set((await deps.repo.listStudents(deps.classInfo.id)).map((s) => s.id));
  const foreign = req.studentIds.filter((id) => !students.has(id));
  if (foreign.length) throw new AppError("FORBIDDEN", "Alguns estudantes selecionados não pertencem a esta turma.");
  if (req.targetGroup === "estudantes_selecionados" && !req.studentIds.length) {
    throw new AppError("BAD_REQUEST", "Selecione ao menos um estudante ou escolha outro público-alvo.");
  }

  // Sem resultados no conteúdo, a atividade não teria como ser personalizada.
  const assessments = await deps.repo.listAssessments(deps.classInfo.id, { content: req.content, subject: req.subject });
  const results = await deps.repo.listResults(assessments.map((a) => a.id));
  if (!results.length) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Não há resultados registrados para "${req.content}" nesta turma. Registre uma avaliação desse conteúdo (com notas) para gerar uma atividade personalizada.`,
    );
  }

  const fullReq: GenerationRequest = { ...req, studentCodes: req.studentIds.map((id) => pseudo.code(id)) };
  const ctx = new RunContext(deps.repo, deps.provider(), deps.teacherId, deps.classInfo, pseudo, studentCount, fullReq, deps.emit);
  await runAgent(ctx, {
    system: GENERATION_SYSTEM,
    userMessage: generationUserMessage(fullReq, deps.classInfo.name, deps.classInfo.grade),
    tools: GENERATION_TOOLS,
  });

  if (!ctx.savedActivity) {
    const last = [...ctx.drafts.values()].pop();
    const issues = last ? [...(last.structuralIssues ?? []).map((i) => i.message), ...(last.review?.issues ?? []).map((i) => i.problem)] : [];
    throw new AppError(
      "AGENT_INCOMPLETE",
      "A IA não conseguiu produzir uma atividade que passasse na validação. Nada foi salvo; tente gerar de novo ou ajuste o pedido.",
      { operations: ctx.operations, issues },
    );
  }
  const meta = ctx.savedActivity.generation_metadata as { validation?: GenerationOutcome["validation"] };
  return {
    status: "ok",
    activity: ctx.savedActivity,
    validation: meta.validation ?? { passed: false, structural_issues: [], review: null },
    students: pseudo.legend(),
    operations: ctx.operations,
  };
}
