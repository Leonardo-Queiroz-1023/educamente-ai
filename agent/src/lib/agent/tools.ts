/**
 * Ferramentas do agente. Cada uma executa trabalho real no backend (consulta ao
 * Supabase, cálculo, chamada de geração/revisão, gravação) e registra a operação
 * no RunContext; é esse registro que a interface mostra ao professor.
 */
import { z } from "zod";
import { ToolInputError } from "../errors";
import {
  ACTIVITY_TYPES,
  COMPLEXITIES,
  GeneratedActivitySchema,
  LEVELS,
  TARGET_GROUPS,
  validateActivityStructure,
  type ActivityDraft,
} from "../domain/activity";
import { citablePercentages, computePerformance, normalize, round1 } from "../domain/analytics";
import { findForbiddenTerms, unsupportedPercentages } from "../domain/guards";
import { planIntervention } from "../domain/plan";
import type { ToolSpec } from "../ai/provider";
import type { GenerationRequest, RunContext, SemanticReview } from "./context";
import { GENERATOR_SYSTEM, REVIEWER_SYSTEM, generatorPrompt } from "./prompts";

export const MAX_GENERATIONS = 3;
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(ctx: RunContext, input: z.infer<S>): Promise<unknown>;
}

const tool = <S extends z.ZodType>(t: AgentTool<S>): AgentTool => t as unknown as AgentTool;

export function toToolSpec(t: AgentTool): ToolSpec {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return { name: t.name, description: t.description, inputSchema: schema };
}

function sameClass(ctx: RunContext, classId: string): void {
  if (classId !== ctx.classInfo.id) {
    throw new ToolInputError(`Use a turma da solicitação (class_id ${ctx.classInfo.id}). Outras turmas não estão autorizadas nesta tarefa.`);
  }
}

function genRequest(ctx: RunContext): GenerationRequest {
  if (ctx.request.kind !== "generation") throw new ToolInputError("Esta ferramenta só está disponível na geração de atividades.");
  return ctx.request;
}

/* ---------- 1. buscar_resultados ---------- */
const buscarResultados = tool({
  name: "buscar_resultados",
  description:
    "Consulta no banco as avaliações da turma e os resultados individuais (estudantes como códigos E1, E2...). Respeita as permissões do professor. Use antes de qualquer análise.",
  schema: z.object({
    class_id: uuid,
    assessment_id: uuid.optional(),
    subject: z.string().max(80).optional(),
    content: z.string().max(160).optional(),
    start_date: isoDate.optional(),
    end_date: isoDate.optional(),
  }),
  async run(ctx, input) {
    sameClass(ctx, input.class_id);
    const assessments = await ctx.repo.listAssessments(ctx.classInfo.id, {
      assessmentId: input.assessment_id,
      subject: input.subject,
      content: input.content,
      startDate: input.start_date,
      endDate: input.end_date,
    });
    const results = await ctx.repo.listResults(assessments.map((a) => a.id));
    ctx.fetched = { assessments, results };
    assessments.forEach((a) => ctx.assessmentsSeen.add(a.id));
    ctx.log(`Consultou ${assessments.length} avaliação(ões) e ${results.length} resultado(s) da turma.`);

    const byId = new Map(assessments.map((a) => [a.id, a]));
    const rows = results.map((r) => {
      const a = byId.get(r.assessment_id)!;
      return {
        assessment_id: r.assessment_id,
        estudante: ctx.pseudo.code(r.student_id),
        pontos: r.score,
        total: a.total_points,
        percentual: a.total_points > 0 ? round1((r.score / a.total_points) * 100) : null,
      };
    });
    return {
      turma: { nome: ctx.classInfo.name, ano: ctx.classInfo.grade, estudantes_na_turma: ctx.studentCount },
      avaliacoes: assessments.map((a) => ({
        id: a.id,
        titulo: a.title,
        componente: a.subject,
        conteudo: a.content,
        data: a.assessment_date,
        total_pontos: a.total_points,
        resultados_registrados: results.filter((r) => r.assessment_id === a.id).length,
      })),
      resultados: rows.slice(0, 400),
      ...(rows.length > 400 ? { aviso_lista: "Lista truncada em 400 linhas; use analisar_desempenho para os indicadores completos." } : {}),
      ...(results.length === 0 ? { aviso: "Não há resultados registrados com estes filtros. Os dados são insuficientes para análise." } : {}),
    };
  },
});

