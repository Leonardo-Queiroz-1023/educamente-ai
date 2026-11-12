/**
 * Os 5 cenários pedidos, com o código real do agente e um provedor roteirizado.
 */
import { describe, expect, it } from "vitest";
import { runAnalysis, runGeneration } from "../src/lib/agent/tasks";
import { AppError } from "../src/lib/errors";
import { CLASS_ID, InMemoryRepository, ScriptedProvider, TEACHER, call, done, seedClass } from "./helpers";

const classInfo = { id: CLASS_ID, name: "5º Ano A", grade: "5º ano", school_year: 2026 };
const deps = (repo: InMemoryRepository, provider: () => ScriptedProvider) => ({ repo, teacherId: TEACHER, classInfo, provider });

const MULT_VARIADA = [{ title: "Multiplicação", content: "Multiplicação", date: "2026-09-15", total: 10, scores: [8, 4, 3, 9, 5] }];

describe("Cenário 1 — resultados variados em multiplicação", () => {
  it("consulta, calcula, identifica resultados baixos, sugere reforço e registra a análise", async () => {
    const repo = new InMemoryRepository();
    seedClass(repo, MULT_VARIADA);
    const provider = new ScriptedProvider([
      () => call("buscar_resultados", { class_id: CLASS_ID }),
      () => call("analisar_desempenho", {}),
      // Primeira tentativa cita um número que não existe: deve ser recusada.
      () =>
        call("registrar_analise", {
          summary: "A turma teve aproveitamento médio de 72% em multiplicação.",
          attention_points: ["Dois estudantes abaixo de 50%."],
          recommendations: [{ text: "Exercícios progressivos de multiplicação.", evidence: "2 de 5 abaixo de 50%" }],
        }),
      (results) => {
        expect(results[0].isError).toBe(true);
        expect(results[0].content).toContain("72%");
        return call("registrar_analise", {
          summary: "Na avaliação de multiplicação, a turma teve aproveitamento médio de 58%. Dois dos cinco estudantes ficaram abaixo de 50%.",
          attention_points: ["E2 (40%) e E3 (30%) ficaram abaixo de 50%."],
          recommendations: [{ text: "Os resultados sugerem que a turma pode se beneficiar de exercícios introdutórios e progressivos.", evidence: "Média de 58% no conteúdo." }],
        });
      },
      () => done("Análise registrada."),
    ]);

    const out = await runAnalysis(deps(repo, () => provider), { kind: "analysis", classId: CLASS_ID });
    expect(out.status).toBe("ok");
    expect(out.evidence?.overall_mean).toBe(58);
    expect(out.evidence?.students_below_threshold).toBe(2);
    expect(out.suggested_complexity).toBe("reforco");
    expect(repo.analyses).toHaveLength(1);
    expect(repo.analyses[0].summary).toContain("58%");
    expect(out.operations[0]).toBe("Consultou 1 avaliação(ões) e 5 resultado(s) da turma.");
    expect(out.operations.at(-1)).toBe("Registrou a análise no histórico da turma.");
    expect(out.students).toHaveLength(5);
  });
});

describe("Cenário 2 — turma com bom desempenho", () => {
  it("reconhece os bons resultados, sugere aprofundamento e recusa linguagem de diagnóstico", async () => {
    const repo = new InMemoryRepository();
    seedClass(repo, [{ title: "Frações", content: "Frações", date: "2026-10-27", total: 20, scores: [18, 20, 19, 17, 18] }]);
    const provider = new ScriptedProvider([
      () => call("buscar_resultados", { class_id: CLASS_ID }),
      () => call("analisar_desempenho", {}),
      () =>
        call("registrar_analise", {
          summary: "Bom desempenho, mas há indícios de transtorno em um estudante.",
          attention_points: [],
          recommendations: [{ text: "Investigar.", evidence: "—" }],
        }),
      (results) => {
        expect(results[0].isError).toBe(true);
        return call("registrar_analise", {
          summary: "A turma teve aproveitamento médio de 92% em frações; todos ficaram acima de 70%.",
          attention_points: [],
          recommendations: [{ text: "Atividades de aprofundamento com problemas de várias etapas.", evidence: "Média de 92% e nenhum resultado abaixo de 70%." }],
        });
      },
      () => done(),
    ]);
    const out = await runAnalysis(deps(repo, () => provider), { kind: "analysis", classId: CLASS_ID });
    expect(out.evidence?.overall_mean).toBe(92);
    expect(out.evidence?.students_below_threshold).toBe(0);
    expect(out.suggested_complexity).toBe("aprofundamento");
    expect(out.analysis?.attention_points).toEqual([]);
  });
});

