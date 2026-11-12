import { z } from "zod";
import { getConfig } from "./config";
import { AppError } from "./errors";

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

function errorResponse(req: Request, error: unknown): Response {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error(`[agent] ${error.code}: ${error.message}`);
    return json(
      req,
      { error: { code: error.code, message: error.message, retryable: error.retryable, details: error.details ?? null } },
      error.status,
    );
  }
  // Nunca devolve detalhes internos ao navegador.
  console.error("[agent] erro inesperado:", error);
  return json(
    req,
    { error: { code: "INTERNAL", message: "Erro inesperado no serviço de IA. Tente novamente.", retryable: true, details: null } },
    500,
  );
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
