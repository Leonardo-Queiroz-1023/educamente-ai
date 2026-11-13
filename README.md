# Documentação dos Agentes de IA — EducaMente AI

> **Data:** 13 de novembro de 2026 | **Autor:** @kavã

## Visão Geral

O **EducaMente AI** possui dois agentes com ferramentas reais (**análise de aprendizagem** e **geração de atividade**) e uma chamada direta de IA para **corrigir questões dissertativas**. Tudo roda no serviço `agent/` (Next.js + TypeScript), separado do front-end estático.

| Fluxo | O que faz | Rota principal | Onde grava |
| :--- | :--- | :--- | :--- |
| **Análise de aprendizagem** | Lê as notas da turma, calcula indicadores e escreve um resumo com recomendações | `POST /api/agent/analyze` | `pedagogical_analyses` |
| **Geração de atividade** | Planeja, escreve, revisa e salva uma atividade personalizada como rascunho | `POST /api/agent/activities` | `activities` (status `draft`) |
| **Correção de dissertativas** | Dá nota e comentário a respostas abertas, sem agente nem ferramentas | `POST /api/demo/grade` | Nada (o navegador guarda) |

### Princípios Fundamentais

Três princípios valem para todos os fluxos:

1. **O código calcula, a IA interpreta:** Todo número citado pela IA vem de funções determinísticas; o modelo nunca faz contas que vão para o professor.
2. **O professor decide:** A IA só cria rascunhos. Aprovar uma atividade é uma rota que o agente não consegue chamar.
3. **Privacidade por padrão:** O modelo vê estudantes apenas como códigos (`E1`, `E2`...). Nomes e observações do professor nunca saem do navegador.

### Provedores de IA Aceitos

Configurados via variável de ambiente `AI_PROVIDER`:
* `anthropic` (padrão: `claude-opus-5-5`)
* `gemini` (padrão: `gemini-3.8-flash`)
* `openrouter` (padrão: `google/gemini-3.8-flash`)

O agente comunica-se por meio de uma interface neutra (`AiProvider`), portanto trocar de provedor não altera nenhuma regra descrita nesta documentação.

---

## Arquitetura

**A IA só conversa com o loop; dados e contas ficam no código.**

```text
[Navegador (front-end)]  ──(pedido + token da sessão)──▶  [Rotas da API] (Zod, login, turma, limite)
                                                               │
                                                  (turma e dados conferidos)
                                                               ▼
                                                    [Tarefa: análise ou geração]
                                                    (Sem resultados, para sem IA)
                                                               │
                                                        (inicia o loop)
                                                               ▼
[Provedor de IA]  ◀──────(só códigos E1, E2...)──────  [Loop do agente] (Até 16 rodadas em sequência)
(Anthropic/Gemini/OR)                                          │
                                                     (chama as ferramentas)
                                                               ▼
                                                       [Ferramentas (8)]
                                                      /                 \
                                                     ▼                   ▼
                                        [Domínio (cálculos)]         [Supabase]
                                      (Indicadores e proteções)   (Consulta via RLS)
```

Um pedido desce do navegador até o loop do agente, que conversa com o provedor de IA e executa as ferramentas. As ferramentas fazem as contas no código e leem ou gravam no Supabase com o login do professor. Duas ferramentas da geração (`gerar_atividade` e `validar_atividade`) também chamam o provedor, em conversas separadas para escrever e para revisar.

### Estrutura de Pastas (`agent/`)

| Pasta / Arquivo | Responsabilidade |
| :--- | :--- |
| `app/api/` | Rotas: validação com Zod, autenticação, CORS e conversão de erros |
| `src/lib/auth.ts` | Valida o token e cria um cliente Supabase que age como o professor |
| `src/lib/agent/` | Prompts, ferramentas, loop e as duas tarefas principais |
| `src/lib/domain/` | Cálculos, pseudônimos, níveis, validação e proteções |
| `src/lib/ai/` | Interface neutra `AiProvider` + adaptadores Anthropic, Gemini e OpenRouter |
| `src/lib/data/` | Repositório: Supabase em produção, memória nos testes e no modo demo |

---

## Agente de Análise de Aprendizagem

