-- EducaMente AI — perfis da escola (coordenação, professor, aluno, responsável),
-- frequência, atividades com entrega, atestados e ocorrências.
-- VERSÃO MVP: o portal de demonstração NÃO usa estas tabelas (os dados ficam no
-- navegador). Elas preparam o banco para a versão real. Aditiva: não apaga
-- colunas nem linhas. Execute no SQL Editor do Supabase depois das migrations anteriores.
-- Políticas simples por escola; revise antes de usar com dados reais
-- (ver docs/superpowers/specs/2026-11-13-perfis-acesso-banco-design.md, seções 6–7).

-- ===== perfis =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  role text not null check (role in ('coordinator', 'teacher', 'student', 'guardian')),
  login_id text not null unique,
  contact_email text,
  teacher_id uuid references public.teachers(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_link_matches_role check (
    (role = 'teacher' and teacher_id is not null and student_id is null)
    or (role in ('student', 'guardian') and student_id is not null and teacher_id is null)
    or (role = 'coordinator' and teacher_id is null and student_id is null))
);

-- ===== matérias e professores por turma =====
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_unique_name unique (school_id, name)
);

create table if not exists public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_teachers_one_per_subject unique (class_id, subject_id)
);

-- ===== alterações em tabelas existentes =====
alter table public.students
  add column if not exists school_id uuid references public.schools(id) on delete restrict,
  add column if not exists enrollment_number text,
  add column if not exists full_name_normalized text,
  add column if not exists contact_email text,
  add column if not exists guardian_name text,
  add column if not exists birth_date date,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists guardian_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists students_enrollment_unique on public.students(school_id, enrollment_number) where enrollment_number is not null;

alter table public.classes alter column teacher_id drop not null;

alter table public.assessments
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists term smallint check (term between 1 and 4);

alter table public.activities
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists due_at date,
  add column if not exists max_points numeric(10,2),
  add column if not exists accepts_submissions boolean not null default false;

alter table public.lesson_plans
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists school_year integer,
  add column if not exists published boolean not null default false;

-- ===== frequência =====
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_date date not null,
  lesson_number smallint not null default 1 check (lesson_number between 1 and 10),
  status text not null check (status in ('P', 'F', 'FJ')),
  recorded_by uuid references public.teachers(id) on delete set null,
  certificate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_one_per_lesson unique (student_id, subject_id, lesson_date, lesson_number)
);

-- ===== atestados e ocorrências =====
create table if not exists public.medical_certificates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  submitter_role text not null check (submitter_role in ('student', 'guardian', 'coordinator')),
  file_path text,
  start_date date not null,
  end_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificate_dates check (end_date >= start_date)
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_certificate_fk') then
    alter table public.attendance add constraint attendance_certificate_fk
      foreign key (certificate_id) references public.medical_certificates(id) on delete set null;
  end if;
end $$;

create table if not exists public.disciplinary_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('advertencia', 'suspensao', 'ocorrencia', 'elogio')),
  description text not null,
  start_date date not null default current_date,
  end_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disciplinary_dates check (end_date is null or end_date >= start_date)
);

-- ===== entregas e correção =====
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'graded', 'returned')),
  submitted_at timestamptz,
  score numeric(10,2),
  teacher_feedback text,
  ai_graded_at timestamptz,
  reviewed_by uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_one_per_student unique (activity_id, student_id)
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_index smallint not null,
  answer jsonb,
  is_correct boolean,
  score numeric(10,2),
  ai_comment text,
  error_tags text[] not null default '{}',
  grading_source text check (grading_source in ('answer_key', 'ai', 'local', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submission_answers_one_per_question unique (submission_id, question_index)
);

create table if not exists public.activity_reports (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists idx_attendance_student on public.attendance(student_id, subject_id, lesson_date);
create index if not exists idx_attendance_class_date on public.attendance(class_id, lesson_date);
create index if not exists idx_certificates_student on public.medical_certificates(student_id, status);
create index if not exists idx_disciplinary_student on public.disciplinary_records(student_id, start_date desc);
create index if not exists idx_submissions_activity on public.submissions(activity_id);
create index if not exists idx_class_teachers_teacher on public.class_teachers(teacher_id);

do $$
declare t text;
begin
  foreach t in array array['profiles','subjects','class_teachers','attendance','medical_certificates','disciplinary_records','submissions','submission_answers'] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ===== funções de papel (security definer: leem perfis sem passar pelo RLS) =====
create or replace function public.app_school_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select school_id from public.profiles where id = auth.uid()),
    (select school_id from public.teachers where auth_user_id = auth.uid() limit 1));
$$;

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    case when exists (select 1 from public.teachers where auth_user_id = auth.uid()) then 'teacher' end);
$$;

create or replace function public.current_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid() and role in ('student', 'guardian');
$$;

