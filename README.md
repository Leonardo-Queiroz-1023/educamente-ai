# EducaMente AI

Aplicação web da EducaMente AI, com interface HTML/CSS/JavaScript e integração de dados com Supabase.

## Abrir a versão integrada

1. Mantenha o arquivo local `supabase-config.js` na raiz, com a URL do seu projeto e a chave pública `anon`/`publishable` (nunca use `service_role` ou `sb_secret`).
2. Abra a pasta pelo VS Code e inicie o Live Server em `index.html` (tela de entrada).
3. Entre com sua conta, crie uma conta nova (a escola e o perfil de professor são criados junto) ou escolha **Continuar sem conta** para usar só o armazenamento do navegador.
4. O painel fica em `dashboard.html`. Sem sessão, ele volta para a tela de entrada, a menos que o modo sem conta tenha sido escolhido.
5. Confira no cabeçalho o estado **Conectado à nuvem**. Em **Configurações**, também é possível ver a conta e o armazenamento ativo. O botão **Sair** encerra a sessão e apaga a cópia local dos dados da conta.
6. Cadastros, edições e exclusões dos módulos principais são sincronizados com o Supabase. O navegador mantém `localStorage` como cache de apoio.

| Arquivo | Papel |
|---|---|
| `index.html`, `auth.css`, `auth.js` | Tela de entrada: entrar, criar conta, recuperar senha, continuar sem conta |
| `dashboard.html`, `app.js`, `styles.css` | Painel do professor |
| `supabase-client.js`, `supabase-sync.js` | Cliente Supabase e sincronização do painel |
| `agent/` | Serviço do agente de IA (Next.js + TypeScript): análise pedagógica e geração de atividades |

## Agente de IA

O painel tem a página **Análise pedagógica** e o botão **Gerar atividade com IA** em Atividades. Os dois usam o serviço em `agent/`, que precisa estar rodando (`cd agent && npm install && npm run dev`) e configurado em `agent/.env.local`. Antes, aplique a migration `supabase/migrations/202611120001_ai_agent.sql`. Detalhes em [agent/README.md](agent/README.md).

A IA recebe só códigos de estudantes (E1, E2…), nunca nomes. Toda atividade gerada fica como rascunho até o professor aprovar.

**Apresentação do MVP sem login:** com `DEMO_MODE=true` em `agent/.env.local`, a IA também funciona em **Continuar sem conta**, usando os dados do navegador. Veja os cuidados em [agent/README.md](agent/README.md#modo-demonstração-sem-login-só-para-apresentar-o-mvp).

## Importador incluído

`importar-dados.html` e `importar-dados.js` são mantidos para a migração inicial dos registros locais. Abra pelo mesmo Live Server e na mesma origem de `index.html`. Quem usou o modo sem conta também pode enviar esses registros ao entrar: a tela de entrada oferece **Enviar para minha conta**.

## Estrutura Supabase

A migration inicial está em `supabase/migrations/202611110001_initial_schema.sql`. A migration seguinte adiciona a coluna de observações em alunos: `202611110002_students_observation.sql`. A `202611120001_ai_agent.sql` adiciona as colunas usadas pelo agente de IA.

## Limites desta etapa

- A sincronização Supabase cobre turmas, alunos, avaliações, resultados, atividades e planejamentos.
- O campo opcional `avaliacaoId` do planejamento não é armazenado porque a tabela `lesson_plans` atual não possui uma coluna correspondente.
- A IA funciona só com conta conectada (ela consulta os dados na nuvem), não no modo sem conta.
- Antes de uso com dados reais de crianças, revise consentimento, minimização de dados, políticas de privacidade e segurança.
- Teste primeiro com registros fictícios. Não envie dados de alunos para canais públicos.
