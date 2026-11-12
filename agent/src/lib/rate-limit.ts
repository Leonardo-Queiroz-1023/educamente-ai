import { AppError } from "./errors";

/**
 * Limite simples por professor, em memória (vale por instância do servidor).
 * Protege a cota da API de IA contra cliques repetidos ou scripts.
 */
const hits = new Map<string, number[]>();

export function enforceRateLimit(key: string, max = 12, windowMs = 10 * 60_000): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const waitMin = Math.ceil((windowMs - (now - recent[0])) / 60_000);
    throw new AppError(
      "RATE_LIMITED",
      `Muitas solicitações à IA em pouco tempo. Aguarde cerca de ${waitMin} minuto(s) e tente de novo.`,
    );
  }
  recent.push(now);
  hits.set(key, recent);
}
