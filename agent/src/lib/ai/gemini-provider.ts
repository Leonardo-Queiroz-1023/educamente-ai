/**
 * Adaptador Gemini (Google AI Studio). Único arquivo que conhece o SDK @google/genai.
 *
 * - Chave criada em https://aistudio.google.com/apikey (AI_PROVIDER_API_KEY).
 * - O histórico guarda o conteúdo do modelo inteiro (inclusive assinaturas de
 *   pensamento), como a API exige para continuar a conversa com funções.
 */
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content, type FunctionCall, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { AppError } from "../errors";
import type { AiProvider, ChatSession, StopReason, ToolResult, ToolSpec, TurnResult } from "./provider";

const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 4;
const MAX_WAIT_MS = 60_000;
/** Depois disso não há nova tentativa: o professor recebe o erro em vez de esperar indefinidamente. */
const RETRY_BUDGET_MS = 90_000;

/** Espera entre tentativas. Substituível nos testes para não esperar de verdade. */
export const retryTiming = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

/**
 * Limite por minuto (429) e sobrecarga (503) costumam passar sozinhos: espera o
 * tempo que o Google indica e tenta de novo. Cota diária esgotada não é repetida.
 * O plano gratuito permite poucas requisições por minuto, e uma geração de
 * atividade faz cerca de 9; sem isso ela falharia no meio.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const firstStart = Date.now();
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const out = await fn();
      if (process.env.AI_DEBUG) console.log(`[gemini] ${label}: ok em ${Date.now() - started} ms`);
      return out;
    } catch (error) {
      if (process.env.AI_DEBUG) {
        console.log(`[gemini] ${label}: erro ${error instanceof ApiError ? error.status : (error as Error).name} em ${Date.now() - started} ms`);
      }
      const transient =
        error instanceof ApiError && [429, 503].includes(error.status) && !/per ?day/i.test(error.message);
      if (!transient || attempt >= MAX_RETRIES) throw error;
      const hinted = error.message.match(/retry(?:Delay"?:\s*"| in )(\d+(?:\.\d+)?)s/i);
      const waitMs = Math.min(hinted ? Number(hinted[1]) * 1000 + 500 : 5_000 * 2 ** attempt, MAX_WAIT_MS);
      if (Date.now() - firstStart + waitMs > RETRY_BUDGET_MS) throw error;
      await retryTiming.sleep(waitMs);
    }
  }
}

function mapError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ApiError) {
    // A API do Gemini responde 400 para chave inválida; só a mensagem distingue esse caso.
    if (error.status === 401 || error.status === 403 || (error.status === 400 && /api key/i.test(error.message))) {
      throw new AppError("AI_AUTH", "A chave da API do Gemini é inválida ou não tem permissão. Confira AI_PROVIDER_API_KEY.");
    }
    if (error.status === 429) {
      throw new AppError("AI_RATE_LIMIT", "O limite de uso do Gemini foi atingido. Aguarde alguns instantes e tente de novo.");
    }
    if (error.status === 504) {
      throw new AppError("AI_TIMEOUT", "O Gemini demorou demais para responder. Tente de novo.");
    }
    if (error.status === 404) {
      throw new AppError("SERVER_NOT_CONFIGURED", "O modelo configurado em AI_MODEL não foi encontrado no Gemini.");
    }
    if (error.status === 400) {
      throw new AppError("AI_INVALID_RESPONSE", "A solicitação ao Gemini foi recusada como inválida. Tente de novo.", {
        provider_message: error.message,
      });
    }
    throw new AppError("AI_UNAVAILABLE", "O Gemini está instável no momento. Tente de novo em instantes.", {
      status: error.status,
      provider_message: error.message.slice(0, 300),
    });
  }
  if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) {
    throw new AppError("AI_TIMEOUT", "A IA demorou demais para responder. Tente de novo.");
  }
  if (error instanceof TypeError) {
    throw new AppError("AI_UNAVAILABLE", "Não foi possível conectar ao Gemini. Verifique a internet do servidor.");
  }
  throw error;
}

const BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

function stopReason(r: GenerateContentResponse, calls: number): StopReason {
  if (r.promptFeedback?.blockReason) return "refusal";
  const finish = r.candidates?.[0]?.finishReason;
  if (finish && BLOCKED.has(finish)) return "refusal";
  if (finish === FinishReason.MAX_TOKENS) return "max_tokens";
  if (calls) return "tool_use";
  return finish === FinishReason.STOP || !finish ? "end_turn" : "other";
}

class GeminiSession implements ChatSession {
  private readonly contents: Content[] = [];
  /** id usado pelo agente -> chamada original (o Gemini nem sempre envia id). */
  private readonly pending = new Map<string, FunctionCall>();
  private seq = 0;

  constructor(
    private readonly ai: GoogleGenAI,
    private readonly model: string,
    private readonly system: string,
    private readonly tools: ToolSpec[],
  ) {}

  send(text: string): Promise<TurnResult> {
    this.contents.push({ role: "user", parts: [{ text }] });
    return this.call();
  }

  sendToolResults(results: ToolResult[]): Promise<TurnResult> {
    // Todas as respostas de um turno vão juntas, na mesma ordem das chamadas.
    this.contents.push({
      role: "user",
      parts: results.map((r) => {
        const call = this.pending.get(r.id);
        return {
          functionResponse: {
            ...(call?.id ? { id: call.id } : {}),
            name: call?.name ?? "desconhecida",
            response: r.isError ? { error: r.content } : { output: r.content },
          },
        };
      }),
    });
    this.pending.clear();
    return this.call();
  }

  private async call(): Promise<TurnResult> {
    let response: GenerateContentResponse;
    try {
      response = await withRetry("turno do agente", () => this.ai.models.generateContent({
        model: this.model,
        contents: this.contents,
        config: {
          systemInstruction: this.system,
          // Turnos do agente só escolhem a próxima ferramenta: pensamento curto basta e
          // evita turnos de minutos. Geração e revisão (saída estruturada) usam o padrão.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [
            {
              functionDeclarations: this.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parametersJsonSchema: t.inputSchema,
              })),
            },
          ],
        },
      }));
    } catch (error) {
      mapError(error);
    }

    const content = response.candidates?.[0]?.content;
    if (content) this.contents.push({ ...content, role: "model" });

    const calls = response.functionCalls ?? [];
    const toolCalls = calls.map((c) => {
      const id = c.id ?? `call_${++this.seq}`;
      this.pending.set(id, c);
      return { id, name: c.name ?? "", input: c.args ?? {} };
    });
    const text = (content?.parts ?? [])
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("\n")
      .trim();
    return { text, toolCalls, stopReason: stopReason(response, toolCalls.length) };
  }
}

