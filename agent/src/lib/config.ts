import { AppError } from "./errors";

export type AiProviderId = "anthropic";

export interface AiConfig {
  provider: AiProviderId;
  apiKey: string | undefined;
  model: string;
}

export interface ServerConfig {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  allowedOrigins: string[];
  ai: AiConfig;
}

const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_ORIGINS = ["http://127.0.0.1:5500", "http://localhost:5500"];

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function getConfig(): ServerConfig {
  const provider = clean(process.env.AI_PROVIDER) ?? "anthropic";
  if (provider !== "anthropic") {
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      `AI_PROVIDER="${provider}" não é suportado. Use "anthropic" ou implemente um novo provedor em src/lib/ai.`,
    );
  }
  return {
    supabaseUrl: clean(process.env.SUPABASE_URL),
    supabaseAnonKey: clean(process.env.SUPABASE_ANON_KEY),
    allowedOrigins: (clean(process.env.ALLOWED_ORIGINS)?.split(",") ?? DEFAULT_ORIGINS)
      .map((o) => o.trim())
      .filter(Boolean),
    ai: {
      provider,
      apiKey: clean(process.env.AI_PROVIDER_API_KEY),
      model: clean(process.env.AI_MODEL) ?? DEFAULT_MODEL,
    },
  };
}

export function requireSupabase(cfg: ServerConfig): { url: string; anonKey: string } {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      "O serviço de IA não está ligado ao Supabase. Defina SUPABASE_URL e SUPABASE_ANON_KEY em agent/.env.local e reinicie o serviço.",
    );
  }
  return { url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey };
}

export function requireAi(cfg: ServerConfig): AiConfig & { apiKey: string } {
  if (!cfg.ai.apiKey) {
    throw new AppError(
      "AI_NOT_CONFIGURED",
      "A IA ainda não está configurada. Defina AI_PROVIDER_API_KEY (chave da API da Anthropic) em agent/.env.local e reinicie o serviço.",
    );
  }
  return { ...cfg.ai, apiKey: cfg.ai.apiKey };
}