describe("Cenário 3 — turma sem avaliações", () => {
  it("informa dados insuficientes sem acionar a IA e sem inventar resultados", async () => {
    const repo = new InMemoryRepository();
    seedClass(repo, []);
    const out = await runAnalysis(
      deps(repo, () => {
        throw new Error("a IA não deveria ser acionada");
      }),
      { kind: "analysis", classId: CLASS_ID },
    );
    expect(out.status).toBe("insufficient_data");
    expect(out.analysis).toBeNull();
    expect(out.evidence).toBeNull();
    expect(repo.analyses).toHaveLength(0);
    expect(out.message).toContain("Não há avaliações");
  });
});

const ATIVIDADE = {
  title: "Reforço: multiplicação no dia a dia",
  instructions: "Leia cada questão, observe o exemplo resolvido e resolva no caderno.",
  worked_examples: [{ problem: "Uma caixa tem 4 lápis. Quantos lápis há em 3 caixas?", solution: "3 x 4 = 12 lápis." }],
  questions: [
    { number: 1, type: "multipla_escolha", statement: "Quanto é 6 x 3?", options: ["18", "9", "16", "21"] },
    { number: 2, type: "resposta_curta", statement: "Uma sala tem 5 fileiras com 4 cadeiras. Quantas cadeiras há?", options: [] },
  ],
  answer_key: [
    { question: 1, answer: "A", explanation: "6 x 3 = 18." },
    { question: 2, answer: "20 cadeiras", explanation: "5 x 4 = 20." },
  ],
  teacher_guidance: "Comece pelo exemplo resolvido no quadro e acompanhe as duplas.",
  personalization_rationale: "A turma teve média de 58% em multiplicação; por isso a atividade começa com exemplos guiados.",
};
const REVISAO_OK = {
  content_match: true, objective_alignment: true, instructions_clear: true,
  answers_correct: true, level_appropriate: true, invented_student_info: false, issues: [],
};