Transforma as notas de uma turma em um resumo para o professor, com pontos de atenção e recomendações que citam evidências numéricas.
* **Código:** `runAnalysis` em `src/lib/agent/tasks.ts`
* **Cabeçalho obrigatório:** `Authorization: Bearer <token da sessão Supabase>`

### Input (`POST /api/agent/analyze`)

| Campo | Tipo | Obrigatório | Para quê |
| :--- | :--- | :--- | :--- |
| `class_id` | UUID | Sim | Turma analisada; precisa pertencer ao professor logado |
| `assessment_id` | UUID | Não | Analisa apenas uma avaliação específica |
| `subject` | texto (até 80) | Não | Filtra por componente (ex.: `Matemática`) |
| `content` | texto (até 160) | Não | Filtra por conteúdo (ex.: `Frações`) |
| `start_date`, `end_date` | `AAAA-MM-DD` | Não | Período das avaliações |

### Output

| Campo | Conteúdo |
| :--- | :--- |
| `status` | `ok` ou `insufficient_data` |
| `message` | Frase pronta para exibição na tela |
| `analysis` | `id`, `created_at`, `summary` (3 a 5 frases), `attention_points[]`, `recommendations[]` com `text` + `evidence` |
| `evidence` | Todos os indicadores calculados (ver *Lógica de Cálculo*) |
| `suggested_complexity` | `reforco`, `consolidacao` ou `aprofundamento` |
| `focus_content` | Conteúdo com a menor média |
| `students` | Legenda `code` $\leftrightarrow$ `student_id`; o navegador substitui pelos nomes |
| `operations[]` | O que o agente executou de verdade, descrito em frases |

### Fluxo de Execução

1. **Autenticação:** Valida o token, identifica o professor e confere se a turma pertence a ele. Aplica o limite de 12 chamadas por professor a cada 10 minutos.
2. **Pré-checagem sem IA:** Lista avaliações e resultados com os filtros aplicados. Se não houver resultados, devolve `insufficient_data` e a IA nem é chamada.
3. **Pseudônimos:** Cria os códigos `E1`, `E2`... na ordem dos estudantes da turma.
4. **Loop do agente com 4 ferramentas:** `buscar_resultados` $\rightarrow$ `analisar_desempenho` $\rightarrow$ `consultar_historico` (opcional) $\rightarrow$ `registrar_analise`.
5. **Checagem final:** Se o agente terminar sem registrar a análise, a resposta retorna o erro `AGENT_INCOMPLETE` e nada é salvo.

### Lógica e Regras

* O modelo escreve apenas texto; todos os números vêm de `analisar_desempenho`, calculados determinísticamente no código.
* `registrar_analise` recusa o texto se ele citar um percentual ausente nos indicadores (tolerância de `0,5` ponto) ou usar termos de diagnóstico clínico. A recusa volta ao modelo como erro de ferramenta, obrigando-o a reescrever.
* O prompt instrui a reconhecer bons resultados e não inventar dificuldades. Evolução só é citada quando há avaliações comparáveis (mesmo componente e conteúdo).
* A análise salva armazena junto os indicadores, a legenda de códigos, os filtros, as operações, o provedor e o modelo.

---

## Agente de Geração de Atividade

Cria uma atividade personalizada a partir dos resultados reais da turma, revisa sua estrutura e conteúdo e salva como rascunho para o professor aprovar.
* **Código:** `runGeneration` em `src/lib/agent/tasks.ts`

### Input (`POST /api/agent/activities`)

| Campo | Tipo | Obrigatório | Para quê |
| :--- | :--- | :--- | :--- |
| `class_id` | UUID | Sim | Turma; precisa pertencer ao professor |
| `content` | texto (1 a 160) | Sim | Conteúdo da atividade; precisa ter notas lançadas |
| `target_group` | `turma`, `menor_aproveitamento`, `estudantes_selecionados` | Sim | Público-alvo |
| `student_ids` | UUIDs (até 60) | Só com `estudantes_selecionados` | Estudantes escolhidos (todos devem ser da turma) |
| `complexity` | `reforco`, `consolidacao`, `aprofundamento` | Sim | Nível escolhido pelo professor |
| `question_count` | inteiro (1 a 15) | Sim | Quantidade exata de questões |
| `activity_type` | `Exercícios`, `Questionário`, `Atividade prática`, `Revisão`, `Trabalho`, `Atividade avaliativa` | Sim | Tipo da atividade |
| `subject`, `skill`, `objective` | texto | Não | Componente, habilidade e objetivo; se vazios, o agente define |
| `teacher_notes` | texto (até 1000) | Não | Contexto do professor (tratado como dado, não como regra) |
| `analysis_id`, `regenerate_of` | UUID | Não | Liga à análise de origem ou à versão anterior |

