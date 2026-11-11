# Backend / Supabase

## Situação atual

O ZIP original contém uma aplicação estática em HTML, CSS e JavaScript. Não há servidor Node/Next.js/FastAPI nem `package.json`. Para preservar a interface, esta etapa prepara o banco e o cliente Supabase sem converter a aplicação.

## Conteúdo

- `../supabase/migrations/`: criação das tabelas, índices, constraints e políticas RLS.
- `../supabase-config.example.js`: exemplo de configuração do cliente browser.
- `../supabase-client.js`: inicialização opcional do SDK.
- `.env.example`: nomes das variáveis para futura execução em servidor.

## Próximos passos para conexão real

1. Criar um projeto Supabase.
2. Executar a migration SQL.
3. Copiar `supabase-config.example.js` para `supabase-config.js`.
4. Preencher `url` e `anonKey` com os valores do painel Supabase.
5. Não inserir `SUPABASE_SERVICE_ROLE_KEY` no frontend.
6. Implementar e testar login/perfil do professor.
7. Migrar cada CRUD do `app.js` para serviços assíncronos Supabase, mantendo localStorage como fallback até validar persistência.

**Atenção:** a aplicação ainda não faz CRUD no Supabase. O armazenamento atual continua sendo `localStorage`; o cliente é apenas preparado nesta entrega.
