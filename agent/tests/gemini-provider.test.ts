/**
 * Adaptador Gemini com um cliente falso (sem rede): confere o formato das
 * mensagens trocadas e o mapeamento de erros. Teste real: veja agent/README.md.
 */
import { ApiError, FinishReason, type GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GeminiProvider, retryTiming } from "../src/lib/ai/gemini-provider";
import { AppError } from "../src/lib/errors";

type Req = { contents: { role: string; parts: Record<string, unknown>[] }[]; config: Record<string, unknown> };

function fakeClient(responses: (object | Error)[]) {
  const requests: Req[] = [];
  const client = {
    models: {
      generateContent: async (req: Req) => {
        requests.push(JSON.parse(JSON.stringify(req)));
        const r = responses.shift();
        if (r instanceof Error) throw r;
        return r;
      },
    },
  } as unknown as GoogleGenAI;
  return { client, requests };
}

const modelTurn = (parts: object[], finishReason = FinishReason.STOP, functionCalls?: object[]) => ({
  candidates: [{ content: { role: "model", parts }, finishReason }],
  functionCalls,
  text: (parts as { text?: string }[]).map((p) => p.text ?? "").join(""),
});

describe("adaptador Gemini", () => {
  it("traduz chamadas de função e devolve os resultados com o nome da função", async () => {
    const call = { name: "buscar_resultados", args: { class_id: "x" } }; // sem id, como a API às vezes envia
    const { client, requests } = fakeClient([
      modelTurn([{ functionCall: call, thoughtSignature: "assinatura" }], FinishReason.STOP, [call]),
      modelTurn([{ text: "Pronto." }]),
    ]);
    const session = new GeminiProvider("k", "gemini-teste", client).startSession({
      system: "sistema",
      tools: [{ name: "buscar_resultados", description: "d", inputSchema: { type: "object", properties: {} } }],
    });

    const t1 = await session.send("oi");
    expect(t1.stopReason).toBe("tool_use");
    expect(t1.toolCalls).toEqual([{ id: "call_1", name: "buscar_resultados", input: { class_id: "x" } }]);
    expect(requests[0].config.systemInstruction).toBe("sistema");

    const t2 = await session.sendToolResults([{ id: "call_1", content: '{"ok":true}' }]);
    expect(t2).toEqual({ text: "Pronto.", toolCalls: [], stopReason: "end_turn" });
    const sent = requests[1].contents;
    // O turno do modelo volta inteiro (com a assinatura de pensamento) antes da resposta da função.
    expect(sent[1]).toEqual({ role: "model", parts: [{ functionCall: call, thoughtSignature: "assinatura" }] });
    expect(sent[2].parts[0]).toEqual({ functionResponse: { name: "buscar_resultados", response: { output: '{"ok":true}' } } });
  });

  it("valida a saída estruturada com o schema", async () => {
    const schema = z.object({ title: z.string() });
    const ok = fakeClient([modelTurn([{ text: '{"title":"Atividade"}' }])]);
    await expect(new GeminiProvider("k", "m", ok.client).generateStructured({ system: "s", prompt: "p", schema })).resolves.toEqual({ title: "Atividade" });
    expect(ok.requests[0].config.responseMimeType).toBe("application/json");

    const bad = fakeClient([modelTurn([{ text: '{"titulo":1}' }])]);
    await expect(new GeminiProvider("k", "m", bad.client).generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("espera e tenta de novo no limite por minuto, mas não na cota diária", async () => {
    const waits: number[] = [];
    const original = retryTiming.sleep;
    retryTiming.sleep = async (ms) => void waits.push(ms);
    try {
      const perMinute = new ApiError({ message: 'Quota exceeded ... "retryDelay": "20s"', status: 429 });
      const { client } = fakeClient([perMinute, modelTurn([{ text: "ok" }])]);
      await expect(new GeminiProvider("k", "m", client).startSession({ system: "s", tools: [] }).send("x")).resolves.toMatchObject({ text: "ok" });
      expect(waits).toEqual([20_500]);

      const daily = new ApiError({ message: "Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier", status: 429 });
      const d = fakeClient([daily, modelTurn([{ text: "não deveria chegar aqui" }])]);
      await expect(new GeminiProvider("k", "m", d.client).startSession({ system: "s", tools: [] }).send("x")).rejects.toMatchObject({ code: "AI_RATE_LIMIT" });
      expect(waits).toHaveLength(1);
    } finally {
      retryTiming.sleep = original;
    }
  });

  it("mapeia chave inválida, limite de uso e bloqueio de segurança", async () => {
    const tools = { system: "s", tools: [] };
    retryTiming.sleep = async () => {};
    const invalidKey = fakeClient([new ApiError({ message: "API key not valid. Please pass a valid API key.", status: 400 })]);
    await expect(new GeminiProvider("k", "m", invalidKey.client).startSession(tools).send("x")).rejects.toMatchObject({ code: "AI_AUTH" });

    // Limite que persiste depois de todas as tentativas.
    const limited = fakeClient(Array.from({ length: 5 }, () => new ApiError({ message: "Resource exhausted", status: 429 })));
    const err = await new GeminiProvider("k", "m", limited.client).startSession(tools).send("x").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("AI_RATE_LIMIT");

    const blocked = fakeClient([modelTurn([], FinishReason.SAFETY)]);
    await expect(new GeminiProvider("k", "m", blocked.client).startSession(tools).send("x")).resolves.toMatchObject({ stopReason: "refusal" });
  });
});