### Output

| Campo | Conteúdo |
| :--- | :--- |
| `activity` | Linha salva em `activities`: título, instruções, exemplos resolvidos, questões, gabarito, orientação ao professor, justificativa, `status: draft`, `origin: ai` e `generation_metadata` |
| `validation` | `passed`, `structural_issues[]` e a revisão de conteúdo |
| `students` | Legenda `code` $\leftrightarrow$ `student_id` |
| `operations[]` | Passos executados |

* **Questões:** Cada questão contém `number`, `type` (`multipla_escolha`, `resposta_curta`, `dissertativa`), `statement` e `options`.
* **Gabarito:** Cada item contém `question`, `answer` (apenas a letra na múltipla escolha) e `explanation`.

### Fluxo de Execução

1. **Autenticação e checagens:** Valida turma do professor, verifica se os estudantes selecionados pertencem à turma e garante ao menos um resultado no conteúdo. Sem resultados, retorna `VALIDATION_FAILED` sem chamar a IA.
2. **Coleta e cálculo:** Executa `buscar_resultados` e `analisar_desempenho`, como na análise.
3. **Histórico:** Executa `consultar_historico` (opcional), por exemplo para verificar atividades já aplicadas sobre o conteúdo.
4. **Planejamento:** Executa `planejar_intervencao` para definir público-alvo e evidências pelos dados, registrando objetivo e estratégias.
5. **Escrita:** Executa `gerar_atividade` (chamada separada de IA com saída estruturada) para redigir a atividade.
6. **Validação:** Executa `validar_atividade` (checagem estrutural no código e, se passar, revisão de conteúdo por outra chamada de IA).
7. **Correção iterativa:** Se reprovar, volta ao passo 5 enviando os problemas em `corrections` (máximo de **3 gerações**).
8. **Salvamento:** Executa `salvar_atividade` para gravar como `draft`. Sem atividade salva ao final, retorna `AGENT_INCOMPLETE` com os problemas da última versão.

### Lógica e Regras

* **Trava de parâmetros:** As escolhas do professor são travadas no código. Se o modelo solicitar outro nível, quantidade, tipo, público ou conteúdo, a ferramenta recusa e informa o valor correto.
* **Evidências determinísticas:** As evidências enviadas ao gerador vêm do plano calculado no código, nunca de um resumo do modelo.
* **Separação de papéis:** O agente coordena, o gerador escreve (`GENERATOR_SYSTEM`) e o revisor confere (`REVIEWER_SYSTEM`), refazendo inclusive os cálculos do gabarito.
* **Regra de salvamento:** Problema estrutural **nunca** é salvo. Problema apenas de conteúdo bloqueia o salvamento até a 3ª tentativa; após isso, a melhor versão é salva com `needs_teacher_attention: true`.
* **Aprovação humana:** `POST /api/activities/:id/approve` exige a sessão do professor e estrutura válida, mudando o status para `Planejada`. Editar (`PATCH /api/activities/:id`) retorna a atividade para rascunho.

---

## Ferramentas do Agente

São **8 ferramentas** definidas em `src/lib/agent/tools.ts`. Cada uma valida a entrada com Zod, executa operações reais e registra uma entrada em `operations`. Erros de entrada retornam ao modelo para autocorreção; erros de banco, autenticação ou provedor encerram a execução.

