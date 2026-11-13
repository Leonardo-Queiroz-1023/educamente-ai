# EducaMente AI — Perfis de acesso e banco de dados

Data: 13/11/2026 · Status: **versão MVP demonstrativa aprovada pelo usuário**

## 0. Versão MVP (prevalece sobre o restante deste documento)

Decisão do usuário (13/11): o sistema é **somente demonstrativo**. As
configurações de acesso não precisam ser 100% funcionais; basta que cada
perfil tenha uma interface em que se consiga entrar para a apresentação.

O que muda em relação às seções 6–9 (que ficam como referência para a versão
real):

- **Login demonstrativo, sem Supabase Auth.** A tela de entrada ganha a escolha
  do perfil: Professor, Aluno, Responsável, Coordenação. Aluno e professor
  entram com o ID de acesso; responsável com nome completo + matrícula;
  coordenação com a chave de acesso. A conferência é feita no navegador, contra
  os dados de demonstração. A tela lista os acessos de demonstração para quem
  apresenta. O login atual do professor por e-mail continua como está.
- **Dados da escola no navegador.** Um conjunto de demonstração (escola, 8
  matérias, 2 turmas, professores, alunos, frequência, notas por bimestre,
  atividades, entregas, atestados, ocorrências, plano anual) é criado em
  `localStorage` na primeira visita e pode ser restaurado. Tudo o que a
  coordenação ou o professor cria na demonstração é gravado ali.
- **Portal único (`portal.html`)** com menus diferentes por perfil:
  - Aluno: frequência por matéria (estilo SIEPE), notas, atividades
    (responder), atestados (enviar), plano anual, desempenho.
  - Responsável: as mesmas telas em leitura; pode enviar atestado.
  - Coordenação: turmas (criar, adicionar professor × matéria), matrícula de
    alunos e liberação de professores (gera ID, matrícula), desempenho,
    ocorrências (advertência, suspensão), atestados (aprovar → faltas viram FJ).
  - Professor: chamada P / F / FJ, publicar atividade (objetivas e
    dissertativas com gabarito), correções com IA e relatório da turma; link
    para o painel pedagógico atual.
- **Correção pela IA.** Objetivas: corrigidas pelo gabarito, no navegador.
  Dissertativas: rota `POST /api/demo/grade` do agente (modo demonstração, sem
  login), que devolve nota, comentário e erros por resposta. Se o agente estiver
  desligado ou sem cota, o portal faz uma correção local aproximada e avisa que
  não foi a IA. O relatório da turma (taxa de acerto por questão, erros
  principais e mais recorrentes, alternativas erradas mais marcadas) é calculado
  sobre essas correções, para objetivas e dissertativas.
- **Supabase.** Uma migration (`202611130001_escola_mvp.sql`) cria as tabelas
  da seção 7 com RLS ligado e políticas simples por escola, para quando o
  sistema sair da demonstração. O portal não depende dela.
- **Ocorrências disciplinares:** visíveis para aluno e responsável (decisão
  minha; fácil de esconder).
- **Fora do MVP:** segurança real de login, envio de e-mail, sincronização do
  portal com o Supabase.

## 1. Intenção

Hoje o EducaMente atende só o professor: cada turma tem um único `teacher_id`,
alunos não têm conta e todo o RLS é "dono = professor". O objetivo é virar uma
plataforma da escola, com quatro perfis — **coordenação, professor, aluno e
responsável** — cada um com permissões próprias, mais frequência por matéria
(P / F / FJ, como no SIEPE), atividades publicadas aos alunos (estilo Google
Classroom), atestados, ocorrências disciplinares e, mais adiante, correção de
atividades pela IA.

O trabalho foi dividido em quatro projetos, nesta ordem:

1. **Banco, papéis e permissões (este documento).**
2. Telas de cada perfil (portal do aluno/responsável, painel da coordenação).
3. Professor: publicar atividades e lançar frequência no dashboard.
4. Agente de IA corrigindo as entregas e gerando o relatório da turma.

