import { AppError } from "./errors";

export type AiProviderId = "anthropic" | "gemini" | "openrouter";
const PROVIDERS: readonly AiProviderId[] = ["anthropic", "gemini", "openrouter"];

/** Modelo usado quando AI_MODEL não é definido. */
const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-3.8-flash",
  openrouter: "google/gemini-3.8-flash",
};
const KEY_HELP: Record<AiProviderId, string> = {
  anthropic: "chave da API da Anthropic",
  gemini: "chave do Google AI Studio",
  openrouter: "chave do OpenRouter",
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
  /** Teto de chamadas de IA sem login por hora, somando todos os visitantes (por instância do servidor). */
  demoGlobalLimitPerHour: number;
}

/**
 * Confere a origem do front-end. Aceita entradas exatas ("http://127.0.0.1:5500") e com
 * porta livre ("http://localhost:*"), para quem clona o repositório abrir o site em qualquer porta.
 */
export function isAllowedOrigin(allowed: string[], origin: string | null): boolean {
  if (!origin) return false;
  return allowed.some((entry) => {
    if (entry === origin) return true;
    if (!entry.endsWith(":*")) return false;
    const base = entry.slice(0, -2);
    return origin.startsWith(base + ":") && /^\d{1,5}$/.test(origin.slice(base.length + 1));
  });
}

const DEFAULT_ORIGINS = ["http://127.0.0.1:5500", "http://localhost:5500"];

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function getConfig(): ServerConfig {
  const raw = (clean(process.env.AI_PROVIDER) ?? "anthropic").toLowerCase();
  if (!(PROVIDERS as readonly string[]).includes(raw)) {
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      `AI_PROVIDER="${raw}" não é suportado. Use ${PROVIDERS.map((p) => `"${p}"`).join(", ")}, ou implemente um novo provedor em src/lib/ai.`,
    );
  }
  const provider = raw as AiProviderId;
  // OpenRouter tem chave própria: trocar AI_PROVIDER entre gemini e openrouter não exige mexer nas chaves.
  // Sem fallback de propósito: a chave de outro provedor nunca é enviada ao OpenRouter.
  const apiKey =
    provider === "openrouter" ? clean(process.env.OPENROUTER_API_KEY) : clean(process.env.AI_PROVIDER_API_KEY);
  return {
    supabaseUrl: clean(process.env.SUPABASE_URL),
    supabaseAnonKey: clean(process.env.SUPABASE_ANON_KEY),
    allowedOrigins: (clean(process.env.ALLOWED_ORIGINS)?.split(",") ?? DEFAULT_ORIGINS)
      .map((o) => o.trim())
      .filter(Boolean),
    ai: {
      provider,
      apiKey,
      model: clean(process.env.AI_MODEL) ?? DEFAULT_MODELS[provider],
    },
    demoMode: clean(process.env.DEMO_MODE)?.toLowerCase() === "true",
    demoGlobalLimitPerHour: Math.max(1, Number(clean(process.env.DEMO_GLOBAL_LIMIT_PER_HOUR)) || 60),
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
      `A IA ainda não está configurada. Defina ${cfg.ai.provider === "openrouter" ? "OPENROUTER_API_KEY" : "AI_PROVIDER_API_KEY"} (${KEY_HELP[cfg.ai.provider]}) em agent/.env.local e reinicie o serviço.`,
    );
  }
  return { ...cfg.ai, apiKey: cfg.ai.apiKey };
}
