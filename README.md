# EducaMente AI

Aplicação web da EducaMente AI, com interface HTML/CSS/JavaScript e integração de dados com Supabase.

## Abrir a versão integrada

1. Mantenha o arquivo local `supabase-config.js` na raiz, com a URL do seu projeto e a chave pública `anon`/`publishable` (nunca use `service_role` ou `sb_secret`).
2. Abra a pasta pelo VS Code e inicie o Live Server em `index.html`.
3. A aplicação usa a sessão Supabase já criada no importador para carregar os registros da nuvem.
4. Confira no cabeçalho o estado **Conectado à nuvem**. Em **Configurações**, também é possível ver a conta e o armazenamento ativo.
5. Cadastros, edições e exclusões dos módulos principais são sincronizados com o Supabase. O navegador mantém `localStorage` como cache de apoio.

## Importador incluído

`importar-dados.html` e `importar-dados.js` são mantidos para a migração inicial dos registros locais. Abra pelo mesmo Live Server e na mesma origem de `index.html`.

## Estrutura Supabase

A migration inicial está em `supabase/migrations/202611110001_initial_schema.sql`. A migration seguinte adiciona a coluna de observações em alunos: `202611110002_students_observation.sql`.

## Limites desta etapa

- A sincronização Supabase cobre turmas, alunos, avaliações, resultados, atividades e planejamentos.
- O campo opcional `avaliacaoId` do planejamento não é armazenado porque a tabela `lesson_plans` atual não possui uma coluna correspondente.
- Os agentes de IA ainda não estão conectados.
- Antes de uso com dados reais de crianças, revise consentimento, minimização de dados, políticas de privacidade e segurança.
- Teste primeiro com registros fictícios. Não envie dados de alunos para canais públicos.
