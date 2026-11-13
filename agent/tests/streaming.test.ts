/**
 * Progresso em tempo real: o agente emite eventos enquanto trabalha e a rota
 * transmite em NDJSON quando o navegador pede (Accept: application/x-ndjson).
 */
import { describe, expect, it } from "vitest";
import { runAnalysis } from "../src/lib/agent/tasks";
import type { AgentEvent } from "../src/lib/agent/events";
import { AppError } from "../src/lib/errors";
import { NDJSON, respond } from "../src/lib/http";
import { CLASS_ID, InMemoryRepository, ScriptedProvider, TEACHER, call, done, seedClass } from "./helpers";

const classInfo = { id: CLASS_ID, name: "5º Ano A", grade: "5º ano", school_year: 2026 };

function analysisProvider() {
  return new ScriptedProvider([
    () => call("buscar_resultados", { class_id: CLASS_ID }),
    () => call("analisar_desempenho", {}),
    () =>
      call("registrar_analise", {
        summary: "Na avaliação de multiplicação, a turma teve aproveitamento médio de 58%. Dois dos cinco estudantes ficaram abaixo de 50%.",
        attention_points: ["E2 e E3 ficaram abaixo de 50%."],
        recommendations: [{ text: "Exercícios introdutórios e progressivos.", evidence: "Média de 58% no conteúdo." }],
      }),
    () => done("Análise registrada."),
  ]);
}

function seeded() {
  const repo = new InMemoryRepository();
  seedClass(repo, [{ title: "Multiplicação", content: "Multiplicação", date: "2026-09-15", total: 10, scores: [8, 4, 3, 9, 5] }]);
  return repo;
}

async function readLines(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("eventos do agente", () => {
  it("emite conferência, pensamento, ferramentas e as mesmas etapas que voltam em operations", async () => {
    const events: AgentEvent[] = [];
    const provider = analysisProvider();
    const out = await runAnalysis(
      { repo: seeded(), teacherId: TEACHER, classInfo, provider: () => provider, emit: (e) => events.push(e) },
      { kind: "analysis", classId: CLASS_ID },
    );

    expect(events[0]).toEqual({ type: "status", phase: "checking", label: "Conferindo os dados da turma" });
    expect(events.some((e) => e.type === "status" && e.phase === "thinking")).toBe(true);
    const tools = events.filter((e) => e.type === "status" && e.phase === "tool").map((e) => (e as { tool?: string }).tool);
    expect(tools).toEqual(["buscar_resultados", "analisar_desempenho", "registrar_analise"]);
    const steps = events.filter((e) => e.type === "step").map((e) => (e as { text: string }).text);
    expect(steps).toEqual(out.operations);
  });

  it("sem resultados, só a conferência é emitida e a IA não é acionada", async () => {
    const events: AgentEvent[] = [];
    let created = false;
    const out = await runAnalysis(
      {
        repo: new InMemoryRepository(),
        teacherId: TEACHER,
        classInfo,
        provider: () => {
          created = true;
          return analysisProvider();
        },
        emit: (e) => events.push(e),
      },
      { kind: "analysis", classId: CLASS_ID },
    );
    expect(out.status).toBe("insufficient_data");
    expect(created).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["status"]);
  });
});

describe("respond", () => {
  const req = (accept?: string) =>
    new Request("http://localhost/api/x", { method: "POST", headers: accept ? { accept, origin: "http://localhost:5500" } : {} });

  it("sem pedir stream, devolve o JSON de sempre com o status da rota", async () => {
    const res = await respond(req(), 201, async (emit) => {
      emit({ type: "step", text: "ignorado" });
      return { ok: true };
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("com Accept NDJSON, transmite os eventos e termina com o resultado", async () => {
    const res = await respond(req(NDJSON), 201, async (emit) => {
      emit({ type: "status", phase: "thinking", label: "Pensando no próximo passo" });
      emit({ type: "step", text: "Consultou 1 avaliação(ões)." });
      return { ok: true };
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(NDJSON);
    const lines = await readLines(res);
    expect(lines.map((l) => l.type)).toEqual(["status", "step", "result"]);
    expect(lines[2]).toEqual({ type: "result", status: 201, data: { ok: true } });
  });

  it("um erro no meio vira uma linha de erro com o mesmo corpo da resposta JSON", async () => {
    const res = await respond(req(NDJSON), 200, async (emit) => {
      emit({ type: "step", text: "Consultou 1 avaliação(ões)." });
      throw new AppError("AI_TIMEOUT", "A IA demorou demais para responder. Tente de novo.");
    });
    const lines = await readLines(res);
    expect(lines.at(-1)).toEqual({
      type: "error",
      status: 504,
      error: { code: "AI_TIMEOUT", message: "A IA demorou demais para responder. Tente de novo.", retryable: true, details: null },
    });
  });

  it("erro inesperado não vaza detalhes internos", async () => {
    const res = await respond(req(NDJSON), 200, async () => {
      throw new Error("senha do banco: xyz");
    });
    const lines = await readLines(res);
    expect(JSON.stringify(lines)).not.toContain("xyz");
    expect((lines.at(-1) as { error: { code: string } }).error.code).toBe("INTERNAL");
  });
});
