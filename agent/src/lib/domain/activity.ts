/**
 * Estrutura das atividades geradas, níveis de complexidade e validação estrutural.
 */
import { z } from "zod";
import { normalize } from "./analytics";
import { findForbiddenTerms, mentionsStudentCode } from "./guards";

export const COMPLEXITIES = ["reforco", "consolidacao", "aprofundamento"] as const;
export type Complexity = (typeof COMPLEXITIES)[number];

export const LEVELS: Record<Complexity, { label: string; guidance: string[] }> = {
  reforco: {
    label: "Nível 1 — Reforço",
    guidance: [
      "Questões introdutórias, começando pelo conceito básico.",
      "Instruções guiadas, passo a passo.",
      "Pelo menos um exemplo resolvido antes das questões.",
      "Progressão gradual de dificuldade.",
    ],
  },
  consolidacao: {
    label: "Nível 2 — Consolidação",
    guidance: [
      "Questões intermediárias de aplicação do conteúdo.",
      "Problemas contextualizados em situações do cotidiano.",
    ],
  },
  aprofundamento: {
    label: "Nível 3 — Aprofundamento",
    guidance: [
      "Questões mais complexas, com raciocínio aplicado.",
      "Problemas com diferentes etapas de resolução.",
    ],
  },
};

export const ACTIVITY_TYPES = [
  "Exercícios",
  "Questionário",
  "Atividade prática",
  "Revisão",
  "Trabalho",
  "Atividade avaliativa",
] as const;

export const TARGET_GROUPS = ["turma", "menor_aproveitamento", "estudantes_selecionados"] as const;
export type TargetGroup = (typeof TARGET_GROUPS)[number];
export const TARGET_LABELS: Record<TargetGroup, string> = {
  turma: "Turma toda",
  menor_aproveitamento: "Estudantes com menor aproveitamento no conteúdo",
  estudantes_selecionados: "Estudantes selecionados pelo professor",
};

export const QUESTION_TYPES = ["multipla_escolha", "resposta_curta", "dissertativa"] as const;

export const QuestionSchema = z.object({
  number: z.number().int().describe("Número da questão, começando em 1"),
  type: z.enum(QUESTION_TYPES),
  statement: z.string().describe("Enunciado completo da questão"),
  options: z
    .array(z.string())
    .describe("Alternativas sem letra no início (para multipla_escolha, exatamente 4); lista vazia nos outros tipos"),
});

export const AnswerSchema = z.object({
  question: z.number().int().describe("Número da questão a que esta resposta se refere"),
  answer: z.string().describe("Para multipla_escolha, só a letra (A, B, C ou D); nos outros tipos, a resposta esperada"),
  explanation: z.string().describe("Como chegar à resposta, em linguagem para o professor"),
});

export const WorkedExampleSchema = z.object({
  problem: z.string(),
  solution: z.string().describe("Resolução passo a passo"),
});

/** O que o modelo gera. Turma, conteúdo, nível etc. vêm da solicitação, não do modelo. */
export const GeneratedActivitySchema = z.object({
  title: z.string(),
  instructions: z.string().describe("Instruções para o estudante"),
  worked_examples: z.array(WorkedExampleSchema),
  questions: z.array(QuestionSchema),
  answer_key: z.array(AnswerSchema),
  teacher_guidance: z.string().describe("Orientação ao professor para aplicar e corrigir a atividade"),
  personalization_rationale: z
    .string()
    .describe("Por que a atividade foi feita assim, citando apenas dados agregados da turma"),
});
export type GeneratedActivity = z.infer<typeof GeneratedActivitySchema>;

export interface ActivityDraft extends GeneratedActivity {
  subject: string;
  content: string;
  skill: string;
  objective: string;
  target_group: TargetGroup;
  complexity: Complexity;
  activity_type: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  question?: number;
}

const filled = (s: string | null | undefined, min = 1) => (s ?? "").trim().length >= min;

/**
 * Checagens estruturais e de segurança, sem IA. Uma atividade só é salva ou
 * aprovada quando esta lista está vazia.
 */
