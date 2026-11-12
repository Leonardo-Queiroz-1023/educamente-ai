import { getConfig } from "../../../src/lib/config";
import { json, preflight, route } from "../../../src/lib/http";

export const dynamic = "force-dynamic";

/** Estado da configuração, sem expor segredos. */
export const GET = route(async (req: Request) => {
  const cfg = getConfig();
  const res = json(req, {
    ok: true,
    supabase_configured: Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey),
    ai_configured: Boolean(cfg.ai.apiKey),
    provider: cfg.ai.provider,
    model: cfg.ai.model,
    demo_mode: cfg.demoMode,
  });
  // Só diz o que está configurado (sem segredos): pode ser lido de qualquer origem.
  // As rotas de IA continuam restritas a ALLOWED_ORIGINS.
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
});

export const OPTIONS = (req: Request) => preflight(req);
