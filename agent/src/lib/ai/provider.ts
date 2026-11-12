/**
 * Contrato neutro entre o agente e o provedor de IA. O agente (src/lib/agent)
 * depende só destes tipos; trocar de provedor = escrever outro adaptador.
 */
import type { z } from "zod";

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema do objeto de entrada. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  content: string;
  isError?: boolean;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface TurnResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
}

/** Uma conversa com ferramentas. O adaptador guarda o histórico no formato do provedor. */
export interface ChatSession {
  send(text: string): Promise<TurnResult>;
  sendToolResults(results: ToolResult[]): Promise<TurnResult>;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  startSession(options: { system: string; tools: ToolSpec[] }): ChatSession;
  /** Uma chamada com saída estruturada validada pelo schema. */
  generateStructured<S extends z.ZodType>(options: {
    system: string;
    prompt: string;
    schema: S;
  }): Promise<z.infer<S>>;
}