/* ---------- 2. analisar_desempenho ---------- */
const analisarDesempenho = tool({
  name: "analisar_desempenho",
  description:
    "Calcula, no código, os indicadores dos resultados consultados por buscar_resultados: média geral, médias por conteúdo e componente, percentual por estudante, distribuição, diferença entre conteúdos e evolução entre avaliações comparáveis.",
  schema: z.object({
    assessment_ids: z.array(uuid).max(100).optional().describe("Restringe a estas avaliações; omita para usar todas as consultadas"),
  }),
  async run(ctx, input) {
    if (!ctx.fetched) throw new ToolInputError("Chame buscar_resultados antes de analisar_desempenho.");
    const ids = input.assessment_ids?.length ? new Set(input.assessment_ids) : null;
    const assessments = ids ? ctx.fetched.assessments.filter((a) => ids.has(a.id)) : ctx.fetched.assessments;
    const results = ctx.fetched.results.filter((r) => assessments.some((a) => a.id === r.assessment_id));
    const perf = computePerformance(assessments, results, ctx.pseudo, ctx.studentCount);
    ctx.performance = perf;
    results.forEach((r) => ctx.studentsAnalyzed.add(r.student_id));
    const lowContents = perf.by_content.filter((c) => c.mean != null && c.mean < 70).length;
    ctx.log(
      `Analisou ${perf.result_count} resultado(s) de ${perf.students_with_results} estudante(s) em ${perf.assessment_count} avaliação(ões)` +
        (perf.result_count ? `; ${lowContents} conteúdo(s) com aproveitamento abaixo de 70%.` : "."),
    );
    return perf;
  },
});

/* ---------- 3. consultar_historico ---------- */
const consultarHistorico = tool({
  name: "consultar_historico",
  description:
    "Consulta o histórico pedagógico da turma (ou de um estudante pelo código): avaliações ao longo do tempo com evolução entre avaliações comparáveis, atividades já registradas e análises anteriores.",
  schema: z.object({
    class_id: uuid,
    student_id: z.string().regex(/^E\d{1,3}$/i, "use o código do estudante, como E3").optional(),
    subject: z.string().max(80).optional(),
    content: z.string().max(160).optional(),
  }),
  async run(ctx, input) {
    sameClass(ctx, input.class_id);
    const assessments = await ctx.repo.listAssessments(ctx.classInfo.id, { subject: input.subject, content: input.content });
    const results = await ctx.repo.listResults(assessments.map((a) => a.id));
    assessments.forEach((a) => ctx.assessmentsSeen.add(a.id));
    const perf = computePerformance(assessments, results, ctx.pseudo, ctx.studentCount);
    const [activities, analyses] = await Promise.all([
      ctx.repo.listActivities(ctx.classInfo.id, { subject: input.subject, content: input.content, limit: 15 }),
      ctx.repo.listAnalyses(ctx.classInfo.id, 5),
    ]);

    let estudante: unknown = undefined;
    if (input.student_id) {
      const sid = ctx.pseudo.studentId(input.student_id);
      if (!sid) throw new ToolInputError(`O código ${input.student_id} não corresponde a um estudante desta turma.`);
      const byId = new Map(assessments.map((a) => [a.id, a]));
      const timeline = results
        .filter((r) => r.student_id === sid)
        .map((r) => {
          const a = byId.get(r.assessment_id)!;
          return { avaliacao: a.title, conteudo: a.content, componente: a.subject, data: a.assessment_date, percentual: round1((r.score / a.total_points) * 100) };
        })
        .sort((x, y) => (x.data < y.data ? -1 : 1));
      const code = input.student_id.toUpperCase();
      estudante = {
        codigo: code,
        resultados: timeline,
        evolucao: perf.evolution.groups.flatMap((g) =>
          g.steps.flatMap((s) => s.student_deltas.filter((d) => d.code === code).map((d) => ({ conteudo: g.content, de: s.from.title, para: s.to.title, variacao: d.delta }))),
        ),
      };
    }

    ctx.log(
      `Consultou o histórico${input.student_id ? ` do estudante ${input.student_id.toUpperCase()}` : " da turma"}: ${assessments.length} avaliação(ões), ${activities.length} atividade(s) e ${analyses.length} análise(s) anterior(es).`,
    );
    return {
      avaliacoes: perf.by_assessment.map((a) => ({ titulo: a.title, componente: a.subject, conteudo: a.content, data: a.date, media: a.mean, resultados: a.results })),
      evolucao: perf.evolution,
      ...(estudante ? { estudante } : {}),
      atividades: activities.map((a) => ({ titulo: a.title, conteudo: a.content, tipo: a.activity_type, status: a.status, origem: a.origin, nivel: a.complexity, criada_em: a.created_at.slice(0, 10) })),
      analises_anteriores: analyses.map((a) => ({ data: a.created_at.slice(0, 10), conteudo: a.content, resumo: a.summary })),
    };
  },
});

