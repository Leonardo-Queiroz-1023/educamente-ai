/**
 * planejar_intervencao: transforma os indicadores em uma proposta pedagógica.
 * Os números e o público-alvo saem dos dados; objetivo e estratégias vêm do agente.
 */
import { LOW_THRESHOLD, normalize, suggestComplexity, type PerformanceAnalysis } from "./analytics";
import { LEVELS, TARGET_LABELS, type Complexity, type TargetGroup } from "./activity";
import { ToolInputError } from "../errors";

export interface PlanInput {
  content: string;
  skill?: string;
  objective: string;
  strategies: string[];
  target_group: TargetGroup;
  student_codes?: string[];
  complexity: Complexity;
}

export interface InterventionPlan {
  content: string;
  subject: string | null;
  skill: string | null;
  objective: string;
  strategies: string[];
  content_mean: number | null;
  class_mean: number | null;
  target: { type: TargetGroup; label: string; student_codes: string[]; count: number; group_mean: number | null };
  suggested_complexity: Complexity | null;
  chosen_complexity: Complexity;
  level_guidance: string[];
  evidence: string[];
  notes: string[];
}

/** Percentual por estudante no conteúdo, a partir dos dados detalhados. */
export type ContentStudentScores = Map<string, number>; // code -> média no conteúdo

export function planIntervention(
  perf: PerformanceAnalysis,
  perStudentInContent: ContentStudentScores,
  input: PlanInput,
): InterventionPlan {
  const stats = perf.by_content.find((c) => normalize(c.label) === normalize(input.content));
  if (!stats || stats.mean == null) {
    throw new ToolInputError(
      `Não há resultados registrados para o conteúdo "${input.content}" nos dados consultados. Use um conteúdo que aparece em analisar_desempenho.by_content.`,
    );
  }
  if (!input.objective.trim()) throw new ToolInputError("Informe o objetivo de aprendizagem.");

  let codes: string[] = [];
  const notes: string[] = [];
  if (input.target_group === "menor_aproveitamento") {
    codes = [...perStudentInContent.entries()].filter(([, m]) => m < 60).map(([c]) => c);
    if (!codes.length) {
      notes.push("Nenhum estudante ficou abaixo de 60% neste conteúdo; a atividade pode ser aplicada à turma toda.");
    }
  } else if (input.target_group === "estudantes_selecionados") {
    codes = (input.student_codes ?? []).map((c) => c.trim().toUpperCase());
    const unknown = codes.filter((c) => !perStudentInContent.has(c));
    if (unknown.length) notes.push(`Sem resultados neste conteúdo para: ${unknown.join(", ")}.`);
  } else {
    codes = [...perStudentInContent.keys()];
  }

  const groupScores = codes.map((c) => perStudentInContent.get(c)).filter((n): n is number => n != null);
  const groupMean = groupScores.length ? Math.round((groupScores.reduce((a, b) => a + b, 0) / groupScores.length) * 10) / 10 : null;
  const suggested = suggestComplexity(input.target_group === "turma" ? stats.mean : (groupMean ?? stats.mean));
  if (suggested && suggested !== input.complexity) {
    notes.push(
      `Os dados sugerem ${LEVELS[suggested].label}, mas o professor escolheu ${LEVELS[input.complexity].label}. A escolha do professor prevalece.`,
    );
  }

  const below = [...perStudentInContent.values()].filter((m) => m < LOW_THRESHOLD).length;
  const evidence = [
    `Aproveitamento médio da turma em ${stats.label}: ${stats.mean}% (${stats.results} resultado(s) em ${stats.assessments} avaliação(ões)).`,
    perf.overall_mean != null ? `Aproveitamento médio geral nos dados consultados: ${perf.overall_mean}%.` : "",
    `${below} de ${perStudentInContent.size} estudante(s) com resultado neste conteúdo ficaram abaixo de ${LOW_THRESHOLD}%.`,
    groupMean != null && input.target_group !== "turma"
      ? `Média do público-alvo (${codes.length} estudante(s)) neste conteúdo: ${groupMean}%.`
      : "",
  ].filter(Boolean);

  return {
    content: stats.label,
    subject: stats.subject ?? null,
    skill: input.skill?.trim() || null,
    objective: input.objective.trim(),
    strategies: input.strategies.map((s) => s.trim()).filter(Boolean),
    content_mean: stats.mean,
    class_mean: perf.overall_mean,
    target: {
      type: input.target_group,
      label: TARGET_LABELS[input.target_group],
      student_codes: codes,
      count: codes.length,
      group_mean: groupMean,
    },
    suggested_complexity: suggested,
    chosen_complexity: input.complexity,
    level_guidance: LEVELS[input.complexity].guidance,
    evidence,
    notes,
  };
}
