# Agente de IA — EducaMente AI

Serviço em **Next.js (Route Handlers, só API) + TypeScript** que analisa os resultados das avaliações e gera atividades personalizadas. O front-end estático (`index.html`, `dashboard.html`) continua como está e chama este serviço com a sessão do professor.

O agente não é um chatbot: ele usa **ferramentas reais** no backend (consultas ao Supabase, cálculos, geração, validação e gravação), e a interface mostra só as operações que de fato aconteceram.

## Como rodar

```bash
cd agent
npm install
cp .env.example .env.local   # preencha os valores
npm run dev                  # http://localhost:3000
```

Variáveis em `agent/.env.local`:

| Variável | Para quê |
|---|---|
| `AI_PROVIDER` | Provedor de IA. Hoje: `anthropic` (Claude). |
| `AI_PROVIDER_API_KEY` | Chave da API do provedor (Console da Anthropic). **Só no servidor.** |
| `AI_MODEL` | Modelo. Padrão: `claude-opus-5-5`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Os mesmos valores públicos do `supabase-config.js`. Não use a `service_role`. |
| `ALLOWED_ORIGINS` | Origens do front-end autorizadas (CORS). Padrão: Live Server em `127.0.0.1:5500` e `localhost:5500`. |

No front-end, `supabase-config.js` aceita `agentUrl` (padrão `http://localhost:3000`).

Antes do primeiro uso, aplique a migration `supabase/migrations/202611120001_ai_agent.sql` (SQL Editor do Supabase). Ela só adiciona colunas.

`GET /api/health` mostra se o Supabase e a chave da IA estão configurados, sem expor segredos. No painel: **Configurações → Verificar serviço de IA**.

Sem `AI_PROVIDER_API_KEY`, as rotas de IA respondem `AI_NOT_CONFIGURED` com a instrução do que configurar. Nenhuma resposta é simulada.

## Rotas

| Método e rota | O que faz |
|---|---|
| `POST /api/agent/analyze` | Análise de aprendizagem de uma turma (filtros opcionais: avaliação, componente, conteúdo, datas). Grava em `pedagogical_analyses`. |
| `POST /api/agent/activities` | Gera uma atividade e a salva com `status = "draft"` e `origin = "ai"`. |
| `GET /api/agent/history?class_id=` | Análises e atividades geradas com IA da turma. |
| `PATCH /api/activities/:id` | Edição pelo professor (volta a ser rascunho). |
| `POST /api/activities/:id/approve` | Aprovação pelo professor. O agente nunca chama esta rota. |

Todas exigem `Authorization: Bearer <token da sessão Supabase>`.

## Arquitetura

```
app/api/...            Route Handlers (validação Zod, autenticação, CORS, erros)
src/lib/auth.ts        Valida o token e cria um cliente Supabase COMO o professor (RLS vale)
src/lib/data/          Repositório de dados (Supabase; versão em memória nos testes)
src/lib/domain/        Cálculos de desempenho, pseudônimos, níveis, validação, proteções
src/lib/ai/            Camada do provedor: interface neutra + adaptador Anthropic
src/lib/agent/         Prompts, ferramentas, loop do agente e as duas tarefas
```

**Trocar de provedor:** escreva outro adaptador que implemente `AiProvider` (`src/lib/ai/provider.ts`) e registre-o em `src/lib/ai/index.ts`. O agente não conhece o SDK do provedor.

### Ferramentas

| Ferramenta | Trabalho real |
|---|---|
| `buscar_resultados` | Consulta avaliações e resultados no Supabase (RLS do professor). |
| `analisar_desempenho` | Calcula no código: média geral, por conteúdo e componente, por estudante, distribuição, diferença entre conteúdos, evolução entre avaliações comparáveis. |
| `consultar_historico` | Histórico da turma ou de um estudante (pelo código), atividades e análises anteriores. |
| `planejar_intervencao` | Público-alvo e evidências pelos dados; compara o nível escolhido com o sugerido. |
| `gerar_atividade` | Geração com saída estruturada (Zod), com os parâmetros do professor. |
| `validar_atividade` | Checagens estruturais no código + revisão de conteúdo por uma chamada separada. |
| `salvar_atividade` | Insere em `activities` como `draft`. Recusa rascunho não validado. |
| `registrar_analise` | Insere em `pedagogical_analyses`. Recusa percentuais que não existem nos indicadores e linguagem de diagnóstico. |

### Responsabilidade pedagógica e privacidade

- O modelo recebe estudantes só como códigos (`E1`, `E2`…). Nomes nunca saem do navegador; o backend nem consulta nomes.
- Observações escritas pelo professor sobre alunos não são enviadas ao modelo.
- Todo número citado pela IA vem dos indicadores calculados; textos com percentuais inexistentes são recusados.
- Termos de diagnóstico, rótulo ou reprovação são bloqueados no código, além do prompt.
- Turma sem resultados: a resposta é "dados insuficientes" e a IA nem é acionada.
- Atividades ficam como rascunho; edição volta a rascunho; aprovação só pelo professor e só com a estrutura válida.

## Testes

```bash
npm test          # 13 testes: cálculos, proteções, validação e os 5 cenários
npm run typecheck
npm run build
```

Os cenários (`tests/agent-scenarios.test.ts`) rodam o código real do agente com um **provedor roteirizado** (um dublê de teste, não é IA) e um repositório em memória com dados fictícios: resultados variados, bom desempenho, turma sem avaliações, geração de atividade e falha da API.

### Teste com a IA real

Com `agent/.env.local` preenchido e a migration aplicada:

1. `npm run dev` nesta pasta e o Live Server na raiz.
2. Entre com uma conta de teste e carregue os **dados de demonstração** (Configurações). Eles são sincronizados com o Supabase.
3. **Análise pedagógica → Analisar aprendizagem com IA**, depois **Gerar atividade com IA**.
4. Teste a falha da API trocando `AI_PROVIDER_API_KEY` por um valor inválido: a tela mostra o erro e nada é gravado.
