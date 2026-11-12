# Sincronização com Supabase

## Pré-requisitos

- Projeto Supabase já criado.
- Tabelas e políticas RLS aplicadas.
- `supabase-config.js` na raiz com URL e chave pública anon/publishable.
- Em **Authentication → URL Configuration**, o endereço da tela de entrada (por exemplo `http://127.0.0.1:5500/index.html`) cadastrado em **Redirect URLs**. Os links de confirmação de e-mail e de recuperação de senha voltam para ele.

## Como a aplicação funciona

`index.html` é a tela de entrada (`auth.js`): entrar, criar conta, recuperar senha ou continuar sem conta. Ao criar conta, os dados do perfil (nome, escola, município) ficam em `user_metadata` e, no primeiro acesso autenticado, a tela cria a escola (`schools`) e o perfil (`teachers`). Se esses dados faltarem, ela pede para concluir o cadastro.

`dashboard.html` carrega, nesta ordem: SDK Supabase, `supabase-config.js`, `supabase-client.js`, `supabase-sync.js` e `app.js`. Sem sessão (ou sem perfil de professor), o painel volta para `index.html`, a menos que o professor tenha escolhido **Continuar sem conta** (chave `educamente.localMode` no `localStorage`).

`supabase-sync.js` aguarda a sessão autenticada, localiza o perfil do professor e carrega as seis tabelas. Os dados remotos são convertidos para o formato legado que a interface já utiliza. O `app.js` então renderiza a interface com esses registros.

Quando a interface salva alterações, `persist()` atualiza o cache local e agenda upsert nas tabelas remotas. Exclusões removem dependências na ordem necessária para respeitar as chaves estrangeiras restritivas.

## Se aparecer “Modo local”

1. Clique em **Entrar** no cabeçalho do painel (ou abra `index.html`).
2. Entre com sua conta ou crie uma.
3. Confira o texto de conexão no cabeçalho e em Configurações.

## Registros criados sem conta

Ao entrar depois de usar o modo sem conta, a tela de entrada pergunta o que fazer com esses registros:
- **Enviar para minha conta**: o painel envia o cache local ao Supabase antes de carregar os dados da nuvem.
- **Não enviar**: o cache é copiado para a chave `educamente.v2.semConta` (cópia de segurança) e o painel passa a mostrar só os dados da conta.

Se continuar em modo local, abra o Console do navegador e consulte a primeira mensagem `[EducaMente AI]` para identificar a causa. Não compartilhe senha, chave secreta ou dados pessoais de alunos.

## Observações

- As operações de rede são assíncronas; o cache local é mantido para evitar perda de dados durante a navegação.
- A tabela `students` precisa da coluna `observation` para preservar o campo local `obs`.
- `questions` e `answer_key` são armazenados como JSONB; texto multilinha é convertido em lista de linhas.
- O campo opcional `avaliacaoId` dos planejamentos ainda não tem coluna equivalente na tabela `lesson_plans`.
- Faça o primeiro teste com dados fictícios e confira os registros no Table Editor antes de usar a aplicação em qualquer cenário real.
