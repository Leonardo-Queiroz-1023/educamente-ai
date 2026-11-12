import { AppError } from "./errors";

export type AiProviderId = "anthropic" | "gemini";

/** Modelo usado quando AI_MODEL não é definido. */
const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-3.8-flash",
};
const KEY_HELP: Record<AiProviderId, string> = {
  anthropic: "chave da API da Anthropic",
  gemini: "chave do Google AI Studio",
};

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
  /** Modo demonstração: IA sem login, sobre os dados do navegador. Só para apresentar o MVP. */
  demoMode: boolean;
}

const DEFAULT_ORIGINS = ["http://127.0.0.1:5500", "http://localhost:5500"];

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function getConfig(): ServerConfig {
  const raw = (clean(process.env.AI_PROVIDER) ?? "anthropic").toLowerCase();
  if (raw !== "anthropic" && raw !== "gemini") {
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      `AI_PROVIDER="${raw}" não é suportado. Use "anthropic" ou "gemini", ou implemente um novo provedor em src/lib/ai.`,
    );
  }
  const provider: AiProviderId = raw;
  return {
    supabaseUrl: clean(process.env.SUPABASE_URL),
    supabaseAnonKey: clean(process.env.SUPABASE_ANON_KEY),
    allowedOrigins: (clean(process.env.ALLOWED_ORIGINS)?.split(",") ?? DEFAULT_ORIGINS)
      .map((o) => o.trim())
      .filter(Boolean),
    ai: {
      provider,
      apiKey: clean(process.env.AI_PROVIDER_API_KEY),
      model: clean(process.env.AI_MODEL) ?? DEFAULT_MODELS[provider],
    },
    demoMode: clean(process.env.DEMO_MODE)?.toLowerCase() === "true",
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
      `A IA ainda não está configurada. Defina AI_PROVIDER_API_KEY (${KEY_HELP[cfg.ai.provider]}) em agent/.env.local e reinicie o serviço.`,
    );
  }
  return { ...cfg.ai, apiKey: cfg.ai.apiKey };
}
