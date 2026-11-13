/**
 * Adaptador OpenRouter (https://openrouter.ai). Uma chave dá acesso a vários
 * modelos (Gemini, Claude, Llama...) pela API no formato da OpenAI.
 *
 * - Chave criada em https://openrouter.ai/keys (OPENROUTER_API_KEY ou AI_PROVIDER_API_KEY).
 * - Sem SDK: usa fetch, então não há dependência nova.
 * - O histórico guarda a mensagem do modelo inteira (inclusive reasoning_details),
 *   que alguns modelos exigem para continuar a conversa com ferramentas.
 */
import { z } from "zod";
import { AppError } from "../errors";
import type { AiProvider, ChatSession, StopReason, ToolResult, ToolSpec, TurnResult } from "./provider";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 4;
const MAX_WAIT_MS = 60_000;
/** Depois disso não há nova tentativa: o professor recebe o erro em vez de esperar indefinidamente. */
const RETRY_BUDGET_MS = 90_000;

/** Espera entre tentativas. Substituível nos testes para não esperar de verdade. */
export const retryTiming = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

type Fetch = typeof fetch;

interface OrToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type OrMessage =
  | { role: "system" | "user"; content: string }
  | { role: "tool"; tool_call_id: string; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OrToolCall[]; [extra: string]: unknown };

interface OrResponse {
  choices?: {
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    message?: { role: "assistant"; content: string | null; tool_calls?: OrToolCall[]; refusal?: string | null };
    error?: { code?: number; message?: string };
  }[];
  error?: { code?: number; message?: string };
}

/** Erro HTTP (ou erro dentro do corpo) devolvido pelo OpenRouter. */
export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