-- Professor da turma: vínculo novo (class_teachers) ou o regente antigo (classes.teacher_id).
create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_teachers ct where ct.class_id = p_class and ct.teacher_id = public.current_teacher_id())
      or exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = public.current_teacher_id());
$$;

-- ===== backfill =====
-- Quem criou a escola vira coordenação; professores atuais ganham perfil de professor.
insert into public.profiles (id, school_id, role, login_id, contact_email, must_change_password)
select s.created_by, s.id, 'coordinator', 'COORD-' || upper(substr(replace(s.id::text, '-', ''), 1, 6)), u.email, false
from public.schools s join auth.users u on u.id = s.created_by
where not exists (select 1 from public.profiles p where p.id = s.created_by)
  and not exists (select 1 from public.teachers t where t.auth_user_id = s.created_by)
on conflict do nothing;

insert into public.profiles (id, school_id, role, login_id, contact_email, teacher_id, must_change_password)
select t.auth_user_id, t.school_id, 'teacher', 'PRF-' || upper(substr(replace(t.id::text, '-', ''), 1, 6)), t.email, t.id, false
from public.teachers t
where not exists (select 1 from public.profiles p where p.id = t.auth_user_id)
on conflict do nothing;

update public.students st set school_id = c.school_id
from public.classes c where c.id = st.class_id and st.school_id is null;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.class_teachers enable row level security;
alter table public.attendance enable row level security;
alter table public.medical_certificates enable row level security;
alter table public.disciplinary_records enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.activity_reports enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or (public.app_role() = 'coordinator' and school_id = public.app_school_id()));
drop policy if exists profiles_coord_write on public.profiles;
create policy profiles_coord_write on public.profiles for all to authenticated
using (public.app_role() = 'coordinator' and school_id = public.app_school_id())
with check (public.app_role() = 'coordinator' and school_id = public.app_school_id());

drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects for select to authenticated using (school_id = public.app_school_id());
drop policy if exists subjects_coord_write on public.subjects;
create policy subjects_coord_write on public.subjects for all to authenticated
using (public.app_role() = 'coordinator' and school_id = public.app_school_id())
with check (public.app_role() = 'coordinator' and school_id = public.app_school_id());

drop policy if exists class_teachers_select on public.class_teachers;
create policy class_teachers_select on public.class_teachers for select to authenticated
using (exists (select 1 from public.classes c where c.id = class_teachers.class_id and c.school_id = public.app_school_id()));
drop policy if exists class_teachers_coord_write on public.class_teachers;
create policy class_teachers_coord_write on public.class_teachers for all to authenticated
using (public.app_role() = 'coordinator' and exists (select 1 from public.classes c where c.id = class_teachers.class_id and c.school_id = public.app_school_id()))
with check (public.app_role() = 'coordinator' and exists (select 1 from public.classes c where c.id = class_teachers.class_id and c.school_id = public.app_school_id()));

-- Frequência: coordenação lê; professor da turma lê e grava; aluno/responsável leem a própria.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
using (school_id = public.app_school_id() and (
  public.app_role() = 'coordinator' or public.teaches_class(class_id) or student_id = public.current_student_id()));
drop policy if exists attendance_teacher_write on public.attendance;
create policy attendance_teacher_write on public.attendance for all to authenticated
using (public.app_role() = 'teacher' and public.teaches_class(class_id))
with check (public.app_role() = 'teacher' and public.teaches_class(class_id) and school_id = public.app_school_id());

-- Atestados: aluno/responsável enviam e leem os seus; coordenação analisa.
drop policy if exists certificates_select on public.medical_certificates;
create policy certificates_select on public.medical_certificates for select to authenticated
using (school_id = public.app_school_id() and (
  public.app_role() = 'coordinator' or student_id = public.current_student_id()
  or exists (select 1 from public.students s where s.id = student_id and public.teaches_class(s.class_id))));
drop policy if exists certificates_insert on public.medical_certificates;
create policy certificates_insert on public.medical_certificates for insert to authenticated
with check (school_id = public.app_school_id() and status = 'pending' and submitted_by = auth.uid()
  and (student_id = public.current_student_id() or public.app_role() = 'coordinator'));
drop policy if exists certificates_coord_update on public.medical_certificates;
create policy certificates_coord_update on public.medical_certificates for update to authenticated
using (public.app_role() = 'coordinator' and school_id = public.app_school_id())
with check (public.app_role() = 'coordinator' and school_id = public.app_school_id());

-- Aprovar atestado: faltas F do período viram FJ.
create or replace function public.apply_certificate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.attendance set status = 'FJ', certificate_id = new.id
    where student_id = new.student_id and status = 'F' and lesson_date between new.start_date and new.end_date;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_apply_certificate on public.medical_certificates;
create trigger trg_apply_certificate after update on public.medical_certificates
for each row execute function public.apply_certificate();