/* ---------- 4. planejar_intervencao ---------- */
const planejarIntervencao = tool({
  name: "planejar_intervencao",
  description:
    "Transforma a análise em uma proposta pedagógica: confere o aproveitamento do conteúdo, define o público-alvo pelos dados, compara o nível escolhido com o sugerido e registra objetivo e estratégias.",
  schema: z.object({
    content: z.string().min(1).max(160),
    skill: z.string().max(300).optional(),
    objective: z.string().min(10).max(600),
    strategies: z.array(z.string().max(400)).min(1).max(6),
    target_group: z.enum(TARGET_GROUPS),
    student_codes: z.array(z.string().regex(/^E\d{1,3}$/i)).max(60).optional(),
    complexity: z.enum(COMPLEXITIES),
  }),
  async run(ctx, input) {
    const req = genRequest(ctx);
    if (!ctx.performance || !ctx.fetched) throw new ToolInputError("Chame buscar_resultados e analisar_desempenho antes de planejar.");
    if (input.complexity !== req.complexity)
      throw new ToolInputError(`O professor escolheu o nível "${req.complexity}". Use esse valor.`);
    if (input.target_group !== req.targetGroup)
      throw new ToolInputError(`O professor escolheu o público "${req.targetGroup}". Use esse valor.`);

    // Média de cada estudante só nas avaliações do conteúdo planejado.
    const contentIds = new Set(ctx.fetched.assessments.filter((a) => normalize(a.content) === normalize(input.content)).map((a) => a.id));
    const totals = new Map(ctx.fetched.assessments.map((a) => [a.id, a.total_points]));
    const acc = new Map<string, number[]>();
    for (const r of ctx.fetched.results) {
      if (!contentIds.has(r.assessment_id)) continue;
      const code = ctx.pseudo.code(r.student_id);
      const total = totals.get(r.assessment_id)!;
      if (!(total > 0)) continue;
      if (!acc.has(code)) acc.set(code, []);
      acc.get(code)!.push((r.score / total) * 100);
    }
    const perStudent = new Map([...acc.entries()].map(([c, ps]) => [c, round1(ps.reduce((a, b) => a + b, 0) / ps.length)]));

    const plan = planIntervention(ctx.performance, perStudent, {
      ...input,
      student_codes: req.targetGroup === "estudantes_selecionados" ? req.studentCodes : input.student_codes,
    });
    ctx.plan = plan;
    ctx.log(
      `Planejou a intervenção em ${plan.content} para ${plan.target.label.toLowerCase()} (${plan.target.count} estudante(s)), nível escolhido: ${LEVELS[plan.chosen_complexity].label}.`,
    );
    return plan;
  },
});

