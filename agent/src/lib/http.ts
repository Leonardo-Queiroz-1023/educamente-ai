import { z } from "zod";
import { getConfig } from "./config";
import { AppError } from "./errors";
import { noEmit, type EmitFn } from "./agent/events";

function corsHeaders(req: Request): Headers {
  const headers = new Headers({ Vary: "Origin" });
  const origin = req.headers.get("origin");
  let allowed: string[] = [];
  try {
    allowed = getConfig().allowedOrigins;
  } catch {
    allowed = [];
  }
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, data: unknown, status = 200): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

/** Corpo de erro enviado ao navegador. Nunca inclui detalhes internos de erros inesperados. */
function errorBody(error: unknown): { status: number; body: { error: { code: string; message: string; retryable: boolean; details: unknown } } } {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error(`[agent] ${error.code}: ${error.message}`);
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, retryable: error.retryable, details: error.details ?? null } },
    };
  }
  console.error("[agent] erro inesperado:", error);
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Erro inesperado no serviço de IA. Tente novamente.", retryable: true, details: null } },
  };
}

function errorResponse(req: Request, error: unknown): Response {
  const { status, body } = errorBody(error);
  return json(req, body, status);
}

export const NDJSON = "application/x-ndjson";

/**
 * Responde com o resultado da tarefa. Se o navegador pedir `Accept: application/x-ndjson`,
 * transmite o progresso enquanto a IA trabalha, uma linha JSON por evento:
 *   {"type":"status",...} / {"type":"step",...}  durante a execução
 *   {"type":"result","status":201,"data":{...}}   no fim, com o mesmo corpo da resposta JSON
 *   {"type":"error","status":502,"error":{...}}   se falhar, com o mesmo corpo de erro
 * Sem esse cabeçalho, a resposta é o JSON de sempre. Autenticação e validação devem
 * rodar ANTES desta função: assim seus erros continuam saindo com o status HTTP correto.
 */
export function respond(req: Request, status: number, run: (emit: EmitFn) => Promise<unknown>): Promise<Response> | Response {
  if (!(req.headers.get("accept") ?? "").includes(NDJSON)) {
    return run(noEmit).then((data) => json(req, data, status));
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // O navegador fechou a conexão; a execução termina sem destino para o progresso.
        }
      };
      try {
        const data = await run((event) => send(event));
        send({ type: "result", status, data });
      } catch (error) {
        const e = errorBody(error);
        send({ type: "error", status: e.status, ...e.body });
      } finally {
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
  });
  const headers = corsHeaders(req);
  headers.set("Content-Type", `${NDJSON}; charset=utf-8`);
  headers.set("Cache-Control", "no-store");
  // Proxies (nginx etc.) não devem segurar as linhas até o fim.
  headers.set("X-Accel-Buffering", "no");
  return new Response(stream, { status: 200, headers });
}

/** Lê e valida o corpo JSON. Erros viram 400 com a lista de campos inválidos. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Corpo da requisição inválido: envie JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("BAD_REQUEST", "Alguns campos da solicitação são inválidos.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Envolve um Route Handler: converte qualquer erro em resposta JSON com CORS. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(req, error);
    }
  };
}
