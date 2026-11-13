# Portal da escola (MVP demonstrativo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quatro perfis (aluno, responsável, coordenação, professor) entram por uma tela de login demonstrativa e usam um portal com as funções da especificação; a IA corrige entregas e gera o relatório da turma.

**Architecture:** Dados da escola em `localStorage` (semente determinística), lógica pura em `escola-core.js` (testada com `node --test`), telas em `portal.html`/`portal.js` reaproveitando os tokens de `styles.css`. Correção de dissertativas pela rota `POST /api/demo/grade` do agente, com correção local de reserva. Migration Supabase separada, não usada pelo portal.

**Tech Stack:** HTML/CSS/JS sem build (front), Node `node:test`, Next.js + zod + vitest (agent), SQL Postgres.

**Spec:** `docs/superpowers/specs/2026-11-13-perfis-acesso-banco-design.md` (seção 0 prevalece).

## Global Constraints

- Textos de interface em português do Brasil.
- Nenhuma chave ou segredo no front; a rota de correção respeita `requireDemo` (DEMO_MODE, origem, limite por IP).
- Não quebrar o login por e-mail nem o dashboard atual.
- Sem commit/push (preferência do usuário).
- Ícones em SVG próprio, não emoji, nas telas novas.

## Review Focus

1. Aluno com zero aulas ou zero notas numa matéria → mostra "—", não `NaN`/divisão por zero.
2. Nome do responsável digitado com acento/caixa/espaços diferentes → entra mesmo assim.
3. Entrega com questão em branco → conta como erro, não quebra a correção.
4. Agente desligado ou sem cota → correção local, com aviso visível.
5. Atestado aprovado → só faltas `F` dentro do período viram `FJ`; `P` e outras datas intactas.

---

### Task 1: Núcleo de dados e regras (`escola-core.js`)

**Files:** Create `escola-core.js`, `tests/escola-core.test.mjs`

**Interfaces — Produces** (`globalThis.EscolaCore` e `module.exports`):
- `seed(): Escola` — objeto com `escola, materias[], turmas[], professores[], alunos[], coordenadores[], aulas[]` (frequência), `notas[]`, `atividades[]`, `entregas[]`, `atestados[]`, `ocorrencias[]`, `planos[]`.
- `normalizeName(s): string`
- `authenticate(db, role, creds): {role, id} | null` — roles `aluno|professor|responsavel|coordenacao`.
- `attendanceSummary(db, alunoId): [{materiaId, materia, aulas, P, F, FJ, freq}]` (`freq` null se 0 aulas).
- `gradeSummary(db, alunoId): [{materiaId, materia, bimestres:[n|null x4], media|null}]`
- `gradeObjective(q, resposta): {correta, pontos, erro|null}`
- `gradeOpenLocal(q, resposta): {correta, pontos, comentario, erros[]}`
- `activityReport(db, atividadeId): {entregas, mediaPct, questoes:[{indice, enunciado, tipo, taxaAcerto, errosComuns:[{erro, qtd}]}], errosRecorrentes:[{erro, qtd}]}`
- `approveCertificate(db, atestadoId, coordId): number` (faltas convertidas)
- `newAccessId(db): string`, `newEnrollment(db): string`

- [ ] Testes: semente tem os 4 perfis com credenciais; `authenticate` aceita "  ana   beatriz SOUZA" para "Ana Beatriz Souza"; resumo de frequência sem aulas → `freq: null`; objetiva errada registra a alternativa marcada como erro; em branco → `correta:false`; relatório calcula taxa de acerto 50% com 2 entregas (1 certa); atestado converte só F do período.
- [ ] `node --test tests/` falha → implementar → passa.

### Task 2: Rota de correção da IA (`agent`)

**Files:** Create `agent/src/lib/grading.ts`, `agent/app/api/demo/grade/route.ts`, `agent/tests/grading.test.ts`

**Interfaces:** `GradeRequestSchema` (atividade com questões dissertativas `{indice, enunciado, respostaEsperada, pontos}`, entregas `{id, respostas:[{indice, resposta}]}` máx 60) → `gradeOpenAnswers(provider, req): Promise<{correcoes:[{entregaId, indice, pontos, correta, comentario, erros[]}], resumo}>`. Rota: `requireDemo(req)`, `readJson`, `json`. Sem nomes de aluno no corpo.

- [ ] Teste com provedor roteirizado (`tests/helpers.ts`): pontos limitados a `[0, pontos da questão]`, entrega desconhecida descartada.
- [ ] `npx vitest run tests/grading.test.ts` passa; `npx tsc --noEmit` limpo.

### Task 3: Login por perfil (`index.html`, `auth.js`, `auth.css`)

- [ ] Seletor de perfil (Professor | Aluno | Responsável | Coordenação) acima das abas. Professor mantém o fluxo atual + "Entrar com ID de acesso (demonstração)". Outros perfis: formulário próprio → `EscolaCore.authenticate` → grava `educamente.portal.sessao` → `portal.html`.
- [ ] Bloco "Acessos de demonstração" com as credenciais da semente.

### Task 4: Portal (`portal.html`, `portal.css`, `portal.js`)

- [ ] Cabeçalho e menu lateral como o dashboard; menu por perfil (spec §0).
- [ ] Aluno/Responsável: Início, Frequência, Notas, Atividades (responder — só aluno), Atestados (enviar), Plano anual, Ocorrências, Desempenho.
- [ ] Coordenação: Turmas (+ professor × matéria), Alunos (matricular → mostra ID/matrícula), Professores (liberar → ID), Desempenho, Ocorrências (registrar), Atestados (aprovar/recusar).
- [ ] Professor: Chamada (P/F/FJ), Atividades (publicar com questões), Correções (IA + relatório), link "Painel pedagógico".
- [ ] Sessão ausente → volta ao login; "Restaurar demonstração".

### Task 5: Migration Supabase + ligação no dashboard + verificação

- [ ] `supabase/migrations/202611130001_escola_mvp.sql` (tabelas da spec §7, RLS ligado, políticas simples por escola).
- [ ] Item "Sala de aula" no menu do dashboard → `portal.html` como professor.
- [ ] Capturas headless (claro/escuro, 1280 e 390 px) dos 4 perfis; `impeccable detect`; corrigir.