| Ferramenta | Usada em | Entrada | Saída | Regras |
| :--- | :--- | :--- | :--- | :--- |
| `buscar_resultados` | Análise e geração | `class_id` + filtros opcionais (avaliação, componente, conteúdo, datas) | Turma, avaliações e resultados por código (`E1`...) com percentual | Apenas a turma da solicitação; lista limitada a 400 linhas |
| `analisar_desempenho` | Análise e geração | `assessment_ids` (opcional) | Indicadores completos (`PerformanceAnalysis`) | Exige `buscar_resultados` antes; cálculo 100% no código |
| `consultar_historico` | Análise e geração | `class_id`, `student_id` como código (`E3`), componente, conteúdo | Evolução, linha do tempo do estudante, até 15 atividades e 5 análises anteriores | Código inexistente é recusado |
| `registrar_analise` | Só análise | `summary`, `attention_points[]` (até 8), `recommendations[]` com evidência (1 a 6) | `analysis_id` | Recusa percentual inventado, termo de diagnóstico e segundo registro |
| `planejar_intervencao` | Só geração | Conteúdo, objetivo, estratégias (1 a 6), público, nível | Plano com público-alvo, médias, nível sugerido x escolhido e evidências | Nível e público devem ser os do professor; conteúdo precisa ter notas |
| `gerar_atividade` | Só geração | Parâmetros do professor + evidências + `corrections` (opcional) | `draft_id` + atividade | Exige o plano; máximo de 3 gerações; recusa parâmetros divergentes |
| `validar_atividade` | Só geração | `draft_id` | Aprovada + problemas ou observações | Estrutura primeiro; revisão de conteúdo só roda se a estrutura passar |
| `salvar_atividade` | Só geração | `draft_id` | `activity_id`, `status: draft` | Exige validação; nunca aprova; apenas um salvamento por pedido |

O loop do agente (`run-agent.ts`) executa as ferramentas em sequência, pois cada etapa depende do estado deixado pela anterior, e encerra após **16 rodadas** com o erro `AGENT_INCOMPLETE`.

---

## Correção de Dissertativas

Uma única chamada de IA com saída estruturada, sem agente nem ferramentas, usada pelo portal da escola no modo demonstração. Questões objetivas são corrigidas pelo gabarito no próprio navegador; apenas as dissertativas chegam a este endpoint.
* **Código:** `gradeOpenAnswers` em `src/lib/grading.ts`

### Input (`POST /api/demo/grade`)

* `activity`: `title`, `subject` e `questions[]` (1 a 10), cada uma com `index`, `statement`, `expected_answer` e `points` (até 100).
* `submissions[]` (1 a 60): `id` opaco (sem nome do estudante) e `answers[]` com `index` + `answer`.

### Output

* `grades[]`: por entrega e questão, `points`, `correct`, `comment` (até 600 caracteres, dirigido ao estudante) e `errors[]` (até 5 rótulos curtos).
* `summary`: até 4 frases para o professor, destacando os erros mais frequentes e uma sugestão de retomada.
* Metadados: `provider`, `model` e `demo: true`.

### Lógica

1. O prompt solicita padronização de rótulos para o mesmo erro em respostas diferentes, permitindo ao professor visualizar erros recorrentes da turma. Resposta em branco recebe nota `0` com o erro `"Resposta em branco"`.
2. Após a resposta da IA, o código descarta notas de entregas ou questões não enviadas e remove duplicatas.
3. Cada nota é arredondada para meio ponto ($0,5$) e limitada entre `0` e o valor máximo da questão.
4. Nada é gravado no servidor; o navegador armazena o resultado.

---

## Lógica de Cálculo

Todos os indicadores são gerados por `computePerformance` (`src/lib/domain/analytics.ts`). O percentual de cada resultado é calculado como $(\text{pontuação} / \text{total de pontos}) \times 100$, arredondado para 1 casa decimal.

| Indicador | Como é calculado |
| :--- | :--- |
| **Média geral** | Média aritmética de todos os percentuais |
| **Por avaliação** | Média, quantidade de resultados e taxa de entrega ($\text{resultados} \div \text{estudantes da turma}$) |
| **Por conteúdo e componente** | Média dos percentuais do grupo; lista ordenada da menor para a maior média |
| **Por estudante** | Média de cada código; abaixo de 50% fica marcado como `below_threshold` |
| **Distribuição** | Faixas: `< 50%`, `50% a 69%`, `70% a 89%` e `90% a 100%`, com contagem e percentual |
| **Diferença entre conteúdos** | Maior média menos a menor média (quando há ao menos 2 conteúdos) |
| **Evolução** | Entre avaliações comparáveis (mesmo componente e conteúdo), em ordem cronológica: variação da turma e de cada estudante. Tendência: `melhora`, `estável` ou `queda` |
| **Conteúdo-foco** | O conteúdo que apresenta a menor média |
| **Suficiência dos dados** | `insuficiente` (0 resultados); `limitada` (< 3 resultados ou < 2 estudantes); caso contrário, `suficiente` |