/* ---------- 5. gerar_atividade ---------- */
const gerarAtividade = tool({
  name: "gerar_atividade",
  description:
    "Gera a atividade personalizada (título, instruções, exemplos resolvidos, questões, gabarito, orientação ao professor e justificativa) a partir do plano e das evidências. Use os parâmetros escolhidos pelo professor. Para corrigir uma versão reprovada na validação, passe os problemas em corrections.",
  schema: z.object({
    class_id: uuid,
    subject: z.string().max(80),
    content: z.string().min(1).max(160),
    skill: z.string().max(300),
    objective: z.string().min(10).max(600),
    target_group: z.enum(TARGET_GROUPS),
    complexity: z.enum(COMPLEXITIES),
    question_count: z.number().int().min(1).max(15),
    activity_type: z.enum(ACTIVITY_TYPES),
    evidence_from_assessments: z.array(z.string().max(400)).min(1).max(10),
    corrections: z.array(z.string().max(600)).max(20).optional(),
  }),
  async run(ctx, input) {
    sameClass(ctx, input.class_id);
    const req = genRequest(ctx);
    if (!ctx.plan) throw new ToolInputError("Chame planejar_intervencao antes de gerar a atividade.");
    const wrong = [
      input.complexity !== req.complexity && `complexity deve ser "${req.complexity}"`,
      input.question_count !== req.questionCount && `question_count deve ser ${req.questionCount}`,
      input.activity_type !== req.activityType && `activity_type deve ser "${req.activityType}"`,
      input.target_group !== req.targetGroup && `target_group deve ser "${req.targetGroup}"`,
      normalize(input.content) !== normalize(ctx.plan.content) && `content deve ser "${ctx.plan.content}" (o conteúdo planejado)`,
    ].filter(Boolean);
    if (wrong.length) throw new ToolInputError(`Use as escolhas do professor: ${wrong.join("; ")}.`);
    if (ctx.generations >= MAX_GENERATIONS) {
      throw new ToolInputError(`Limite de ${MAX_GENERATIONS} gerações atingido. Salve a melhor versão validada ou encerre explicando os problemas.`);
    }
    ctx.generations++;

    // As evidências que vão para o gerador são as calculadas no plano (não as resumidas pelo modelo).
    const generated = await ctx.provider.generateStructured({
      system: GENERATOR_SYSTEM,
      prompt: generatorPrompt({
        plan: { ...ctx.plan, objective: input.objective, skill: input.skill || ctx.plan.skill },
        req,
        grade: ctx.classInfo.grade,
        corrections: input.corrections ?? [],
      }),
      schema: GeneratedActivitySchema,
    });
    const draft: ActivityDraft = {
      ...generated,
      subject: input.subject || ctx.plan.subject || req.subject || "",
      content: ctx.plan.content,
      skill: input.skill || ctx.plan.skill || "",
      objective: input.objective,
      target_group: req.targetGroup,
      complexity: req.complexity,
      activity_type: req.activityType,
    };
    const id = `rascunho-${ctx.generations}`;
    ctx.drafts.set(id, { id, draft });
    ctx.log(
      `Gerou ${ctx.generations > 1 ? "nova versão da" : "a"} atividade "${draft.title}" com ${draft.questions.length} questão(ões)${input.corrections?.length ? ", corrigindo os problemas da validação" : ""}.`,
    );
    return { draft_id: id, atividade: draft };
  },
});

/* ---------- 6. validar_atividade ---------- */
const ReviewSchema = z.object({
  content_match: z.boolean(),
  objective_alignment: z.boolean(),
  instructions_clear: z.boolean(),
  answers_correct: z.boolean(),
  level_appropriate: z.boolean(),
  invented_student_info: z.boolean(),
  issues: z.array(z.object({ question: z.number().int().nullable(), problem: z.string(), suggestion: z.string() })),
});

