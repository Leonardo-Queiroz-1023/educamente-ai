import { getConfig } from "../../../src/lib/config";
import { json, preflight, route } from "../../../src/lib/http";

export const dynamic = "force-dynamic";

/** Estado da configuração, sem expor segredos. */
export const GET = route(async (req: Request) => {
  const cfg = getConfig();
  return json(req, {
    ok: true,
    supabase_configured: Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey),
    ai_configured: Boolean(cfg.ai.apiKey),
    provider: cfg.ai.provider,
    model: cfg.ai.model,
  });
});

export const OPTIONS = (req: Request) => preflight(req);
