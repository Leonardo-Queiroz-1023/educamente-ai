# Plano de migração — EducaMente AI

## Diagnóstico do projeto recebido

- Frontend: `index.html`, `styles.css`, `app.js`.
- JavaScript puro; não há Next.js, TypeScript, package.json ou backend.
- Persistência atual: `localStorage`, chave `educamente.v2`.
- Entidades atuais: turmas, alunos, avaliações, resultados, atividades, planejamentos e configurações.
- O dashboard e os módulos calculam indicadores a partir do objeto local `DB`.
- Não existe autenticação real.

## Estratégia sem reconstrução

1. Manter o HTML/CSS e os fluxos existentes.
2. Criar o esquema PostgreSQL e políticas RLS.
3. Configurar Supabase Auth e perfil do professor.
4. Criar serviços assíncronos para cada entidade.
5. Introduzir carregamento inicial do banco antes de renderizar o dashboard.
6. Migrar gravação/edição/exclusão e resultados, preservando fallback/exportação local.
7. Migrar indicadores do dashboard para dados sincronizados.
8. Testar isolamento entre dois usuários, persistência, erros e exclusões.

## Mapeamento inicial de campos

| Modelo atual | Supabase |
|---|---|
| turmas.nome | classes.name |
| turmas.ano | classes.grade |
| turmas.turno | classes.shift |
| turmas.escola | schools.name |
| turmas.anoLetivo | classes.school_year |
| alunos.nome | students.name |
| alunos.turmaId | students.class_id |
| avaliacoes.nome | assessments.title |
| avaliacoes.componente | assessments.subject |
| avaliacoes.conteudo | assessments.content |
| avaliacoes.data | assessments.assessment_date |
| avaliacoes.total | assessments.total_points |
| resultados.pontos | assessment_results.score |
| resultados.obs | assessment_results.observation |
| atividades.titulo | activities.title |
| atividades.objetivo | activities.objective |
| atividades.habilidade | activities.skill |
| planejamentos.inicio/fim | lesson_plans.start_date/end_date |

## Limitações desta entrega

- Nenhuma credencial Supabase foi fornecida.
- O cliente SDK está preparado, mas os CRUDs ainda usam `localStorage`.
- Login, logout e recuperação de senha ainda não foram conectados à interface.
- A migration precisa ser executada e testada no projeto Supabase.
- A migration e as políticas precisam de revisão antes de dados reais.
- O app original não é Next.js/TypeScript; a conversão não foi feita para preservar a aplicação recebida.


## Sincronização implementada (versão integrada)

A versão integrada adiciona `supabase-sync.js`, que carrega as seis tabelas sob a sessão autenticada do professor e sincroniza upserts e exclusões a partir dos serviços usados pela interface. O cache local é mantido como apoio. A conexão real deve ser validada no navegador do projeto, conferindo o estado no cabeçalho e testando criação/edição/exclusão com dados fictícios.