### Nível Sugerido (`suggestComplexity`)

Baseado na média do conteúdo (na geração, usa a média do público-alvo ou da turma):
* **Abaixo de 60%:** `Reforço`
* **De 60% a 84,9%:** `Consolidação`
* **85% ou mais:** `Aprofundamento`

*(Se o professor escolher outro nível, o plano registra a divergência e a escolha do professor prevalece).*

### Público-Alvo (`planIntervention`)

* `turma`: todos os estudantes com nota registrada no conteúdo.
* `menor_aproveitamento`: estudantes abaixo de 60% no conteúdo (se ninguém ficou abaixo, o plano anota que a atividade pode atender a turma toda).
* `estudantes_selecionados`: os códigos escolhidos pelo professor (estudantes sem nota no conteúdo são sinalizados em uma nota).

### Diretrizes por Nível ao Gerador

| Nível | Orientação Pedagógica |
| :--- | :--- |
| **Reforço** | Questões introdutórias, instruções passo a passo, ao menos 1 exemplo resolvido (obrigatório na validação) e dificuldade gradual |
| **Consolidação** | Questões intermediárias de aplicação e problemas contextualizados no cotidiano |
| **Aprofundamento** | Questões complexas, raciocínio aplicado e problemas com múltiplas etapas |

---

## Proteções Pedagógicas e de Privacidade

As regras são aplicadas tanto nos prompts quanto via validação determinística no código:

| Proteção | Módulo / Função | O que acontece |
| :--- | :--- | :--- |
| **Pseudônimos** | `pseudonyms.ts` | O modelo vê apenas `E1`, `E2`...; o back-end nem consulta nomes. O navegador traduz os códigos pela legenda |
| **Observações privadas** | Front-end e rotas | Anotações do professor sobre alunos nunca são enviadas ao modelo |
| **Códigos fora do material** | `validateActivityStructure` | Título, instruções, exemplos e questões não podem citar `E3` ou `"estudante 3"` |
| **Percentuais inventados** | `unsupportedPercentages` | A análise é recusada se citar qualquer percentual ausente nos indicadores (tolerância de `0,5` ponto) |
| **Termos proibidos** | `findForbiddenTerms` | Bloqueia termos clínicos ou estigmatizantes: *diagnóstico, transtorno, TDAH, dislexia, autismo, neurodivergência, deficiência, incapacidade, laudo, reprovação, retenção* e rótulos depreciativos |
| **Isolamento por turma** | `sameClass`, `requireOwnedClass` | Ferramentas aceitam apenas a turma do pedido, validando a posse do professor |
| **RLS do Supabase** | `auth.ts` | O back-end consulta o banco usando o token do professor e a chave `anon`, nunca `service_role` |
| **Sem dados, sem IA** | `tasks.ts` | Turmas sem resultados retornam `"dados insuficientes"` imediatamente, sem acionar o provedor |
| **Rascunho obrigatório** | `salvar_atividade`, `approveActivity` | A IA salva apenas como `draft`; aprovar exige sessão do professor e estrutura válida |
| **Limites de uso** | `rate-limit.ts` | 12 chamadas por professor a cada 10 minutos; no modo demo, 10 por IP a cada 10 minutos e teto global por hora (padrão: 60) |

> **Nota sobre escalabilidade:** O limite de chamadas reside na memória de cada instância do servidor. Em ambientes serverless com múltiplas instâncias (como a Vercel), o limite aplica-se por instância. Recomenda-se configurar também um teto de gastos no painel do provedor de IA.

---

## Rotas, Progresso, Erros e Modo Demonstração

### Endpoints da API