Este projeto entrega as tabelas, as regras de acesso (RLS), o armazenamento de
atestados e as rotas de login/criação de contas no servidor `agent/`, já com o
espaço reservado para os dados que os projetos 2–4 vão usar.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Cada perfil enxerga e altera exatamente o que a especificação permite, com a
  regra garantida **no banco** (RLS), não só na tela.
- Uma turma pode ter vários professores, cada um ligado a uma matéria.
- Frequência por aluno × matéria × aula, com P, F e FJ.
- Atestado enviado por aluno ou responsável, aprovado pela coordenação, que
  converte as faltas do período em FJ.
- Tabelas prontas para entrega de atividades e correção por questão (projeto 4).
- Corrigir a falha de RLS já conhecida (subconsultas que comparam a coluna com
  ela mesma, ex.: `c.teacher_id = teacher_id`).

**Não-objetivos (ficam para os projetos 2–4)**
- Telas novas, envio de e-mail, lógica da IA de correção.

**Anti-objetivos**
- Um perfil conseguir ler dados de aluno que não é seu, mesmo editando o
  JavaScript no navegador.
- A chave de serviço do Supabase chegar ao navegador.
- Quebrar o dashboard atual do professor ou apagar dados existentes.

## 3. Restrições

- Supabase (Postgres + Auth + Storage). Não há acesso direto ao banco a partir
  desta máquina: as migrations ficam em `supabase/migrations/` e o usuário as
  executa no SQL Editor do Supabase.
- O front atual conversa direto com o Supabase (`supabase-sync.js`) com a chave
  pública; o servidor `agent/` (Next.js) é o único lugar com chave de serviço.
- Dados de menores; atestado é dado de saúde (dado sensível na LGPD).

## 4. Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **A (escolhida)** | Supabase Auth para todos + RLS por papel | Segue a arquitetura atual; permissão garantida no banco | Reescrita do RLS existente |
| B | Tudo via servidor do agente, banco fechado ao cliente | Regras em TypeScript, fáceis de testar | Reescrever sync e telas; servidor vira ponto único de falha e de vazamento |
| C | Tabela de login própria | — | Reinventa senha/sessão; descartada |

Escolha do usuário: **A**.

## 5. Decisões do usuário

- **Aluno:** entra com um **ID de acesso** enviado pela coordenação por e-mail
  no ato da matrícula.
- **Professor:** entra com um **ID de acesso** liberado pela coordenação.
- **Coordenação:** entra com uma **chave de acesso única**.
- **Responsável:** entra com **nome completo do aluno + número de matrícula**,
  sem código adicional (opção 3). Risco registrado: quem souber esses dois
  dados de um aluno vê notas, faltas e atestados dele e pode enviar atestado em
  nome dele. O usuário aceitou esse risco; as mitigações da seção 7.4 não mudam
  o fluxo dos pais.

## 6. Modelo de acesso

### 6.1 Como cada perfil entra

Supabase Auth exige e-mail ou telefone, então o **ID de acesso vira um e-mail
técnico**: `<id>@login.educamente.invalid` (domínio `.invalid` nunca recebe
e-mail). A tela de login pede só o ID e a senha e monta esse endereço. O e-mail
real da pessoa fica guardado no perfil, para a coordenação enviar o ID.

| Perfil | Usuário | Senha | Quem cria a conta |
|---|---|---|---|
| Coordenação | chave de acesso (ID) | senha própria | primeira conta: script de instalação; demais: outra coordenação |
| Professor | ID de acesso | provisória → trocada no 1º acesso | coordenação |
| Aluno | ID de acesso | provisória → trocada no 1º acesso | coordenação (na matrícula) |
| Responsável | nome completo + matrícula | — | criado junto com o aluno |

- **IDs** são gerados pelo servidor: 8 caracteres de um alfabeto sem
  ambiguidades (sem 0/O, 1/I/L), aleatórios.
- **Senha provisória** gerada pelo servidor e devolvida uma única vez à tela da
  coordenação; `profiles.must_change_password = true` até a troca.
