/**
 * Adaptador OpenRouter com um fetch falso (sem rede): confere o formato das
 * mensagens trocadas, o mapeamento de erros e a escolha da chave.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getConfig } from "../src/lib/config";
import { AppError } from "../src/lib/errors";
import { OpenRouterProvider, retryTiming } from "../src/lib/ai/openrouter-provider";

type Body = { model: string; messages: Record<string, unknown>[]; tools?: unknown[]; response_format?: unknown };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const requests: { url: string; headers: Record<string, string>; body: Body }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    const r = responses.shift();
    if (!r) throw new Error("sem resposta preparada");
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

const reply = (message: object, finish_reason = "stop") => ({ body: { choices: [{ finish_reason, message: { role: "assistant", ...message } }] } });

describe("adaptador OpenRouter", () => {
  it("traduz chamadas de ferramenta e devolve os resultados com o id da chamada", async () => {
    const call = { id: "tc_1", type: "function", function: { name: "buscar_resultados", arguments: '{"class_id":"x"}' } };
    const { fetchFn, requests } = fakeFetch([
      reply({ content: null, tool_calls: [call], reasoning_details: [{ type: "reasoning.encrypted", data: "sig" }] }, "tool_calls"),
      reply({ content: "Pronto." }),
    ]);
    const session = new OpenRouterProvider("chave", "google/teste", fetchFn).startSession({
      system: "sistema",
      tools: [{ name: "buscar_resultados", description: "d", inputSchema: { type: "object", properties: {} } }],
    });

    const t1 = await session.send("oi");
    expect(t1).toEqual({ text: "", toolCalls: [{ id: "tc_1", name: "buscar_resultados", input: { class_id: "x" } }], stopReason: "tool_use" });
    expect(requests[0].headers.Authorization).toBe("Bearer chave");
    expect(requests[0].body.model).toBe("google/teste");
    expect(requests[0].body.messages[0]).toEqual({ role: "system", content: "sistema" });
    expect(requests[0].body.tools).toEqual([
      { type: "function", function: { name: "buscar_resultados", description: "d", parameters: { type: "object", properties: {} } } },
    ]);

    const t2 = await session.sendToolResults([{ id: "tc_1", content: '{"ok":true}' }]);
    expect(t2).toEqual({ text: "Pronto.", toolCalls: [], stopReason: "end_turn" });
    const sent = requests[1].body.messages;
    // A mensagem do modelo volta inteira (com reasoning_details) antes do resultado da ferramenta.
    expect(sent[2]).toMatchObject({ role: "assistant", tool_calls: [call], reasoning_details: [{ data: "sig" }] });
    expect(sent[3]).toEqual({ role: "tool", tool_call_id: "tc_1", content: '{"ok":true}' });
  });

  it("valida a saída estruturada com o schema", async () => {
    const schema = z.object({ title: z.string() });
    const { fetchFn, requests } = fakeFetch([reply({ content: '{"title":"Frações"}' }), reply({ content: '{"outro":1}' })]);
    const provider = new OpenRouterProvider("k", "m", fetchFn);

    await expect(provider.generateStructured({ system: "s", prompt: "p", schema })).resolves.toEqual({ title: "Frações" });
    expect(requests[0].body.response_format).toMatchObject({ type: "json_schema", json_schema: { schema: { type: "object" } } });
    await expect(provider.generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("mapeia chave inválida, falta de créditos e modelo inexistente", async () => {
    const schema = z.object({ a: z.string() });
    const cases: [number, string][] = [
      [401, "AI_AUTH"],
      [402, "AI_RATE_LIMIT"],
      [404, "SERVER_NOT_CONFIGURED"],
    ];
    for (const [status, code] of cases) {
      const { fetchFn } = fakeFetch([{ status, body: { error: { code: status, message: "x" } } }]);
      const err = await new OpenRouterProvider("k", "m", fetchFn).generateStructured({ system: "s", prompt: "p", schema }).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(code);
    }
  });

  it("tenta de novo quando o provedor está sobrecarregado", async () => {
    const original = retryTiming.sleep;
    retryTiming.sleep = async () => {};
    try {
      const { fetchFn, requests } = fakeFetch([{ status: 503, body: { error: { code: 503, message: "busy" } } }, reply({ content: '{"a":"ok"}' })]);
      const out = await new OpenRouterProvider("k", "m", fetchFn).generateStructured({ system: "s", prompt: "p", schema: z.object({ a: z.string() }) });
      expect(out).toEqual({ a: "ok" });
      expect(requests).toHaveLength(2);
    } finally {
      retryTiming.sleep = original;
    }
  });

  it("trata erro dentro de uma resposta 200", async () => {
    const { fetchFn } = fakeFetch([{ body: { error: { code: 401, message: "No auth" } } }]);
    const err = await new OpenRouterProvider("k", "m", fetchFn).generateStructured({ system: "s", prompt: "p", schema: z.object({}) }).catch((e) => e);
    expect(err.code).toBe("AI_AUTH");
  });
});

describe("configuração do OpenRouter", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("usa OPENROUTER_API_KEY e nunca a chave de outro provedor", () => {
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_PROVIDER_API_KEY = "chave-do-gemini";
    process.env.AI_MODEL = "";
    delete process.env.OPENROUTER_API_KEY;
    expect(getConfig().ai).toEqual({ provider: "openrouter", apiKey: undefined, model: "google/gemini-3.8-flash" });

    process.env.OPENROUTER_API_KEY = "sk-or-teste";
    expect(getConfig().ai.apiKey).toBe("sk-or-teste");
  });
});