-- Ocorrências: coordenação grava; professor da turma, aluno e responsável leem.
drop policy if exists disciplinary_select on public.disciplinary_records;
create policy disciplinary_select on public.disciplinary_records for select to authenticated
using (school_id = public.app_school_id() and (
  public.app_role() = 'coordinator' or student_id = public.current_student_id()
  or exists (select 1 from public.students s where s.id = student_id and public.teaches_class(s.class_id))));
drop policy if exists disciplinary_coord_write on public.disciplinary_records;
create policy disciplinary_coord_write on public.disciplinary_records for all to authenticated
using (public.app_role() = 'coordinator' and school_id = public.app_school_id())
with check (public.app_role() = 'coordinator' and school_id = public.app_school_id());

-- Entregas: aluno grava a sua até enviar; professor da turma corrige; responsável e coordenação leem.
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated
using (student_id = public.current_student_id()
  or exists (select 1 from public.activities a join public.classes c on c.id = a.class_id
             where a.id = activity_id and (public.teaches_class(a.class_id)
               or (public.app_role() = 'coordinator' and c.school_id = public.app_school_id()))));
drop policy if exists submissions_student_write on public.submissions;
create policy submissions_student_write on public.submissions for all to authenticated
using (public.app_role() = 'student' and student_id = public.current_student_id() and status = 'draft')
with check (public.app_role() = 'student' and student_id = public.current_student_id() and status in ('draft', 'submitted') and score is null);
drop policy if exists submissions_teacher_update on public.submissions;
create policy submissions_teacher_update on public.submissions for update to authenticated
using (exists (select 1 from public.activities a where a.id = activity_id and public.teaches_class(a.class_id)))
with check (exists (select 1 from public.activities a where a.id = activity_id and public.teaches_class(a.class_id)));

drop policy if exists answers_select on public.submission_answers;
create policy answers_select on public.submission_answers for select to authenticated
using (exists (select 1 from public.submissions s where s.id = submission_id));
drop policy if exists answers_student_write on public.submission_answers;
create policy answers_student_write on public.submission_answers for all to authenticated
using (exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = public.current_student_id() and s.status = 'draft' and public.app_role() = 'student'))
with check (exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = public.current_student_id() and s.status = 'draft' and public.app_role() = 'student')
  and is_correct is null and score is null and ai_comment is null and error_tags = '{}');
drop policy if exists answers_teacher_write on public.submission_answers;
create policy answers_teacher_write on public.submission_answers for update to authenticated
using (exists (select 1 from public.submissions s join public.activities a on a.id = s.activity_id where s.id = submission_id and public.teaches_class(a.class_id)))
with check (exists (select 1 from public.submissions s join public.activities a on a.id = s.activity_id where s.id = submission_id and public.teaches_class(a.class_id)));

drop policy if exists reports_staff on public.activity_reports;
create policy reports_staff on public.activity_reports for all to authenticated
using (exists (select 1 from public.activities a join public.classes c on c.id = a.class_id where a.id = activity_id
  and (public.teaches_class(a.class_id) or (public.app_role() = 'coordinator' and c.school_id = public.app_school_id()))))
with check (exists (select 1 from public.activities a where a.id = activity_id and public.teaches_class(a.class_id)));

-- Aluno e responsável: leem a própria ficha, a turma, as atividades publicadas
-- (pela view, sem gabarito), os planos publicados e as próprias notas.
drop policy if exists students_self_select on public.students;
create policy students_self_select on public.students for select to authenticated using (id = public.current_student_id());
drop policy if exists classes_student_select on public.classes;
create policy classes_student_select on public.classes for select to authenticated
using (exists (select 1 from public.students s where s.id = public.current_student_id() and s.class_id = classes.id));
drop policy if exists lesson_plans_student_select on public.lesson_plans;
create policy lesson_plans_student_select on public.lesson_plans for select to authenticated
using (published and exists (select 1 from public.students s where s.id = public.current_student_id() and s.class_id = lesson_plans.class_id));
drop policy if exists results_student_select on public.assessment_results;
create policy results_student_select on public.assessment_results for select to authenticated using (student_id = public.current_student_id());
drop policy if exists assessments_student_select on public.assessments;
create policy assessments_student_select on public.assessments for select to authenticated
using (exists (select 1 from public.students s where s.id = public.current_student_id() and s.class_id = assessments.class_id));

-- Atividades publicadas para o aluno, sem o gabarito (answer_key fica só na tabela).
create or replace view public.student_activities as
  select a.id, a.class_id, a.subject_id, a.title, a.instructions, a.questions, a.due_at, a.max_points, a.published_at
  from public.activities a
  where a.published_at is not null
    and exists (select 1 from public.students s where s.id = public.current_student_id() and s.class_id = a.class_id);
grant select on public.student_activities to authenticated;
