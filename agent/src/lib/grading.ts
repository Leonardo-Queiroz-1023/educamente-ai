/**
 * Correção de questões dissertativas pela IA (modo demonstração do portal da escola).
 * As objetivas são corrigidas pelo gabarito no navegador; aqui só chegam as
 * dissertativas, sem nome de estudante: cada entrega vem identificada por um id opaco.
 */
import { z } from "zod";
import type { AiProvider } from "./ai/provider";

const id = z.string().regex(/^[\w-]{1,40}$/);

export const GradeRequestSchema = z.object({
  activity: z.object({
    title: z.string().trim().min(1).max(200),
    subject: z.string().trim().max(80).default(""),
    questions: z
      .array(
        z.object({
          index: z.number().int().min(0).max(50),
          statement: z.string().trim().min(1).max(1500),
          expected_answer: z.string().trim().max(2000).default(""),
          points: z.number().positive().max(100),
        }),
      )
      .min(1)
      .max(10),
  }),
  submissions: z
    .array(
      z.object({
        id,
        answers: z.array(z.object({ index: z.number().int().min(0).max(50), answer: z.string().max(4000) })).max(10),
      }),
    )
    .min(1)
    .max(60),
});
export type GradeRequest = z.infer<typeof GradeRequestSchema>;

const GradeOutputSchema = z.object({
  grades: z.array(
    z.object({
      submission_id: z.string(),
      index: z.number().int(),
      points: z.number(),
      correct: z.boolean(),
      comment: z.string().max(600),
      errors: z.array(z.string().max(120)).max(5),
    }),
  ),
  summary: z.string().max(1500),
});

export interface GradeResult {
  grades: z.infer<typeof GradeOutputSchema>["grades"];
  summary: string;
  provider: string;
  model: string;
}

const SYSTEM = `Você é um professor experiente corrigindo questões dissertativas do ensino fundamental II (6º ao 9º ano) e do ensino médio, em português do Brasil.
Para cada resposta: atribua uma pontuação entre 0 e o valor da questão (meio ponto é permitido), diga se está correta
(atinge o essencial da resposta esperada), escreva um comentário curto e construtivo dirigido ao estudante, e liste
até 3 erros como rótulos curtos e reutilizáveis (ex.: "Erro de sinal ao mudar de lado", "Não citou a glicose"),
usando o MESMO rótulo para o mesmo erro em respostas diferentes, para que o professor veja os erros recorrentes.
Resposta em branco vale 0 com o erro "Resposta em branco". Não invente fatos sobre o estudante.
No resumo (até 4 frases), descreva para o professor os erros mais frequentes da turma e uma sugestão de retomada.`;

export async function gradeOpenAnswers(provider: AiProvider, req: GradeRequest): Promise<GradeResult> {
  const questions = new Map(req.activity.questions.map((q) => [q.index, q]));
  const submissionIds = new Set(req.submissions.map((s) => s.id));
  const prompt = JSON.stringify({
    atividade: req.activity.title,
    componente: req.activity.subject,
    questoes: req.activity.questions,
    entregas: req.submissions.map((s) => ({
      id: s.id,
      respostas: s.answers.filter((a) => questions.has(a.index)),
    })),
  });
  const out = await provider.generateStructured({
    system: SYSTEM,
    prompt: `Corrija todas as respostas abaixo (uma nota por entrega e questão).\n${prompt}`,
    schema: GradeOutputSchema,
  });
  // A IA não decide o que existe: só entregas e questões enviadas, nota dentro do valor da questão.
  const seen = new Set<string>();
  const grades = out.grades
    .filter((g) => submissionIds.has(g.submission_id) && questions.has(g.index))
    .filter((g) => {
      const key = `${g.submission_id}:${g.index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((g) => {
      const max = questions.get(g.index)!.points;
      return { ...g, points: Math.min(max, Math.max(0, Math.round(g.points * 2) / 2)) };
    });
  return { grades, summary: out.summary, provider: provider.id, model: provider.model };
}
