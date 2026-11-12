/**
 * Dublês de teste. O provedor roteirizado NÃO é IA: ele reproduz uma sequência
 * fixa de chamadas de ferramenta para exercitar o código real do agente
 * (ferramentas, cálculos, validações e gravações). Testes com a IA real:
 * veja agent/README.md, seção "Teste com a IA real".
 */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { AiProvider, ChatSession, ToolResult, TurnResult } from "../src/lib/ai/provider";
import { InMemoryRepository } from "../src/lib/data/memory-repository";

export { InMemoryRepository };

export const TEACHER = "11111111-1111-4111-8111-111111111111";
export const CLASS_ID = "22222222-2222-4222-8222-222222222222";

/** Turma fictícia com 5 estudantes e avaliações com os totais e notas informados. */
export function seedClass(repo: InMemoryRepository, assessments: { title: string; content: string; date: string; total: number; scores: number[] }[]) {
  repo.classes.push({ id: CLASS_ID, name: "5º Ano A", grade: "5º ano", school_year: 2026, teacher_id: TEACHER });
  const studentIds = Array.from({ length: 5 }, (_, i) => {
    const id = randomUUID();
    repo.students.push({ id, class_id: CLASS_ID, created_at: `2026-09-01T10:00:0${i}.000Z` });
    return id;
  });
  for (const a of assessments) {
    const id = randomUUID();
    repo.assessments.push({ id, class_id: CLASS_ID, title: a.title, subject: "Matemática", content: a.content, assessment_date: a.date, total_points: a.total });
    a.scores.forEach((score, i) => repo.results.push({ id: randomUUID(), assessment_id: id, student_id: studentIds[i], score }));
  }
  return { studentIds };
}

export type ScriptStep = (lastResults: ToolResult[], turn: number) => TurnResult;

/** Provedor roteirizado: cada passo devolve o próximo turno do "modelo". */
export class ScriptedProvider implements AiProvider {
  readonly id = "teste-roteirizado";
  readonly model = "roteiro";
  readonly toolResultsSeen: ToolResult[][] = [];
  structuredCalls = 0;

  constructor(
    private readonly steps: ScriptStep[],
    private readonly structured: unknown[] = [],
  ) {}

  startSession(): ChatSession {
    let turn = 0;
    const next = (results: ToolResult[]) => {
      const step = this.steps[turn];
      if (!step) throw new Error(`roteiro sem passo ${turn}`);
      return Promise.resolve(step(results, turn++));
    };
    return {
      send: () => next([]),
      sendToolResults: (results) => {
        this.toolResultsSeen.push(results);
        return next(results);
      },
    };
  }

  async generateStructured<S extends z.ZodType>({ schema }: { schema: S }): Promise<z.infer<S>> {
    const out = this.structured[this.structuredCalls++];
    if (out instanceof Error) throw out;
    return schema.parse(out);
  }
}

export const call = (name: string, input: unknown): TurnResult => ({
  text: "",
  stopReason: "tool_use",
  toolCalls: [{ id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`, name, input }],
});
export const done = (text = "Concluído."): TurnResult => ({ text, stopReason: "end_turn", toolCalls: [] });
