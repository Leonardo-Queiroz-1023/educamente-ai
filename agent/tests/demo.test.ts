import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { runAnalysis } from "../src/lib/agent/tasks";
import { DEMO_TEACHER_ID, SnapshotSchema, requireDemo, snapshotRepository } from "../src/lib/demo";
import { ScriptedProvider, call, done } from "./helpers";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const req = (origin?: string) => new Request("http://localhost:3000/api/demo/analyze", { method: "POST", headers: origin ? { origin } : {} });

function snapshot() {
  const classId = randomUUID();
  const students = Array.from({ length: 5 }, () => ({ id: randomUUID() }));
  const assessmentId = randomUUID();
  return SnapshotSchema.parse({
    class: { id: classId, name: "5º Ano A", grade: "5º ano" },
    students,
    assessments: [{ id: assessmentId, title: "Multiplicação", subject: "Matemática", content: "Multiplicação", assessment_date: "2026-09-15", total_points: 10 }],
    results: [8, 4, 3, 9, 5].map((score, i) => ({ id: randomUUID(), assessment_id: assessmentId, student_id: students[i].id, score })),
  });
}

describe("modo demonstração", () => {
  it("fica desligado por padrão e exige origem autorizada", () => {
    delete process.env.DEMO_MODE;
    expect(() => requireDemo(req("http://127.0.0.1:5500"))).toThrow(/desligado/);

    process.env.DEMO_MODE = "true";
    process.env.ALLOWED_ORIGINS = "http://127.0.0.1:5500";
    expect(() => requireDemo(req("http://site-estranho.com"), { rateLimit: false })).toThrow(/Origem/);
    expect(() => requireDemo(req(), { rateLimit: false })).toThrow(/Origem/);
    expect(() => requireDemo(req("http://127.0.0.1:5500"), { rateLimit: false })).not.toThrow();
  });

  it("aceita qualquer porta local quando a origem termina em :*", () => {
    process.env.DEMO_MODE = "true";
    process.env.ALLOWED_ORIGINS = "http://localhost:*,http://127.0.0.1:*";
    for (const o of ["http://localhost:5500", "http://127.0.0.1:8080", "http://localhost:3001"]) {
      expect(() => requireDemo(req(o), { rateLimit: false })).not.toThrow();
    }
    // Porta livre não vira domínio livre.
    for (const o of ["http://localhost.evil.com", "http://localhost:80.evil.com", "https://localhost:5500", "http://127.0.0.1"]) {
      expect(() => requireDemo(req(o), { rateLimit: false })).toThrow(/Origem/);
    }
  });

  it("para no teto geral por hora, somando todos os visitantes", () => {
    process.env.DEMO_MODE = "true";
    process.env.ALLOWED_ORIGINS = "http://127.0.0.1:5500";
    process.env.DEMO_GLOBAL_LIMIT_PER_HOUR = "3";
    const de = (ip: string) => new Request("http://localhost:3000/api/demo/grade", { method: "POST", headers: { origin: "http://127.0.0.1:5500", "x-forwarded-for": ip } });
    // IPs diferentes (o limite por IP não chega a atuar); o quarto pedido esbarra no teto geral.
    for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3"]) expect(() => requireDemo(de(ip))).not.toThrow();
    expect(() => requireDemo(de("10.0.0.4"))).toThrow(/Muitas solicitações/);
  });

  it("recusa cópias malformadas ou grandes demais", () => {
    const s = snapshot();
    expect(SnapshotSchema.safeParse({ ...s, class: { ...s.class, id: "demo_t1" } }).success).toBe(false);
    expect(SnapshotSchema.safeParse({ ...s, students: Array.from({ length: 81 }, () => ({ id: randomUUID() })) }).success).toBe(false);
  });

  it("roda o agente real sobre a cópia, sem banco", async () => {
    const s = snapshot();
    const { repo, classInfo } = snapshotRepository(s);
    const provider = new ScriptedProvider([
      () => call("buscar_resultados", { class_id: classInfo.id }),
      () => call("analisar_desempenho", {}),
      () =>
        call("registrar_analise", {
          summary: "A turma teve aproveitamento médio de 58% em multiplicação.",
          attention_points: ["E2 (40%) e E3 (30%) ficaram abaixo de 50%."],
          recommendations: [{ text: "Exercícios progressivos de multiplicação.", evidence: "Média de 58%." }],
        }),
      () => done(),
    ]);
    const out = await runAnalysis({ repo, teacherId: DEMO_TEACHER_ID, classInfo, provider: () => provider }, { kind: "analysis", classId: classInfo.id });
    expect(out.status).toBe("ok");
    expect(out.evidence?.overall_mean).toBe(58);
    // A legenda devolve os mesmos ids que o navegador enviou, para ele traduzir em nomes.
    expect(out.students.map((x) => x.student_id).sort()).toEqual(s.students.map((x) => x.id).sort());
  });
});