describe("Cenário 4 — geração de atividade", () => {
  it("planeja, gera, valida e salva como rascunho; recusa salvar sem validar e parâmetros diferentes do professor", async () => {
    const repo = new InMemoryRepository();
    seedClass(repo, MULT_VARIADA);
    const gen = {
      class_id: CLASS_ID, subject: "Matemática", content: "Multiplicação", skill: "EF05MA08",
      objective: "Resolver problemas de multiplicação com apoio de exemplos.", target_group: "menor_aproveitamento",
      complexity: "reforco", question_count: 2, activity_type: "Exercícios", evidence_from_assessments: ["Média de 58%"],
    };
    const provider = new ScriptedProvider(
      [
        () => call("buscar_resultados", { class_id: CLASS_ID, content: "Multiplicação" }),
        () => call("analisar_desempenho", {}),
        () =>
          call("planejar_intervencao", {
            content: "Multiplicação", objective: gen.objective, strategies: ["Exemplos resolvidos antes das questões"],
            target_group: "menor_aproveitamento", complexity: "reforco",
          }),
        () => call("gerar_atividade", { ...gen, complexity: "aprofundamento" }),
        (r) => (expect(r[0].isError).toBe(true), call("gerar_atividade", gen)),
        (r) => {
          expect(r[0].isError).toBeFalsy();
          return call("salvar_atividade", { draft_id: "rascunho-1" });
        },
        (r) => (expect(r[0].content).toContain("validar_atividade"), call("validar_atividade", { draft_id: "rascunho-1" })),
        (r) => (expect(JSON.parse(r[0].content).aprovada).toBe(true), call("salvar_atividade", { draft_id: "rascunho-1" })),
        () => done("Rascunho pronto."),
      ],
      [ATIVIDADE, REVISAO_OK],
    );

    const out = await runGeneration(deps(repo, () => provider), {
      kind: "generation", classId: CLASS_ID, content: "Multiplicação", subject: "Matemática",
      targetGroup: "menor_aproveitamento", studentIds: [], complexity: "reforco", questionCount: 2, activityType: "Exercícios",
    });

    expect(repo.activities).toHaveLength(1);
    const saved = repo.activities[0];
    expect(saved.status).toBe("draft");
    expect(saved.origin).toBe("ai");
    expect(saved.approved_at).toBeNull();
    expect(saved.complexity).toBe("reforco");
    expect((saved.answer_key as unknown[]).length).toBe(2);
    expect(out.validation.passed).toBe(true);
    // Público-alvo calculado pelos dados: E2 (40%), E3 (30%) e E5 (50%) abaixo de 60%.
    expect((saved.generation_metadata.plan as { target: { student_codes: string[] } }).target.student_codes).toEqual(["E2", "E3", "E5"]);
    expect(out.operations).toEqual(expect.arrayContaining(["Salvou a atividade como rascunho, aguardando a aprovação do professor."]));
    expect(provider.structuredCalls).toBe(2); // uma geração + uma revisão
  });
});

describe("Cenário 5 — falha na API de IA", () => {
  it("informa o erro, permite tentar de novo e não altera nenhum registro", async () => {
    const repo = new InMemoryRepository();
    seedClass(repo, MULT_VARIADA);
    const before = JSON.stringify({ a: repo.assessments, r: repo.results, act: repo.activities, an: repo.analyses });
    const failing = new ScriptedProvider([
      () => call("buscar_resultados", { class_id: CLASS_ID }),
      () => {
        throw new AppError("AI_RATE_LIMIT", "O limite de uso da IA foi atingido. Aguarde alguns instantes e tente de novo.");
      },
    ]);
    const err = await runAnalysis(deps(repo, () => failing), { kind: "analysis", classId: CLASS_ID }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("AI_RATE_LIMIT");
    expect(err.retryable).toBe(true);
    expect(JSON.stringify({ a: repo.assessments, r: repo.results, act: repo.activities, an: repo.analyses })).toBe(before);
  });

  it("geração interrompida não salva atividade incompleta", async () => {
    const repo = new InMemoryRepository();
    seedClass(repo, MULT_VARIADA);
    const provider = new ScriptedProvider(
      [
        () => call("buscar_resultados", { class_id: CLASS_ID }),
        () => call("analisar_desempenho", {}),
        () => call("planejar_intervencao", { content: "Multiplicação", objective: "Resolver multiplicações simples.", strategies: ["Exemplos"], target_group: "turma", complexity: "consolidacao" }),
        () => call("gerar_atividade", { class_id: CLASS_ID, subject: "Matemática", content: "Multiplicação", skill: "", objective: "Resolver multiplicações simples.", target_group: "turma", complexity: "consolidacao", question_count: 2, activity_type: "Exercícios", evidence_from_assessments: ["58%"] }),
      ],
      [new AppError("AI_TIMEOUT", "A IA demorou demais para responder. Tente de novo.")],
    );
    const err = await runGeneration(deps(repo, () => provider), {
      kind: "generation", classId: CLASS_ID, content: "Multiplicação", targetGroup: "turma", studentIds: [],
      complexity: "consolidacao", questionCount: 2, activityType: "Exercícios",
    }).catch((e) => e);
    expect(err.code).toBe("AI_TIMEOUT");
    expect(repo.activities).toHaveLength(0);
  });
});