- **"Chave única" da coordenação** = uma conta por pessoa da coordenação (não
  uma chave compartilhada), para que advertências e aprovações de atestado
  registrem quem as fez. *(Decisão minha — ver seção 11.)*
- **Responsável:** a cada aluno corresponde um usuário técnico
  `resp-<student_id>@login.educamente.invalid`, sem senha utilizável. O login
  passa por `POST /api/auth/guardian` no servidor, que confere nome + matrícula
  e abre a sessão gerando um link mágico pelo Admin API e trocando-o por sessão
  no próprio servidor (`generateLink` → `verifyOtp`). Nenhuma senha é guardada.
  Consequência: um responsável com dois filhos entra uma vez para cada filho.

### 6.2 Papéis e funções auxiliares

Tabela `profiles` (1 linha por usuário do Auth) com `role` ∈
`coordinator | teacher | student | guardian`, `school_id` e o vínculo
(`teacher_id` ou `student_id`). Funções `security definer`, `stable`, com
`search_path = public`:

- `app_role()`, `app_school_id()`
- `current_teacher_id()` (já existe; passa a ler de `profiles`)
- `current_student_id()` — o aluno logado, ou o aluno do responsável logado
- `is_coordinator()` — papel coordenação **na escola da linha**
- `teaches_class(class_id)` / `teaches_class_subject(class_id, subject_id)`

Toda política de leitura é escrita por papel usando essas funções; toda
política de escrita verifica também a escola, para isolar escolas entre si.

## 7. Esquema

Nomes em inglês, seguindo as tabelas atuais. Toda tabela nova tem `id uuid`,
`created_at`, `updated_at` (trigger existente) e RLS habilitado.

### 7.1 Tabelas novas

- **profiles** — `id` (= `auth.users.id`), `school_id`, `role`, `login_id`
  (único), `contact_email`, `teacher_id`, `student_id`, `must_change_password`,
  `active`. Check: `teacher_id` só para professor; `student_id` só para aluno e
  responsável.
- **subjects** — matérias da escola: `school_id`, `name` (único por escola).
- **class_teachers** — `class_id`, `teacher_id`, `subject_id`; único por
  (turma, matéria). É o que "adicionar professor à turma" grava.
- **attendance** — `school_id`, `class_id`, `subject_id`, `student_id`,
  `lesson_date`, `lesson_number` (1..n aulas no dia), `status` ∈ `P | F | FJ`,
  `recorded_by` (professor), `certificate_id` (quando virou FJ por atestado).
  Único por (aluno, matéria, data, aula).
- **medical_certificates** — `school_id`, `student_id`, `submitted_by`
  (usuário), `submitter_role` (`student | guardian`), `file_path` (Storage),
  `start_date`, `end_date`, `note`, `status` ∈ `pending | approved | rejected`,
  `reviewed_by` (coordenação), `reviewed_at`, `review_note`.
- **disciplinary_records** — `school_id`, `student_id`, `kind` ∈
  `advertencia | suspensao | ocorrencia | outro`, `description`, `start_date`,
  `end_date` (suspensão), `created_by` (coordenação).
- **submissions** — entrega do aluno: `activity_id`, `student_id`, `status` ∈
  `draft | submitted | graded | returned`, `submitted_at`, `score`,
  `teacher_feedback`, `ai_graded_at`, `reviewed_by` (professor). Único por
  (atividade, aluno).
- **submission_answers** — uma linha por questão: `submission_id`,
  `question_index`, `answer` (jsonb), `is_correct`, `score`, `ai_comment`,
  `error_tags text[]`. Separado em linhas para a taxa de acerto por questão e
  os erros recorrentes saírem de consultas simples.
- **activity_reports** — relatório da turma por atividade (projeto 4):
  `activity_id`, `data jsonb` (acerto por questão, erros recorrentes, resumo),
  `generated_at`.
