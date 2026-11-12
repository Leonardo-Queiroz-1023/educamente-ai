/**
 * Erros com código estável (usado pelo front-end) e mensagem pronta para o professor.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "SERVER_NOT_CONFIGURED"
  | "AI_NOT_CONFIGURED"
  | "AI_AUTH"
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_REFUSAL"
  | "AI_INVALID_RESPONSE"
  | "AGENT_INCOMPLETE"
  | "DATA_ERROR"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  SERVER_NOT_CONFIGURED: 503,
  AI_NOT_CONFIGURED: 503,
  AI_AUTH: 502,
  AI_RATE_LIMIT: 503,
  AI_TIMEOUT: 504,
  AI_UNAVAILABLE: 503,
  AI_REFUSAL: 422,
  AI_INVALID_RESPONSE: 502,
  AGENT_INCOMPLETE: 502,
  DATA_ERROR: 502,
  INTERNAL: 500,
};

/** Erros em que tentar de novo pode resolver. */
const RETRYABLE = new Set<ErrorCode>([
  "AI_RATE_LIMIT",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AGENT_INCOMPLETE",
  "DATA_ERROR",
  "RATE_LIMITED",
]);

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status(): number {
    return STATUS[this.code];
  }
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/**
 * Erro de uma ferramenta que o modelo pode corrigir (argumento errado, ordem dos passos).
 * Volta para o modelo como tool_result com is_error, sem abortar a execução.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}
