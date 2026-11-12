/**
 * Indicadores de desempenho. Todo número que a IA cita vem daqui: o modelo
 * interpreta, mas não calcula. Percentuais = pontuação / total da avaliação.
 */
import type { AssessmentRow, ResultRow } from "../data/repository";
import type { Complexity } from "./activity";
import type { Pseudonymizer } from "./pseudonyms";

export const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const normalize = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/** Limiar abaixo do qual um resultado é tratado como "precisa de reforço" (descritivo, não diagnóstico). */
export const LOW_THRESHOLD = 50;

export interface AssessmentStats {
  assessment_id: string;
  title: string;
  subject: string;
  content: string;
  date: string;
  total_points: number;
  mean: number | null;
  results: number;
  students_in_class: number;
  completion_pct: number | null;
}

export interface GroupStats {
  label: string;
  subject?: string;
  mean: number | null;
  results: number;
  assessments: number;
}

export interface StudentStats {
  code: string;
  mean: number;
  results: number;
  below_threshold: boolean;
}

export interface DistributionBand {
  band: "abaixo_de_50" | "de_50_a_69" | "de_70_a_89" | "de_90_a_100";
  label: string;
  count: number;
  pct: number;
}

export interface EvolutionStep {
  from: { assessment_id: string; title: string; date: string; mean: number };
  to: { assessment_id: string; title: string; date: string; mean: number };
  class_delta: number;
  trend: "melhora" | "estavel" | "queda";
  students_compared: number;
  student_deltas: { code: string; delta: number }[];
}

export interface Evolution {
  comparable: boolean;
  note: string;
  groups: { subject: string; content: string; steps: EvolutionStep[] }[];
}

export interface PerformanceAnalysis {
  data_sufficiency: "insuficiente" | "limitada" | "suficiente";
  assessment_count: number;
  result_count: number;
  student_count: number;
  students_with_results: number;
  overall_mean: number | null;
  by_assessment: AssessmentStats[];
  by_content: GroupStats[];
  by_subject: GroupStats[];
  students: StudentStats[];
  students_below_threshold: number;
  distribution: DistributionBand[];
  content_gap: { lowest: string; highest: string; difference: number } | null;
  evolution: Evolution;
  suggested_complexity: Complexity | null;
  focus_content: string | null;
}

/** Sugestão de nível pelo aproveitamento do conteúdo. É só sugestão: o professor decide. */
export function suggestComplexity(contentMean: number | null): Complexity | null {
  if (contentMean == null) return null;
  if (contentMean < 60) return "reforco";
  if (contentMean < 85) return "consolidacao";
  return "aprofundamento";
}

function percentage(result: ResultRow, assessment: AssessmentRow | undefined): number | null {
  if (!assessment || !(assessment.total_points > 0)) return null;
  return (result.score / assessment.total_points) * 100;
}

