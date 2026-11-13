# Publicar o agente de IA (Vercel)

Com o agente publicado, quem clonar o repositório usa a IA **sem chave, sem `.env.local` e sem rodar `npm run dev`**: abre o `index.html`, clica em **Continuar sem conta** e pronto. As chaves de API ficam guardadas só no painel da Vercel, nunca no GitHub.

> O repositório é público. Nunca coloque chaves de API em arquivos commitados: a Anthropic desativa automaticamente chaves encontradas em repositórios públicos e qualquer pessoa poderia gastar seus créditos.

## Antes de começar

1. **Gere chaves novas.** As chaves atuais já circularam fora do computador. No Console da Anthropic (*Settings → API Keys*), crie uma chave nova e apague a antiga.
2. **Defina um limite de gasto** na conta da Anthropic (*Settings → Limits*). O endereço publicado fica aberto na internet: esse limite é a proteção que realmente segura a conta.
3. **Acesso ao repositório.** A Vercel só importa repositórios que a sua conta do GitHub enxerga. Se o repositório não for seu, peça ao dono para publicar ou para adicionar você como colaborador.
4. **Branch.** A Vercel publica a branch principal (`main`). As mudanças do agente precisam estar nela (faça o merge antes).

## Passo a passo

1. Entre em [vercel.com](https://vercel.com) com a conta do GitHub (o plano gratuito *Hobby* basta).
2. **Add New → Project** e importe o repositório `educamente-ai`.
3. Em **Root Directory**, escolha `agent`. O *Framework Preset* fica como **Next.js** (detectado sozinho).
4. Em **Environment Variables**, cadastre:

   | Variável | Valor |
   |---|---|
   | `AI_PROVIDER` | `anthropic` |
   | `AI_PROVIDER_API_KEY` | a chave nova da Anthropic |
   | `AI_MODEL` | deixe em branco (usa `claude-opus-5-5`) ou `claude-sonnet-5-5` para gastar menos |
   | `DEMO_MODE` | `true` |
   | `ALLOWED_ORIGINS` | `http://localhost:*,http://127.0.0.1:*` |
   | `DEMO_GLOBAL_LIMIT_PER_HOUR` | `60` (teto de chamadas de IA por hora, somando todo mundo) |

   `SUPABASE_URL` e `SUPABASE_ANON_KEY` só são necessários para as rotas com login; o modo sem conta não usa o Supabase.

5. Clique em **Deploy** e espere terminar.
6. Abra `https://SEU-PROJETO.vercel.app/api/health` no navegador. Deve aparecer `"ai_configured":true` e `"demo_mode":true`.
7. No arquivo `supabase-config.js` (na raiz do repositório), troque `agentUrl` pelo endereço publicado, sem barra no fim:

   ```js
   agentUrl: "https://SEU-PROJETO.vercel.app"
   ```

8. Faça commit e push dessa linha. A partir daí, todo clone já aponta para o agente publicado.

## Como quem clona usa

1. Clone o repositório e abra a pasta no VS Code.
2. Abra o `index.html` com o **Live Server** (qualquer porta em `localhost` ou `127.0.0.1` funciona).
3. Clique em **Continuar sem conta**.
4. Em **Configurações**, carregue os dados de demonstração e use **Análise pedagógica** ou a geração de atividades. No portal da escola, a correção com IA também usa o agente publicado.

## Proteções e custos

- **Sem login de propósito:** as rotas `/api/demo/*` atendem qualquer visitante, como pedido para o MVP.
- **Origem:** só páginas abertas em `localhost` ou `127.0.0.1` são aceitas pelo navegador. Isso impede outros sites de usarem o agente, mas não impede um script de chamar a API diretamente.
- **Limites:** 10 chamadas por IP a cada 10 minutos e o teto geral por hora (`DEMO_GLOBAL_LIMIT_PER_HOUR`). Os dois ficam na memória de cada instância do servidor e recomeçam quando a Vercel cria uma instância nova, por isso o **limite de gasto na Anthropic** continua sendo obrigatório.
- **Dados:** o navegador envia só códigos de alunos, notas e títulos de avaliações (sem nomes). Use apenas dados fictícios.
- **Tempo:** a geração de atividades pode levar alguns minutos; as rotas aceitam até 300 s, o máximo do plano gratuito.
- **Desligar:** na Vercel, mude `DEMO_MODE` para `false` e faça *Redeploy*. O agente continua no ar, mas recusa o uso sem login.
