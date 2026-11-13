import { describe, expect, it } from "vitest";
import { GradeRequestSchema, gradeOpenAnswers } from "../src/lib/grading";
import { ScriptedProvider } from "./helpers";

const request = () =>
  GradeRequestSchema.parse({
    activity: {
      title: "Equações do 1º grau",
      subject: "Matemática",
      questions: [
        { index: 3, statement: "Resolva 5x − 3 = 2x + 9.", expected_answer: "3x = 12, x = 4", points: 4 },
      ],
    },
    submissions: [
      { id: "ent1", answers: [{ index: 3, answer: "3x = 12, logo x = 4" }] },
      { id: "ent2", answers: [{ index: 3, answer: "7x = 6" }] },
    ],
  });

describe("correção de dissertativas pela IA", () => {
  it("limita a pontuação ao valor da questão e descarta entregas ou questões desconhecidas", async () => {
    const provider = new ScriptedProvider([], [
      {
        grades: [
          { submission_id: "ent1", index: 3, points: 9, correct: true, comment: "Correta.", errors: [] },
          { submission_id: "ent2", index: 3, points: -2, correct: false, comment: "Somou os termos com x de lados opostos.", errors: ["Sinal ao mudar de lado"] },
          { submission_id: "inventada", index: 3, points: 4, correct: true, comment: "x", errors: [] },
          { submission_id: "ent1", index: 0, points: 4, correct: true, comment: "x", errors: [] },
        ],
        summary: "Metade da turma errou o sinal ao mudar termos de lado.",
      },
    ]);
    const out = await gradeOpenAnswers(provider, request());
    expect(out.grades).toHaveLength(2);
    expect(out.grades.find((g) => g.submission_id === "ent1")?.points).toBe(4);
    expect(out.grades.find((g) => g.submission_id === "ent2")?.points).toBe(0);
    expect(out.summary).toMatch(/sinal/);
    expect(out.provider).toBe("teste-roteirizado");
  });

  it("recusa pedidos sem questões ou com entregas demais", () => {
    const r = request();
    expect(GradeRequestSchema.safeParse({ ...r, activity: { ...r.activity, questions: [] } }).success).toBe(false);
    const muitas = Array.from({ length: 61 }, (_, i) => ({ id: `e${i}`, answers: [] }));
    expect(GradeRequestSchema.safeParse({ ...r, submissions: muitas }).success).toBe(false);
  });
});