- **guardian_login_attempts** — `enrollment_number`, `ip_hash`, `success`,
  `created_at`; usada no limite de tentativas.

### 7.2 Alterações em tabelas existentes

- **students** — `enrollment_number` (aleatório, 10 dígitos, único por escola),
  `school_id`, `full_name_normalized` (minúsculas, sem acento e espaços
  repetidos, para o login do responsável), `contact_email`, `guardian_name`,
  `birth_date`, `auth_user_id`, `guardian_user_id`.
- **teachers** — `auth_user_id` continua; ganha vínculo com `profiles`.
- **classes** — `teacher_id` passa a ser **opcional** (professor regente/legado);
  o acesso passa a vir de `class_teachers`. A migration copia cada
  `classes.teacher_id` atual para `class_teachers`, sob a matéria "Geral".
- **assessments** — `subject_id`, `term` (1–4, bimestre).
- **activities** — `subject_id`, `teacher_id`, `published_at`, `due_at`,
  `max_points`, `accepts_submissions`. Aluno só vê atividades com
  `published_at` preenchido. `questions` passa a ter `type`
  (`objective | open`) por questão; `answer_key` nunca é exposta ao aluno (ver
  7.3).
- **lesson_plans** — `subject_id`, `school_year`, `published` (o plano anual
  visível ao aluno/responsável).
- **pedagogical_records** — continua sendo o registro do professor; ocorrências
  da coordenação vão para `disciplinary_records`.

### 7.3 Quem pode o quê

L = ler, E = escrever (inserir/alterar). "Própria(o)" = do aluno logado ou do
aluno do responsável.

| Tabela | Coordenação | Professor | Aluno | Responsável |
|---|---|---|---|---|
| schools, subjects | L/E (sua escola) | L | L | L |
| profiles | L/E (sua escola) | L (o próprio) | L (o próprio) | L (o próprio) |
| classes, class_teachers | L/E | L (onde leciona) | L (a sua) | L (a do filho) |
| students | L/E | L (de suas turmas) | L (o próprio) | L (o filho) |
| attendance | L | L/E (sua turma × matéria) | L (própria) | L (própria) |
| assessments, assessment_results | L | L/E (sua turma × matéria) | L (próprias) | L (próprias) |
| activities | L | L/E (sua turma × matéria) | L (publicadas da sua turma, **sem gabarito**) | L (idem) |
| submissions, submission_answers | L | L/E (correção) | L/E (a sua, até enviar) | L |
| activity_reports | L | L | — | — |
| lesson_plans | L | L/E | L (publicados) | L (publicados) |
| medical_certificates | L/E (aprovar) | L (de suas turmas) | L/E (enviar) | L/E (enviar) |
| disciplinary_records | L/E | L (de suas turmas) | **a decidir** | **a decidir** |
| pedagogical_records, pedagogical_analyses | L | L/E (como hoje) | — | — |

- **Gabarito escondido:** o aluno lê atividades por uma view
  `student_activities` que não inclui `answer_key`; a tabela `activities` não
  tem política de leitura para aluno/responsável.
- **Aluno não altera nota:** em `submission_answers` ele só grava `answer`;
  `is_correct`, `score`, `ai_comment` e `error_tags` são protegidos por
  trigger (só professor ou o servidor alteram). Depois de `submitted`, a
  entrega fica travada para o aluno.
- **Atestado → FJ:** ao aprovar (`status = approved`), um trigger muda para
  `FJ` todas as faltas `F` do aluno no período e preenche `certificate_id`.
  Rejeitar não altera faltas.
- **Desempenho:** views de leitura (`student_subject_summary`: média por
  matéria/bimestre, % de presença, total de F/FJ) respeitam o RLS das tabelas
  base (`security_invoker = true`).

### 7.4 Login do responsável — mitigações

- Matrícula aleatória de 10 dígitos (não sequencial).
- Limite: 5 tentativas falhas por matrícula e 20 por IP a cada 15 min
  (`guardian_login_attempts`); resposta sempre genérica ("dados não conferem").
