import { describe, expect, it } from "vitest";
import { computePerformance } from "../src/lib/domain/analytics";
import { validateActivityStructure } from "../src/lib/domain/activity";
import { findForbiddenTerms, unsupportedPercentages } from "../src/lib/domain/guards";
import { Pseudonymizer } from "../src/lib/domain/pseudonyms";
import { CLASS_ID, InMemoryRepository, seedClass } from "./helpers";

async function perfOf(assessments: Parameters<typeof seedClass>[1]) {
  const repo = new InMemoryRepository();
  const { studentIds } = seedClass(repo, assessments);
  const list = await repo.listAssessments(CLASS_ID);
  const results = await repo.listResults(list.map((a) => a.id));
  return computePerformance(list, results, new Pseudonymizer(studentIds), studentIds.length);
}

describe("indicadores calculados no código", () => {
  it("calcula média geral, por estudante, distribuição e nível sugerido", async () => {
    const p = await perfOf([{ title: "Multiplicação", content: "Multiplicação", date: "2026-09-15", total: 10, scores: [8, 4, 3, 9, 5] }]);
    expect(p.overall_mean).toBe(58);
    expect(p.students.map((s) => s.mean)).toEqual([80, 40, 30, 90, 50]);
    expect(p.students_below_threshold).toBe(2);
    expect(p.distribution.map((d) => d.count)).toEqual([2, 1, 1, 1]);
    expect(p.suggested_complexity).toBe("reforco");
    expect(p.data_sufficiency).toBe("suficiente");
  });

  it("só afirma evolução entre avaliações comparáveis (mesmo conteúdo)", async () => {
    const diferentes = await perfOf([
      { title: "Multiplicação", content: "Multiplicação", date: "2026-09-15", total: 10, scores: [5, 5, 5, 5, 5] },
      { title: "Divisão", content: "Divisão", date: "2026-10-06", total: 10, scores: [9, 9, 9, 9, 9] },
    ]);
    expect(diferentes.evolution.comparable).toBe(false);

    const iguais = await perfOf([
      { title: "Multiplicação 1", content: "Multiplicação", date: "2026-09-15", total: 10, scores: [5, 5, 5, 5, 5] },
      { title: "Multiplicação 2", content: "multiplicação ", date: "2026-10-06", total: 20, scores: [16, 16, 16, 16, 16] },
    ]);
    expect(iguais.evolution.comparable).toBe(true);
    expect(iguais.evolution.groups[0].steps[0].class_delta).toBe(30);
    expect(iguais.evolution.groups[0].steps[0].trend).toBe("melhora");
  });
});

describe("proteções de texto", () => {
  it("recusa termos de diagnóstico e reprovação", () => {
    expect(findForbiddenTerms("O estudante pode ter dislexia")).toContain("transtorno de aprendizagem");
    expect(findForbiddenTerms("recomenda-se a reprovação")).toContain("reprovação");
    expect(findForbiddenTerms("Os resultados sugerem que o estudante pode se beneficiar de reforço.")).toEqual([]);
  });
  it("aponta percentuais que não existem nos indicadores", () => {
    expect(unsupportedPercentages("média de 58% e 72%", [58, 40])).toEqual(["72"]);
    expect(unsupportedPercentages("média de 57,6%", [58])).toEqual([]);
    // Caso real encontrado: 66,7% não existe, só está perto da média de outro conteúdo (66%).
    expect(unsupportedPercentages("média geral de 66,7%", [64, 66])).toEqual(["66,7"]);
  });
});

describe("validação estrutural da atividade", () => {
  const base = {
    title: "Reforço de multiplicação",
    instructions: "Leia cada questão com atenção e resolva no caderno.",
    objective: "Resolver multiplicações simples com apoio de exemplos.",
    teacher_guidance: "Aplique em duplas e corrija coletivamente no quadro.",
    content: "Multiplicação",
    complexity: "reforco" as const,
    worked_examples: [{ problem: "3 x 4", solution: "3 grupos de 4 = 12" }],
    questions: [{ number: 1, type: "multipla_escolha" as const, statement: "Quanto é 6 x 7?", options: ["42", "36", "48", "40"] }],
    answer_key: [{ question: 1, answer: "A", explanation: "6 x 7 = 42" }],
  };
  it("aceita uma atividade completa", () => {
    expect(validateActivityStructure(base, { questionCount: 1, complexity: "reforco", content: "multiplicação" })).toEqual([]);
  });
  it("aponta gabarito fora das alternativas, quantidade errada e falta de exemplo no reforço", () => {
    const issues = validateActivityStructure(
      { ...base, worked_examples: [], answer_key: [{ question: 1, answer: "E", explanation: "" }] },
      { questionCount: 2, complexity: "reforco" },
    ).map((i) => i.code);
    expect(issues).toEqual(expect.arrayContaining(["gabarito", "quantidade", "exemplo_resolvido"]));
  });
  it("recusa código de estudante no material do aluno", () => {
    const issues = validateActivityStructure({ ...base, instructions: "E3, resolva as questões abaixo com calma." }, {});
    expect(issues.map((i) => i.code)).toContain("privacidade");
  });
});
