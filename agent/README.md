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
| `AI_PROVIDER` | `anthropic` (Claude), `gemini` (Google AI Studio) ou `openrouter` (vários modelos com uma chave). |
| `AI_PROVIDER_API_KEY` | Chave do provedor: Console da Anthropic ou [aistudio.google.com/apikey](https://aistudio.google.com/apikey). **Só no servidor.** |
| `AI_MODEL` | Modelo. Em branco: `claude-opus-5-5` (anthropic), `gemini-3.8-flash` (gemini) ou `google/gemini-3.8-flash` (openrouter). |
| `OPENROUTER_API_KEY` | Chave do [OpenRouter](https://openrouter.ai/keys), lida só com `AI_PROVIDER=openrouter` (a conta precisa de créditos). Assim dá para alternar entre `gemini` e `openrouter` sem mexer nas chaves. **Só no servidor.** |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Os mesmos valores públicos do `supabase-config.js`. Não use a `service_role`. |
| `ALLOWED_ORIGINS` | Origens do front-end autorizadas (CORS). Padrão: Live Server em `127.0.0.1:5500` e `localhost:5500`. |

No front-end, `supabase-config.js` aceita `agentUrl` (padrão `http://localhost:3000`).

Antes do primeiro uso, aplique a migration `supabase/migrations/202611120001_ai_agent.sql` (SQL Editor do Supabase). Ela só adiciona colunas.

`GET /api/health` mostra se o Supabase e a chave da IA estão configurados, sem expor segredos. No painel: **Configurações → Verificar serviço de IA**.

Sem `AI_PROVIDER_API_KEY`, as rotas de IA respondem `AI_NOT_CONFIGURED` com a instrução do que configurar. Nenhuma resposta é simulada.

## Modo demonstração (sem login, só para apresentar o MVP)

Com `DEMO_MODE=true` em `agent/.env.local`, a IA funciona **sem login**: o painel envia ao agente uma cópia dos dados da turma que estão no navegador (ids, notas, títulos e conteúdos das avaliações; **sem nomes de alunos nem observações**), o agente roda em memória e devolve o resultado, que fica salvo só no navegador. Nada é lido ou gravado no Supabase.

Para apresentar: `DEMO_MODE=true`, reinicie o serviço, abra o app, clique em **Continuar sem conta**, carregue os dados de demonstração (Configurações) e use **Análise pedagógica**.

**Para quem clonar o repositório usar a IA sem configurar nada:** publique o agente uma vez na Vercel, com `DEMO_MODE=true`, e coloque o endereço em `agentUrl` no `supabase-config.js`. Passo a passo em [DEPLOY.md](DEPLOY.md).

Cuidados: a rota não exige login, então quem alcançar o serviço gasta a sua cota de IA. Há checagem de origem (`ALLOWED_ORIGINS`), limite de 10 chamadas por IP a cada 10 minutos e limites de tamanho. Deixe `DEMO_MODE=false` fora das apresentações e nunca use com dados reais de alunos.

## Rotas

| Método e rota | O que faz |
|---|---|
| `POST /api/agent/analyze` | Análise de aprendizagem de uma turma (filtros opcionais: avaliação, componente, conteúdo, datas). Grava em `pedagogical_analyses`. |
| `POST /api/agent/activities` | Gera uma atividade e a salva com `status = "draft"` e `origin = "ai"`. |
| `GET /api/agent/history?class_id=` | Análises e atividades geradas com IA da turma. |
| `PATCH /api/activities/:id` | Edição pelo professor (volta a ser rascunho). |
| `POST /api/activities/:id/approve` | Aprovação pelo professor. O agente nunca chama esta rota. |

Todas exigem `Authorization: Bearer <token da sessão Supabase>`.

No modo demonstração (sem login, só com `DEMO_MODE=true` e origem autorizada): `POST /api/demo/analyze`, `POST /api/demo/activities` (ambas recebem `snapshot` com os dados da turma) e `POST /api/demo/activities/validate` (confere a estrutura de uma atividade editada ou a aprovar, sem IA).

## Arquitetura

```
app/api/...            Route Handlers (validação Zod, autenticação, CORS, erros)
src/lib/auth.ts        Valida o token e cria um cliente Supabase COMO o professor (RLS vale)
src/lib/data/          Repositório de dados (Supabase; versão em memória nos testes)
src/lib/domain/        Cálculos de desempenho, pseudônimos, níveis, validação, proteções
src/lib/ai/            Camada do provedor: interface neutra + adaptadores Anthropic e Gemini
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
npm test          # 21 testes: cálculos, proteções, validação, os 5 cenários, adaptador Gemini e modo demonstração
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