| Método e Rota | Login | Usa IA | Descrição |
| :--- | :---: | :---: | :--- |
| `POST /api/agent/analyze` | Sim | Sim | Executa o agente de análise de aprendizagem |
| `POST /api/agent/activities` | Sim | Sim | Executa o agente de geração de atividade (retorna status `201`) |
| `GET /api/agent/history?class_id=` | Sim | Não | Lista até 20 análises e 30 atividades geradas com IA da turma |
| `PATCH /api/activities/:id` | Sim | Não | Edição pelo professor; valida estrutura e retorna status para rascunho |
| `POST /api/activities/:id/approve` | Sim | Não | Aprovação pelo professor; altera status para `Planejada` |
| `POST /api/demo/analyze` | Não (demo) | Sim | Análise sobre um snapshot enviado pelo navegador |
| `POST /api/demo/activities` | Não (demo) | Sim | Geração de atividade sobre um snapshot |
| `POST /api/demo/activities/validate` | Não (demo) | Não | Confere a estrutura de uma atividade editada no modo demo |
| `POST /api/demo/grade` | Não (demo) | Sim | Correção de questões dissertativas |
| `GET /api/health` | Não | Não | Verifica configuração de Supabase/IA, provedor, modelo e status do modo demo (sem expor segredos) |

### Progresso em Tempo Real (NDJSON)

Ao enviar o cabeçalho `Accept: application/x-ndjson`, as rotas de análise e geração transmitem eventos em streaming (uma linha JSON por evento) enquanto a IA processa:

* **Status:** `{"type":"status", "phase":"checking" | "thinking" | "tool", "label":"..."}` (ex.: *"Calculando os indicadores de desempenho"*).
* **Etapa concluída:** `{"type":"step", "text":"..."}` (mesma descrição registrada em `operations`).
* **Finalização:** `{"type":"result", "status":201, "data":{...}}` em caso de sucesso, ou `{"type":"error", ...}` em caso de falha.

Sem esse cabeçalho, a API retorna um objeto JSON único ao final da execução.

### Códigos de Erro

Todo erro retorna um `code` estável e uma mensagem amigável pronta para exibição ao professor:

| Código | HTTP | Causa |
| :--- | :---: | :--- |
| `BAD_REQUEST` | `400` | Corpo inválido; retorna a lista de campos com problema |
| `UNAUTHENTICATED` | `401` | Token ausente ou sessão expirada |
| `FORBIDDEN` | `403` | Turma de outro professor, conta sem perfil docente, modo demo desligado ou origem não autorizada |
| `VALIDATION_FAILED` | `422` | Sem resultados no conteúdo ou atividade editada/aprovada com falha estrutural |
| `RATE_LIMITED` | `429` | Limite de chamadas atingido |
| `AI_NOT_CONFIGURED` | `503` | Chave de API do provedor ausente |
| `AI_AUTH`, `AI_RATE_LIMIT`, `AI_TIMEOUT`, `AI_UNAVAILABLE` | `502`–`504` | Falhas de comunicação ou limite no provedor de IA |
| `AI_REFUSAL` | `422` | O modelo recusou-se a continuar a geração |
| `AI_INVALID_RESPONSE` | `502` | Resposta truncada ou fora do esquema esperado |
| `AGENT_INCOMPLETE` | `502` | O agente atingiu o limite de 16 rodadas ou encerrou sem salvar o resultado |
| `DATA_ERROR` | `502` | Falha de leitura ou escrita no Supabase |

> **Retentativas:** Erros transitórios como limite de taxa, timeout, indisponibilidade, resposta inválida, agente incompleto e falhas de banco podem ser resolvidos tentando novamente.

### Modo Demonstração

Com `DEMO_MODE=true`, a IA opera sem autenticação. O navegador envia um snapshot da turma (IDs, notas, títulos, conteúdos, atividades e análises anteriores — **sem nomes ou observações**). O agente executa sobre um repositório em memória e nada é lido ou gravado no Supabase.

* **Limites do snapshot:** Até 80 estudantes, 150 avaliações, 5.000 resultados, 100 atividades e 30 análises.
* **Segurança:** As rotas aceitam apenas origens listadas em `ALLOWED_ORIGINS`. Como não exige login, qualquer acesso autorizado consome a cota de IA — utilize apenas em apresentações e **nunca com dados reais de alunos**.
