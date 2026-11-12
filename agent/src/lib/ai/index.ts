import { getConfig, requireAi } from "../config";
import { AnthropicProvider } from "./anthropic-provider";
import type { AiProvider } from "./provider";

/** Cria o provedor configurado. Novo provedor: novo adaptador + um case aqui. */
export function createProvider(): AiProvider {
  const ai = requireAi(getConfig());
  switch (ai.provider) {
    case "anthropic":
      return new AnthropicProvider(ai.apiKey, ai.model);
  }
}

export type { AiProvider } from "./provider";