const validarAtividade = tool({
  name: "validar_atividade",
  description:
    "Valida um rascunho: checagens estruturais no código (enunciados, alternativas, gabarito, quantidade, nível, privacidade, linguagem) e revisão de conteúdo (correspondência ao conteúdo e ao objetivo, clareza, respostas corretas, nível, ausência de dados inventados).",
  schema: z.object({ draft_id: z.string().max(40) }),
  async run(ctx, input) {
    const req = genRequest(ctx);
    const state = ctx.drafts.get(input.draft_id);
    if (!state) throw new ToolInputError(`Rascunho ${input.draft_id} não encontrado. Use o draft_id devolvido por gerar_atividade.`);
    ctx.validations++;

    const structural = validateActivityStructure(state.draft, {
      questionCount: req.questionCount,
      complexity: req.complexity,
      content: ctx.plan?.content ?? req.content,
    });
    state.structuralIssues = structural;
    if (structural.length) {
      state.passed = false;
      ctx.log(`Validou "${state.draft.title}": ${structural.length} problema(s) estrutural(is) encontrado(s).`);
      return { aprovada: false, problemas: structural.map((i) => i.message), orientacao: "Chame gerar_atividade com estes problemas em corrections." };
    }

    const review: SemanticReview = await ctx.provider.generateStructured({
      system: REVIEWER_SYSTEM,
      prompt: `Pedido: conteúdo "${state.draft.content}", objetivo "${state.draft.objective}", ${LEVELS[req.complexity].label} (${LEVELS[req.complexity].guidance.join(" ")}), ${req.questionCount} questões, ano escolar ${ctx.classInfo.grade ?? "não informado"}.\nAtividade:\n${JSON.stringify(state.draft, null, 2)}`,
      schema: ReviewSchema,
    });
    state.review = review;
    const flags = [
      !review.content_match && "As questões não correspondem bem ao conteúdo.",
      !review.objective_alignment && "A atividade não está alinhada ao objetivo.",
      !review.instructions_clear && "As instruções não estão claras.",
      !review.answers_correct && "Há respostas incorretas no gabarito.",
      !review.level_appropriate && "O nível não corresponde ao solicitado.",
      review.invented_student_info && "Há informação inventada sobre estudantes.",
    ].filter((x): x is string => !!x);
    const problems = [...flags, ...review.issues.map((i) => `${i.question ? `Questão ${i.question}: ` : ""}${i.problem} (sugestão: ${i.suggestion})`)];
    state.passed = flags.length === 0;
    ctx.log(
      state.passed
        ? `Validou "${state.draft.title}": estrutura e conteúdo aprovados${review.issues.length ? ` (${review.issues.length} observação(ões) menor(es))` : ""}.`
        : `Validou "${state.draft.title}": ${problems.length} problema(s) de conteúdo encontrado(s).`,
    );
    return state.passed
      ? { aprovada: true, observacoes: problems }
      : { aprovada: false, problemas: problems, orientacao: "Chame gerar_atividade com estes problemas em corrections." };
  },
});

/* ---------- 7. salvar_atividade ---------- */
const salvarAtividade = tool({
  name: "salvar_atividade",
  description:
    "Salva o rascunho validado no banco com status \"draft\" e origem IA. Nunca aprova: a aprovação é do professor.",
  schema: z.object({ draft_id: z.string().max(40) }),
  async run(ctx, input) {
    const req = genRequest(ctx);
    if (ctx.savedActivity) throw new ToolInputError("A atividade desta solicitação já foi salva.");
    const state = ctx.drafts.get(input.draft_id);
    if (!state) throw new ToolInputError(`Rascunho ${input.draft_id} não encontrado.`);
    if (state.structuralIssues === undefined) throw new ToolInputError("Chame validar_atividade antes de salvar.");
    if (state.structuralIssues.length) throw new ToolInputError("Este rascunho tem problemas estruturais e não pode ser salvo. Gere uma versão corrigida.");
    if (!state.passed && ctx.generations < MAX_GENERATIONS) {
      throw new ToolInputError("A revisão de conteúdo apontou problemas. Gere uma versão corrigida antes de salvar.");
    }

    const d = state.draft;
    const row = await ctx.repo.insertActivity({
      title: d.title,
      description: d.personalization_rationale,
      class_id: ctx.classInfo.id,
      subject: d.subject || null,
      content: d.content,
      objective: d.objective,
      skill: d.skill || null,
      activity_type: d.activity_type,
      instructions: d.instructions,
      questions: d.questions,
      answer_key: d.answer_key,
      status: "draft",
      origin: "ai",
      teacher_guidance: d.teacher_guidance,
      justification: d.personalization_rationale,
      complexity: d.complexity,
      target_group: d.target_group,
      worked_examples: d.worked_examples,
      analysis_id: req.analysisId ?? null,
      generation_metadata: {
        provider: ctx.provider.id,
        model: ctx.provider.model,
        generated_at: new Date().toISOString(),
        attempts: ctx.generations,
        validation: {
          structural_issues: state.structuralIssues,
          review: state.review ?? null,
          passed: !!state.passed,
          needs_teacher_attention: !state.passed,
        },
        plan: ctx.plan ?? null,
        request: {
          content: req.content,
          subject: req.subject ?? null,
          skill: req.skill ?? null,
          objective: req.objective ?? null,
          target_group: req.targetGroup,
          student_codes: req.studentCodes,
          // Ids (não nomes) para o professor regenerar com a mesma seleção.
          student_ids: req.studentCodes.map((c) => ctx.pseudo.studentId(c)).filter(Boolean),
          complexity: req.complexity,
          question_count: req.questionCount,
          activity_type: req.activityType,
          teacher_notes: req.teacherNotes ?? null,
          regenerate_of: req.regenerateOf ?? null,
        },
        operations: [...ctx.operations, "Salvou a atividade como rascunho."],
      },
    });
    ctx.savedActivity = row;
    ctx.log("Salvou a atividade como rascunho, aguardando a aprovação do professor.");
    return { activity_id: row.id, status: row.status };
  },
});