export function computeEvolution(
  assessments: AssessmentRow[],
  results: ResultRow[],
  pseudo: Pseudonymizer,
): Evolution {
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const pctBy = new Map<string, Map<string, number>>(); // assessment -> student -> pct
  for (const r of results) {
    const p = percentage(r, byId.get(r.assessment_id));
    if (p == null) continue;
    if (!pctBy.has(r.assessment_id)) pctBy.set(r.assessment_id, new Map());
    pctBy.get(r.assessment_id)!.set(r.student_id, p);
  }

  // Comparáveis = mesmo componente e mesmo conteúdo, com resultados registrados.
  const groups = new Map<string, AssessmentRow[]>();
  for (const a of assessments) {
    if (!pctBy.get(a.id)?.size) continue;
    const key = `${normalize(a.subject)}|${normalize(a.content)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const out: Evolution["groups"] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.assessment_date < b.assessment_date ? -1 : a.assessment_date > b.assessment_date ? 1 : 0));
    const steps: EvolutionStep[] = [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const pm = pctBy.get(prev.id)!;
      const cm = pctBy.get(cur.id)!;
      const prevMean = mean([...pm.values()])!;
      const curMean = mean([...cm.values()])!;
      const delta = round1(curMean - prevMean);
      const studentDeltas = [...cm.keys()]
        .filter((s) => pm.has(s))
        .map((s) => ({ code: pseudo.code(s), delta: round1(cm.get(s)! - pm.get(s)!) }));
      steps.push({
        from: { assessment_id: prev.id, title: prev.title, date: prev.assessment_date, mean: round1(prevMean) },
        to: { assessment_id: cur.id, title: cur.title, date: cur.assessment_date, mean: round1(curMean) },
        class_delta: delta,
        trend: delta >= 5 ? "melhora" : delta <= -5 ? "queda" : "estavel",
        students_compared: studentDeltas.length,
        student_deltas: studentDeltas,
      });
    }
    out.push({ subject: list[0].subject, content: list[0].content, steps });
  }

  return out.length
    ? { comparable: true, note: "Comparações feitas apenas entre avaliações do mesmo componente e conteúdo.", groups: out }
    : {
        comparable: false,
        note: "Não há avaliações comparáveis (mesmo componente e mesmo conteúdo, com resultados) para afirmar evolução.",
        groups: [],
      };
}

export function computePerformance(
  assessments: AssessmentRow[],
  results: ResultRow[],
  pseudo: Pseudonymizer,
  studentCount: number,
): PerformanceAnalysis {
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const valid = results
    .map((r) => ({ r, a: byId.get(r.assessment_id), p: percentage(r, byId.get(r.assessment_id)) }))
    .filter((x): x is { r: ResultRow; a: AssessmentRow; p: number } => x.p != null && !!x.a);

  const by_assessment: AssessmentStats[] = assessments.map((a) => {
    const ps = valid.filter((x) => x.a.id === a.id).map((x) => x.p);
    const m = mean(ps);
    return {
      assessment_id: a.id,
      title: a.title,
      subject: a.subject,
      content: a.content,
      date: a.assessment_date,
      total_points: a.total_points,
      mean: m == null ? null : round1(m),
      results: ps.length,
      students_in_class: studentCount,
      completion_pct: studentCount ? round1((ps.length / studentCount) * 100) : null,
    };
  });

  const group = (keyOf: (a: AssessmentRow) => string, labelOf: (a: AssessmentRow) => string): GroupStats[] => {
    const map = new Map<string, { label: string; subject: string; ps: number[]; ids: Set<string> }>();
    for (const a of assessments) {
      const k = keyOf(a);
      if (!map.has(k)) map.set(k, { label: labelOf(a), subject: a.subject, ps: [], ids: new Set() });
      map.get(k)!.ids.add(a.id);
    }
    for (const x of valid) map.get(keyOf(x.a))!.ps.push(x.p);
    return [...map.values()]
      .map((g) => {
        const m = mean(g.ps);
        return { label: g.label, subject: g.subject, mean: m == null ? null : round1(m), results: g.ps.length, assessments: g.ids.size };
      })
      .sort((x, y) => (x.mean ?? Infinity) - (y.mean ?? Infinity));
  };
  const by_content = group((a) => `${normalize(a.subject)}|${normalize(a.content)}`, (a) => a.content);
  const by_subject = group((a) => normalize(a.subject), (a) => a.subject).map(({ subject: _s, ...g }) => g);

  const perStudent = new Map<string, number[]>();
  for (const x of valid) {
    if (!perStudent.has(x.r.student_id)) perStudent.set(x.r.student_id, []);
    perStudent.get(x.r.student_id)!.push(x.p);
  }
  const students: StudentStats[] = [...perStudent.entries()]
    .map(([id, ps]) => {
      const m = round1(mean(ps)!);
      return { code: pseudo.code(id), mean: m, results: ps.length, below_threshold: m < LOW_THRESHOLD };
    })
    .sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)));

  const all = valid.map((x) => x.p);
  const bands: [DistributionBand["band"], string, (p: number) => boolean][] = [
    ["abaixo_de_50", "Abaixo de 50%", (p) => p < 50],
    ["de_50_a_69", "50% a 69%", (p) => p >= 50 && p < 70],
    ["de_70_a_89", "70% a 89%", (p) => p >= 70 && p < 90],
    ["de_90_a_100", "90% a 100%", (p) => p >= 90],
  ];
  const distribution = bands.map(([band, label, f]) => {
    const count = all.filter(f).length;
    return { band, label, count, pct: all.length ? round1((count / all.length) * 100) : 0 };
  });

  const withMean = by_content.filter((c) => c.mean != null);
  const content_gap =
    withMean.length >= 2
      ? {
          lowest: withMean[0].label,
          highest: withMean[withMean.length - 1].label,
          difference: round1(withMean[withMean.length - 1].mean! - withMean[0].mean!),
        }
      : null;

  const overall = mean(all);
  const focus = withMean[0] ?? null;
  return {
    data_sufficiency: all.length === 0 ? "insuficiente" : all.length < 3 || perStudent.size < 2 ? "limitada" : "suficiente",
    assessment_count: assessments.length,
    result_count: all.length,
    student_count: studentCount,
    students_with_results: perStudent.size,
    overall_mean: overall == null ? null : round1(overall),
    by_assessment,
    by_content,
    by_subject,
    students,
    students_below_threshold: students.filter((s) => s.below_threshold).length,
    distribution,
    content_gap,
    evolution: computeEvolution(assessments, results, pseudo),
    suggested_complexity: suggestComplexity(focus?.mean ?? null),
    focus_content: focus?.label ?? null,
  };
}

/** Todos os percentuais que a análise pode citar (usado pela checagem de números inventados). */
export function citablePercentages(p: PerformanceAnalysis): number[] {
  const out: number[] = [];
  const add = (n: number | null | undefined) => {
    if (n != null && Number.isFinite(n)) out.push(n, Math.abs(n));
  };
  add(p.overall_mean);
  p.by_assessment.forEach((a) => (add(a.mean), add(a.completion_pct)));
  p.by_content.forEach((c) => add(c.mean));
  p.by_subject.forEach((c) => add(c.mean));
  p.students.forEach((s) => add(s.mean));
  p.distribution.forEach((d) => add(d.pct));
  if (p.content_gap) add(p.content_gap.difference);
  p.evolution.groups.forEach((g) =>
    g.steps.forEach((s) => {
      add(s.from.mean);
      add(s.to.mean);
      add(s.class_delta);
      s.student_deltas.forEach((d) => add(d.delta));
    }),
  );
  if (p.student_count) add(round1((p.students_below_threshold / p.student_count) * 100));
  if (p.students_with_results) add(round1((p.students_below_threshold / p.students_with_results) * 100));
  // Limiares e faixas fixas que a análise usa como referência.
  [50, 60, 69, 70, 85, 89, 90, 100].forEach((n) => out.push(n));
  return out;
}
