# Sincronização com Supabase

## Pré-requisitos

- Projeto Supabase já criado.
- Tabelas e políticas RLS aplicadas.
- Usuário Auth criado e linha correspondente em `public.teachers` vinculada à escola.
- `supabase-config.js` na raiz com URL e chave pública anon/publishable.
- Sessão autenticada no mesmo navegador e na mesma origem, obtida pelo importador.

## Como a aplicação funciona

`index.html` carrega, nesta ordem: SDK Supabase, `supabase-config.js`, `supabase-client.js`, `supabase-sync.js` e `app.js`.

`supabase-sync.js` aguarda a sessão autenticada, localiza o perfil do professor e carrega as seis tabelas. Os dados remotos são convertidos para o formato legado que a interface já utiliza. O `app.js` então renderiza a interface com esses registros.

Quando a interface salva alterações, `persist()` atualiza o cache local e agenda upsert nas tabelas remotas. Exclusões removem dependências na ordem necessária para respeitar as chaves estrangeiras restritivas.

## Se aparecer “Modo local”

1. Abra `importar-dados.html` pelo mesmo Live Server.
2. Entre com o usuário criado em Supabase Auth.
3. Volte para `index.html` e recarregue.
4. Confira o texto de conexão no cabeçalho e em Configurações.

Se continuar em modo local, abra o Console do navegador e consulte a primeira mensagem `[EducaMente AI]` para identificar a causa. Não compartilhe senha, chave secreta ou dados pessoais de alunos.

## Observações

- As operações de rede são assíncronas; o cache local é mantido para evitar perda de dados durante a navegação.
- A tabela `students` precisa da coluna `observation` para preservar o campo local `obs`.
- `questions` e `answer_key` são armazenados como JSONB; texto multilinha é convertido em lista de linhas.
- O campo opcional `avaliacaoId` dos planejamentos ainda não tem coluna equivalente na tabela `lesson_plans`.
- Faça o primeiro teste com dados fictícios e confira os registros no Table Editor antes de usar a aplicação em qualquer cenário real.