- Comparação do nome normalizada (sem acento/caixa/espaços extras).
- A sessão do responsável é presa a um aluno e é só leitura, com exceção do
  envio de atestado.

### 7.5 Arquivos de atestado

Bucket privado `atestados`, caminho `<school_id>/<student_id>/<uuid>.<ext>`.
Upload permitido ao aluno/responsável só no caminho do próprio aluno; leitura
para esse aluno, coordenação da escola e professores da turma. Tipos aceitos:
PDF, JPG, PNG; até 5 MB.

## 8. Rotas novas no servidor `agent/`

Todas usam a chave de serviço (`SUPABASE_SERVICE_ROLE_KEY` em
`agent/.env.local`, nunca no front) e validam a entrada com zod.

- `POST /api/auth/guardian` — login do responsável (sem sessão prévia; com
  limite de tentativas).
- `POST /api/admin/students` — coordenação matricula um aluno: cria aluno,
  usuário do aluno, usuário técnico do responsável, ID e senha provisória.
- `POST /api/admin/teachers` — coordenação libera um professor.
- `POST /api/admin/coordinators` — coordenação cria outra conta de coordenação.
- `POST /api/admin/reset-password` — nova senha provisória.

As rotas `/api/admin/*` exigem sessão de coordenação e operam só na escola dela.
A primeira conta de coordenação é criada por um script
(`agent/scripts/bootstrap-coordinator.ts`) executado localmente.

## 9. Migração e compatibilidade

- Uma migration nova (`202611130001_school_roles.sql`), aditiva: não apaga
  colunas nem linhas.
- Backfill: quem criou cada escola vira **coordenação**; cada professor atual
  ganha perfil `teacher`; cada `classes.teacher_id` vira linha em
  `class_teachers` com a matéria "Geral".
- Políticas antigas são substituídas (`drop policy if exists` + nova), o que
  também corrige a falha conhecida.
- **Quebra conhecida:** o autocadastro atual do professor (`index.html`, que
  cria escola + professor) deixa de ser permitido: professor passa a vir da
  coordenação. A tela de login será ajustada no projeto 2; até lá, contas
  existentes continuam entrando normalmente.
- Script de verificação `supabase/tests/rls_roles.sql`: cria usuários de teste
  de cada papel em transação, confere cada linha da tabela 7.3 e faz rollback.

## 10. Segurança (resumo)

- **Autorização:** RLS por papel e escola em todas as tabelas; gabarito fora do
  alcance do aluno; nota protegida por trigger.
- **Autenticação:** senhas no Supabase Auth; troca obrigatória da senha
  provisória; responsável com nome + matrícula (risco aceito, mitigado em 7.4).
- **Entrada:** zod nas rotas; checks no banco (status, datas, bimestre).
- **Injeção:** só consultas parametrizadas do SDK; nada de SQL montado com texto.
- **Segredos:** chave de serviço só no servidor; `.env.local` já fora do Git.
- **Exposição de dados:** views de desempenho com `security_invoker`; atestados
  em bucket privado com URLs assinadas de curta duração.
- **Limite de taxa:** login do responsável e rotas de admin.

## 11. Decisões minhas (para revisão)

1. Uma conta por pessoa da coordenação, em vez de uma chave compartilhada.
2. Senha provisória + troca no 1º acesso para aluno e professor.
3. Coordenação aprova atestados; aprovação converte F → FJ automaticamente.
4. Notas organizadas por bimestre (1–4).
5. Responsável com dois filhos entra uma vez por filho (consequência da opção 3).
6. Envio do e-mail com o ID fica para o projeto 2; neste projeto a tela/rota
   devolve o ID e a senha provisória para a coordenação.

## 12. Em aberto (usuário)

- Ocorrências disciplinares (advertência, suspensão) ficam visíveis para o
  aluno e o responsável?

## 13. Deixado para quem constrói

Nomes de índices, formato exato do jsonb de `activity_reports.data`, mensagens
de erro das rotas, organização dos arquivos de teste.
