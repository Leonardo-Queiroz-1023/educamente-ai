/**
 * Adaptador Claude (Anthropic). Único arquivo que conhece o SDK do provedor.
 *
 * - Modelo padrão: claude-opus-5-5 (AI_MODEL troca). Pensamento adaptativo é
 *   sempre ligado neste modelo; a profundidade é controlada por effort.
 * - Fallback no servidor em caso de recusa por classificador de segurança
 *   (betas server-side-fallback + fallbacks: "default").
 * - O histórico guarda response.content inteiro (inclusive blocos de thinking),
 *   como a API exige para continuar a conversa com ferramentas.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AppError } from "../errors";
import type { AiProvider, ChatSession, StopReason, ToolResult, ToolSpec, TurnResult } from "./provider";

const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];
const MAX_TOKENS = 16000;
const EFFORT = "high" as const;

function mapError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    throw new AppError("AI_AUTH", "A chave da API de IA é inválida ou não tem permissão. Confira AI_PROVIDER_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new AppError("AI_RATE_LIMIT", "O limite de uso da IA foi atingido. Aguarde alguns instantes e tente de novo.");
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    throw new AppError("AI_TIMEOUT", "A IA demorou demais para responder. Tente de novo.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    throw new AppError("AI_UNAVAILABLE", "Não foi possível conectar ao serviço de IA. Verifique a internet do servidor.");
  }
  if (error instanceof Anthropic.NotFoundError) {
    throw new AppError("SERVER_NOT_CONFIGURED", "O modelo configurado em AI_MODEL não foi encontrado.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    throw new AppError("AI_INVALID_RESPONSE", "A solicitação à IA foi recusada como inválida. Tente de novo.", {
      provider_message: error.message,
    });
  }
  if (error instanceof Anthropic.APIError) {
    throw new AppError("AI_UNAVAILABLE", "O serviço de IA está instável no momento. Tente de novo em instantes.", {
      status: error.status ?? null,
    });
  }
  throw error;
}

function stopReason(r: Anthropic.Beta.BetaMessage["stop_reason"]): StopReason {
  if (r === "end_turn" || r === "tool_use" || r === "max_tokens" || r === "refusal") return r;
  return "other";
}

class AnthropicSession implements ChatSession {
  private readonly messages: Anthropic.Beta.BetaMessageParam[] = [];

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly system: string,
    private readonly tools: Anthropic.Beta.BetaTool[],
  ) {}

  send(text: string): Promise<TurnResult> {
    this.messages.push({ role: "user", content: text });
    return this.call();
  }

  sendToolResults(results: ToolResult[]): Promise<TurnResult> {
    // Todos os resultados de um turno vão juntos numa única mensagem.
    this.messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    });
    return this.call();
  }

  private async call(): Promise<TurnResult> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: this.system,
        tools: this.tools,
        messages: this.messages,
        output_config: { effort: EFFORT },
        betas: BETAS,
        fallbacks: "default",
      });
    } catch (error) {
      mapError(error);
    }
    this.messages.push({ role: "assistant", content: response.content });

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolCalls = response.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    return { text, toolCalls, stopReason: stopReason(response.stop_reason) };
  }
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });
  }

  startSession({ system, tools }: { system: string; tools: ToolSpec[] }): ChatSession {
    const defs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool["input_schema"],
    }));
    return new AnthropicSession(this.client, this.model, system, defs);
  }

  async generateStructured<S extends z.ZodType>({
    system,
    prompt,
    schema,
  }: {
    system: string;
    prompt: string;
    schema: S;
  }): Promise<z.infer<S>> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: EFFORT, format: betaZodOutputFormat(schema) },
        betas: BETAS,
        fallbacks: "default",
      });
    } catch (error) {
      mapError(error);
    }
    if (response.stop_reason === "refusal") {
      throw new AppError("AI_REFUSAL", "A IA recusou gerar este conteúdo. Revise as informações enviadas e tente de novo.");
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      throw new AppError("AI_INVALID_RESPONSE", "A IA devolveu uma resposta incompleta. Tente de novo.");
    }
    return response.parsed_output as z.infer<S>;
  }
}