export class GeminiProvider implements AiProvider {
  readonly id = "gemini";
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    /** Só para testes: injeta um cliente falso. */
    client?: GoogleGenAI,
  ) {
    this.ai = client ?? new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_MS } });
  }

  startSession({ system, tools }: { system: string; tools: ToolSpec[] }): ChatSession {
    return new GeminiSession(this.ai, this.model, system, tools);
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
    const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    let response: GenerateContentResponse;
    try {
      response = await withRetry("saída estruturada", () => this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
      }));
    } catch (error) {
      mapError(error);
    }
    const reason = stopReason(response, 0);
    if (reason === "refusal") {
      throw new AppError("AI_REFUSAL", "A IA recusou gerar este conteúdo. Revise as informações enviadas e tente de novo.");
    }
    if (reason === "max_tokens") {
      throw new AppError("AI_INVALID_RESPONSE", "A IA devolveu uma resposta incompleta. Tente de novo.");
    }
    // A saída é validada pelo schema: JSON quebrado ou campos faltando viram erro, nunca dado salvo.
    let data: unknown;
    try {
      data = JSON.parse(response.text ?? "");
    } catch {
      throw new AppError("AI_INVALID_RESPONSE", "A IA devolveu um formato inválido. Tente de novo.");
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new AppError("AI_INVALID_RESPONSE", "A IA devolveu dados incompletos. Tente de novo.");
    }
    return parsed.data;
  }
}
