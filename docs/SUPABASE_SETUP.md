# Configurar o Supabase na EducaMente AI

## 1. Criar o projeto

Crie um projeto no Supabase e guarde a URL e a chave anon/publishable. Não compartilhe a chave `service_role`.

## 2. Executar a migration

No painel Supabase, abra **SQL Editor**, crie uma consulta e execute o conteúdo de:

`supabase/migrations/202611110001_initial_schema.sql`

A migration cria as dez tabelas previstas, índices, constraints, triggers de `updated_at` e políticas RLS.

## 3. Configurar o cliente web

Copie `supabase-config.example.js` para `supabase-config.js` e preencha:

```js
window.EDUCAMENTE_SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_ANON_OU_PUBLISHABLE"
};
```

O `supabase-config.js` não deve conter service role. O `.gitignore` foi atualizado para impedir o commit desse arquivo local.

## 4. Situação da integração

O app original usa `localStorage` e operações síncronas. O SDK Supabase foi preparado, mas os formulários ainda não foram migrados para chamadas assíncronas. Não considere a persistência remota ativa até implementar e testar os serviços CRUD.

## 5. Perfil e autenticação

A tabela `teachers` associa `auth.users.id` ao professor. O fluxo de onboarding deverá:
1. Criar conta com Supabase Auth.
2. Criar uma escola vinculada à conta autenticada (a migration registra `created_by`).
3. Criar o perfil `teachers` com `auth_user_id = auth.uid()`.
4. Criar turmas vinculadas ao `teacher_id` e `school_id`.

As policies RLS limitam o acesso aos dados do professor autenticado. Nesta versão inicial, o onboarding permite que a conta crie sua própria escola; associação a uma escola existente exige um fluxo administrativo/convite antes de produção.

## 6. Dados de demonstração e privacidade

Use nomes fictícios e resultados fictícios no hackathon. Não insira dados pessoais ou informações sensíveis de crianças reais. A aplicação precisa de revisão de privacidade, segurança e autorização antes de uso em escola.
