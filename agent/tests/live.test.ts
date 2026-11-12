// Teste AO VIVO (opcional): roda o agente com o provedor real e dados fictícios em memória; nada é gravado no banco.
// Uso (Git Bash): set -a; . ./.env.local; set +a; LIVE=1 AI_DEBUG=1 npx vitest run tests/live.test.ts --reporter=verbose
// Sem LIVE=1 ele não faz nada, então não consome cota no npm test.
import { it } from "vitest";
import { createProvider } from "../src/lib/ai";
import { runAnalysis, runGeneration } from "../src/lib/agent/tasks";
import { CLASS_ID, InMemoryRepository, TEACHER, seedClass } from "./helpers";

it("agente ao vivo", { timeout: 600_000 }, async () => {
  if (!process.env.LIVE) return;
  const provider = createProvider;
  const repo = new InMemoryRepository();
  seedClass(repo, [{ title: "Multiplicação", content: "Multiplicação", date: "2026-09-15", total: 10, scores: [8, 4, 3, 9, 5] }]);
  const classInfo = { id: CLASS_ID, name: "5º Ano A", grade: "5º ano", school_year: 2026 };
  const deps = { repo, teacherId: TEACHER, classInfo, provider };

  const t0 = Date.now();
  if (process.env.SKIP_ANALYSIS) { console.log("análise pulada"); } else
  try {
    const a = await runAnalysis(deps, { kind: "analysis", classId: CLASS_ID });
    console.log("\n=== ANÁLISE (" + Math.round((Date.now() - t0) / 1000) + "s) status:", a.status);
    console.log("Resumo:", a.analysis?.summary);
    console.log("Atenção:", a.analysis?.attention_points);
    console.log("Recomendações:", JSON.stringify(a.analysis?.recommendations, null, 1));
    console.log("Operações:", a.operations);
  } catch (e) {
    const err = e as { code?: string; message: string; details?: unknown };
    console.log("\n=== ANÁLISE FALHOU:", err.code, err.message, JSON.stringify(err.details ?? null));
  }

  const t1 = Date.now();
  try {
    const g = await runGeneration(deps, {
      kind: "generation", classId: CLASS_ID, content: "Multiplicação", subject: "Matemática",
      targetGroup: "menor_aproveitamento", studentIds: [], complexity: "reforco", questionCount: 4, activityType: "Exercícios",
    });
    const act = g.activity;
    console.log("\n=== GERAÇÃO (" + Math.round((Date.now() - t1) / 1000) + "s) status:", act.status, "origem:", act.origin);
    console.log("Título:", act.title);
    console.log("Questões:", JSON.stringify(act.questions, null, 1));
    console.log("Gabarito:", JSON.stringify(act.answer_key, null, 1));
    console.log("Validação:", JSON.stringify(g.validation));
    console.log("Operações:", g.operations);
  } catch (e) {
    const err = e as { code?: string; message: string; details?: unknown };
    console.log("\n=== GERAÇÃO FALHOU:", err.code, err.message, JSON.stringify(err.details ?? null));
  }
});