async function post(fetchFn: Fetch, apiKey: string, body: Record<string, unknown>): Promise<OrResponse> {
  const res = await fetchFn(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "EducaMente AI",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: OrResponse = {};
  try {
    json = text ? (JSON.parse(text) as OrResponse) : {};
  } catch {
    if (!res.ok) throw new OpenRouterError(res.status, text.slice(0, 300));
    throw new AppError("AI_INVALID_RESPONSE", "O OpenRouter devolveu uma resposta ilegível. Tente de novo.");
  }
  if (!res.ok || json.error) {
    const status = res.ok ? (json.error?.code ?? 502) : res.status;
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new OpenRouterError(
      status,
      json.error?.message ?? `HTTP ${res.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  // O provedor por trás pode falhar depois do 200: o erro vem dentro da escolha.
  const choiceError = json.choices?.[0]?.error;
  if (choiceError) throw new OpenRouterError(choiceError.code ?? 502, choiceError.message ?? "erro do provedor");
  return json;
}

/** 429 (limite por minuto) e 502/503 (provedor sobrecarregado) costumam passar sozinhos. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const firstStart = Date.now();
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const out = await fn();
      if (process.env.AI_DEBUG) console.log(`[openrouter] ${label}: ok em ${Date.now() - started} ms`);
      return out;
    } catch (error) {
      if (process.env.AI_DEBUG) {
        console.log(`[openrouter] ${label}: erro ${error instanceof OpenRouterError ? error.status : (error as Error).name} em ${Date.now() - started} ms`);
      }
      const transient = error instanceof OpenRouterError && [429, 502, 503].includes(error.status);
      if (!transient || attempt >= MAX_RETRIES) throw error;
      const waitMs = Math.min(error.retryAfterMs ?? 5_000 * 2 ** attempt, MAX_WAIT_MS);
      if (Date.now() - firstStart + waitMs > RETRY_BUDGET_MS) throw error;
      await retryTiming.sleep(waitMs);
    }
  }
}

function mapError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof OpenRouterError) {
    if (error.status === 401 || error.status === 403) {
      throw new AppError("AI_AUTH", "A chave do OpenRouter é inválida ou não tem permissão. Confira OPENROUTER_API_KEY.");
    }
    if (error.status === 402) {
      throw new AppError("AI_RATE_LIMIT", "A conta do OpenRouter está sem créditos. Adicione créditos em openrouter.ai e tente de novo.");
    }
    if (error.status === 429) {
      throw new AppError("AI_RATE_LIMIT", "O limite de uso do OpenRouter foi atingido. Aguarde alguns instantes e tente de novo.");
    }
    if (error.status === 408 || error.status === 504) {
      throw new AppError("AI_TIMEOUT", "O modelo demorou demais para responder. Tente de novo.");
    }
    if (error.status === 404) {
      throw new AppError("SERVER_NOT_CONFIGURED", "O modelo configurado em AI_MODEL não foi encontrado no OpenRouter.");
    }
    if (error.status === 400) {
      throw new AppError("AI_INVALID_RESPONSE", "A solicitação ao OpenRouter foi recusada como inválida. Tente de novo.", {
        provider_message: error.message.slice(0, 300),
      });
    }
    throw new AppError("AI_UNAVAILABLE", "O OpenRouter está instável no momento. Tente de novo em instantes.", {
      status: error.status,
      provider_message: error.message.slice(0, 300),
    });
  }
  if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) {
    throw new AppError("AI_TIMEOUT", "A IA demorou demais para responder. Tente de novo.");
  }
  if (error instanceof TypeError) {
    throw new AppError("AI_UNAVAILABLE", "Não foi possível conectar ao OpenRouter. Verifique a internet do servidor.");
  }
  throw error;
}

function stopReason(finish: string | null | undefined, calls: number, refusal?: string | null): StopReason {
  if (refusal || finish === "content_filter") return "refusal";
  if (finish === "length") return "max_tokens";
  if (calls || finish === "tool_calls") return "tool_use";
  return finish === "stop" || !finish ? "end_turn" : "other";
}

function parseArgs(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Argumentos quebrados chegam ao agente como string: a validação da ferramenta devolve o erro ao modelo.
    return raw;
  }
}

class OpenRouterSession implements ChatSession {
  private readonly messages: OrMessage[];

  constructor(
    private readonly fetchFn: Fetch,
    private readonly apiKey: string,
    private readonly model: string,
    system: string,
    private readonly tools: ToolSpec[],
  ) {
    this.messages = [{ role: "system", content: system }];
  }

  send(text: string): Promise<TurnResult> {
    this.messages.push({ role: "user", content: text });
    return this.call();
  }

  sendToolResults(results: ToolResult[]): Promise<TurnResult> {
    for (const r of results) {
      this.messages.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `ERRO: ${r.content}` : r.content });
    }
    return this.call();
  }

  private async call(): Promise<TurnResult> {
    let response: OrResponse;
    try {
      response = await withRetry("turno do agente", () =>
        post(this.fetchFn, this.apiKey, {
          model: this.model,
          messages: this.messages,
          tools: this.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          // Turnos do agente só escolhem a próxima ferramenta: raciocínio curto basta.
          reasoning: { effort: "low" },
        }),
      );
    } catch (error) {
      mapError(error);
    }

    const choice = response.choices?.[0];
    const message = choice?.message;
    if (!message) throw new AppError("AI_INVALID_RESPONSE", "A IA devolveu uma resposta vazia. Tente de novo.");
    this.messages.push({ ...message, role: "assistant" });

    const toolCalls = (message.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      input: parseArgs(c.function.arguments),
    }));
    return {
      text: (message.content ?? "").trim(),
      toolCalls,
      stopReason: stopReason(choice.finish_reason, toolCalls.length, message.refusal),
    };
  }
}

export class OpenRouterProvider implements AiProvider {
  readonly id = "openrouter";
  private readonly fetchFn: Fetch;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    /** Só para testes: injeta um fetch falso. */
    fetchFn?: Fetch,
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  startSession({ system, tools }: { system: string; tools: ToolSpec[] }): ChatSession {
    return new OpenRouterSession(this.fetchFn, this.apiKey, this.model, system, tools);
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
    let response: OrResponse;
    try {
      response = await withRetry("saída estruturada", () =>
        post(this.fetchFn, this.apiKey, {
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          // strict: false — schemas com campos opcionais não seguem as regras do modo estrito;
          // a validação com zod abaixo continua sendo a garantia.
          response_format: { type: "json_schema", json_schema: { name: "resposta", strict: false, schema: jsonSchema } },
          // Só encaminha para provedores que respeitam o schema.
          provider: { require_parameters: true },
        }),
      );
    } catch (error) {
      mapError(error);
    }
    const choice = response.choices?.[0];
    const reason = stopReason(choice?.finish_reason, 0, choice?.message?.refusal);
    if (reason === "refusal") {
      throw new AppError("AI_REFUSAL", "A IA recusou gerar este conteúdo. Revise as informações enviadas e tente de novo.");
    }
    if (reason === "max_tokens") {
      throw new AppError("AI_INVALID_RESPONSE", "A IA devolveu uma resposta incompleta. Tente de novo.");
    }
    // A saída é validada pelo schema: JSON quebrado ou campos faltando viram erro, nunca dado salvo.
    let data: unknown;
    try {
      const raw = (choice?.message?.content ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      data = JSON.parse(raw);
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
