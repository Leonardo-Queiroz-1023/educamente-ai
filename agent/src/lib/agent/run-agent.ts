/**
 * Loop do agente: o modelo pede ferramentas, o backend executa de verdade,
 * devolve os resultados e repete até o modelo terminar.
 */
import { AppError, ToolInputError } from "../errors";
import type { ToolResult } from "../ai/provider";
import type { RunContext } from "./context";
import { TOOL_LABELS } from "./events";
import { toToolSpec, type AgentTool } from "./tools";

const MAX_ITERATIONS = 16;

export async function runAgent(ctx: RunContext, opts: { system: string; userMessage: string; tools: AgentTool[] }): Promise<string> {
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const session = ctx.provider.startSession({ system: opts.system, tools: opts.tools.map(toToolSpec) });
  const thinking = () => ctx.emit({ type: "status", phase: "thinking", label: "Pensando no próximo passo" });
  thinking();
  let turn = await session.send(opts.userMessage);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (turn.stopReason === "refusal") {
      throw new AppError("AI_REFUSAL", "A IA recusou continuar esta solicitação. Revise os dados e tente de novo.");
    }
    if (turn.stopReason === "max_tokens") {
      throw new AppError("AI_INVALID_RESPONSE", "A resposta da IA foi interrompida no meio. Tente de novo.");
    }
    if (!turn.toolCalls.length) return turn.text;

    // Ferramentas rodam em sequência: cada uma depende do estado deixado pela anterior.
    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      const tool = byName.get(call.name);
      if (!tool) {
        results.push({ id: call.id, isError: true, content: `Ferramenta desconhecida: ${call.name}.` });
        continue;
      }
      const parsed = tool.schema.safeParse(call.input);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((iss) => `${iss.path.join(".") || "entrada"}: ${iss.message}`).join("; ");
        ctx.toolErrors.push(`${call.name}: argumentos inválidos`);
        results.push({ id: call.id, isError: true, content: `Argumentos inválidos para ${call.name}: ${msg}` });
        continue;
      }
      try {
        ctx.emit({ type: "status", phase: "tool", tool: call.name, label: TOOL_LABELS[call.name] ?? call.name });
        const out = await tool.run(ctx, parsed.data);
        results.push({ id: call.id, content: JSON.stringify(out) });
      } catch (error) {
        if (error instanceof ToolInputError) {
          ctx.toolErrors.push(`${call.name}: ${error.message}`);
          results.push({ id: call.id, isError: true, content: error.message });
          continue;
        }
        // Falhas de banco, de autenticação ou do provedor interrompem a execução.
        throw error;
      }
    }
    thinking();
    turn = await session.sendToolResults(results);
  }
  throw new AppError("AGENT_INCOMPLETE", "A IA não concluiu a tarefa no número de passos permitido. Tente de novo.");
}