export function validateActivityStructure(
  a: Pick<
    ActivityDraft,
    "title" | "instructions" | "worked_examples" | "questions" | "answer_key" | "teacher_guidance" | "objective" | "content" | "complexity"
  > & { personalization_rationale?: string | null },
  expected: { questionCount?: number; complexity?: Complexity; content?: string },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (code: string, message: string, question?: number) => issues.push({ code, message, question });

  if (!filled(a.title, 3)) push("titulo", "A atividade precisa de um título.");
  if (!filled(a.instructions, 15)) push("instrucoes", "As instruções estão vazias ou curtas demais.");
  if (!filled(a.objective, 10)) push("objetivo", "O objetivo pedagógico está vazio ou curto demais.");
  if (!filled(a.teacher_guidance, 15)) push("orientacao", "Falta a orientação ao professor.");
  if (expected.complexity && a.complexity !== expected.complexity)
    push("nivel", `O nível da atividade (${a.complexity}) não é o nível solicitado (${expected.complexity}).`);
  if (expected.content && normalize(a.content) !== normalize(expected.content))
    push("conteudo", `O conteúdo da atividade não corresponde ao conteúdo solicitado (${expected.content}).`);
  if (a.complexity === "reforco" && !a.worked_examples.some((w) => filled(w.problem, 5) && filled(w.solution, 5)))
    push("exemplo_resolvido", "Atividades de reforço precisam de pelo menos um exemplo resolvido.");

  const qs = a.questions;
  if (!qs.length) push("questoes", "A atividade não tem questões.");
  if (expected.questionCount != null && qs.length !== expected.questionCount)
    push("quantidade", `Foram solicitadas ${expected.questionCount} questões, mas a atividade tem ${qs.length}.`);

  qs.forEach((q, i) => {
    const n = i + 1;
    if (q.number !== n) push("numeracao", `A questão na posição ${n} está numerada como ${q.number}.`, n);
    if (!filled(q.statement, 10)) push("enunciado", `A questão ${n} não tem enunciado completo.`, n);
    if (q.type === "multipla_escolha") {
      const opts = q.options.map((o) => o.trim());
      if (opts.length < 3 || opts.length > 5) push("alternativas", `A questão ${n} precisa de 3 a 5 alternativas.`, n);
      if (opts.some((o) => !o)) push("alternativas", `A questão ${n} tem alternativa vazia.`, n);
      if (new Set(opts.map(normalize)).size !== opts.length) push("alternativas", `A questão ${n} tem alternativas repetidas.`, n);
    } else if (q.options.some((o) => o.trim())) {
      push("alternativas", `A questão ${n} não é de múltipla escolha, mas tem alternativas.`, n);
    }
  });

  const answers = new Map(a.answer_key.map((k) => [k.question, k]));
  if (a.answer_key.length !== qs.length) push("gabarito", "O gabarito precisa ter exatamente uma resposta por questão.");
  qs.forEach((q, i) => {
    const n = i + 1;
    const k = answers.get(q.number);
    if (!k || !filled(k.answer)) {
      push("gabarito", `Falta a resposta da questão ${n} no gabarito.`, n);
      return;
    }
    if (q.type === "multipla_escolha") {
      const letter = k.answer.trim().toUpperCase().replace(/[^A-Z]/g, "");
      const idx = letter.length === 1 ? letter.charCodeAt(0) - 65 : -1;
      if (idx < 0 || idx >= q.options.length)
        push("gabarito", `A resposta da questão ${n} (${k.answer}) não corresponde a nenhuma alternativa.`, n);
    }
  });

  const studentText = [
    a.title,
    a.instructions,
    ...a.worked_examples.flatMap((w) => [w.problem, w.solution]),
    ...qs.flatMap((q) => [q.statement, ...q.options]),
  ].join("\n");
  if (mentionsStudentCode(studentText))
    push("privacidade", "O material do estudante não pode citar códigos ou dados de estudantes específicos.");

  const allText = [studentText, a.teacher_guidance, a.personalization_rationale ?? "", ...a.answer_key.map((k) => k.explanation)].join("\n");
  const forbidden = findForbiddenTerms(allText);
  if (forbidden.length)
    push("linguagem", `O texto usa termos não permitidos (${forbidden.join(", ")}). A IA não faz diagnósticos nem rótulos.`);

  return issues;
}