/* ---------- registrar_analise (fluxo de análise) ---------- */
const registrarAnalise = tool({
  name: "registrar_analise",
  description:
    "Registra a análise no histórico (tabela pedagogical_analyses) com resumo, pontos de atenção e recomendações. Os indicadores calculados são anexados pelo sistema. Rejeita textos com números que não aparecem nos indicadores ou com linguagem de diagnóstico.",
  schema: z.object({
    summary: z.string().min(20).max(1500),
    attention_points: z.array(z.string().max(500)).max(8),
    recommendations: z
      .array(z.object({ text: z.string().max(600), evidence: z.string().max(400).describe("Dado que sustenta a recomendação") }))
      .min(1)
      .max(6),
  }),
  async run(ctx, input) {
    if (ctx.request.kind !== "analysis") throw new ToolInputError("Esta ferramenta só está disponível na análise.");
    const perf = ctx.performance;
    if (!perf) throw new ToolInputError("Chame analisar_desempenho antes de registrar a análise.");
    if (perf.result_count === 0) throw new ToolInputError("Não há resultados para analisar; informe ao professor que os dados são insuficientes.");
    if (ctx.savedAnalysis) throw new ToolInputError("A análise desta solicitação já foi registrada.");

    const text = [input.summary, ...input.attention_points, ...input.recommendations.flatMap((r) => [r.text, r.evidence])].join("\n");
    const forbidden = findForbiddenTerms(text);
    if (forbidden.length) throw new ToolInputError(`Reescreva sem termos de diagnóstico, rótulo ou decisão definitiva: ${forbidden.join(", ")}.`);
    const unsupported = unsupportedPercentages(text, citablePercentages(perf));
    if (unsupported.length) {
      throw new ToolInputError(`Estes percentuais não aparecem nos indicadores calculados: ${unsupported.map((n) => `${n}%`).join(", ")}. Use apenas os valores de analisar_desempenho.`);
    }

    const req = ctx.request;
    const saved = await ctx.repo.insertAnalysis({
      class_id: ctx.classInfo.id,
      teacher_id: ctx.teacherId,
      assessment_id: req.assessmentId ?? null,
      subject: req.subject ?? null,
      content: req.content ?? perf.focus_content,
      summary: input.summary,
      analysis_data: {
        attention_points: input.attention_points,
        recommendations: input.recommendations,
        suggested_complexity: perf.suggested_complexity,
        focus_content: perf.focus_content,
        filters: { assessment_id: req.assessmentId ?? null, subject: req.subject ?? null, content: req.content ?? null, start_date: req.startDate ?? null, end_date: req.endDate ?? null },
        evidence: perf,
        students_legend: ctx.pseudo.legend(),
        operations: [...ctx.operations, "Registrou a análise no histórico."],
        provider: ctx.provider.id,
        model: ctx.provider.model,
      },
    });
    ctx.savedAnalysis = { ...saved, ...input };
    ctx.log("Registrou a análise no histórico da turma.");
    return { analysis_id: saved.id };
  },
});

export const ANALYSIS_TOOLS: AgentTool[] = [buscarResultados, analisarDesempenho, consultarHistorico, registrarAnalise];
export const GENERATION_TOOLS: AgentTool[] = [
  buscarResultados,
  analisarDesempenho,
  consultarHistorico,
  planejarIntervencao,
  gerarAtividade,
  validarAtividade,
  salvarAtividade,
];
