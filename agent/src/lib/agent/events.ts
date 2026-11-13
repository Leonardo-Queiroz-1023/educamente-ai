/**
 * Eventos de progresso de uma execução do agente, transmitidos ao painel enquanto
 * a IA trabalha (resposta em NDJSON). Só descrevem o que de fato está acontecendo:
 * "status" diz o que o servidor está fazendo agora; "step" é uma operação concluída
 * (as mesmas linhas de `operations` na resposta final).
 */
export type AgentPhase = "checking" | "thinking" | "tool";

export type AgentEvent =
  | { type: "status"; phase: AgentPhase; label: string; tool?: string }
  | { type: "step"; text: string };

export type EmitFn = (event: AgentEvent) => void;

export const noEmit: EmitFn = () => {};

/** O que cada ferramenta está fazendo, no momento em que começa a rodar. */
export const TOOL_LABELS: Record<string, string> = {
  buscar_resultados: "Consultando as avaliações e os resultados da turma",
  analisar_desempenho: "Calculando os indicadores de desempenho",
  consultar_historico: "Consultando o histórico da turma",
  registrar_analise: "Conferindo e registrando a análise",
  planejar_intervencao: "Planejando a intervenção pedagógica",
  gerar_atividade: "Escrevendo a atividade",
  validar_atividade: "Revisando a atividade: estrutura, gabarito e conteúdo",
  salvar_atividade: "Salvando a atividade como rascunho",
};
