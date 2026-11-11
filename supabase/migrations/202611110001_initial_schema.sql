-- EducaMente AI — esquema inicial PostgreSQL/Supabase
-- Execute pelo Supabase CLI ou SQL Editor. Revise as políticas antes de produção.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  municipality text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  school_id uuid not null references public.schools(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text,
  shift text,
  school_id uuid not null references public.schools(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  school_year integer not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  content text not null,
  assessment_date date not null,
  total_points numeric(10,2) not null check (total_points > 0),
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  score numeric(10,2) not null check (score >= 0),
  percentage numeric(5,2) not null check (percentage between 0 and 100),
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_results_one_per_student unique (assessment_id, student_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  class_id uuid not null references public.classes(id) on delete restrict,
  subject text,
  content text,
  objective text,
  skill text,
  activity_type text,
  application_date date,
  deadline date,
  instructions text,
  questions jsonb not null default '[]'::jsonb,
  answer_key jsonb not null default '[]'::jsonb,
  status text not null default 'Rascunho',
  origin text not null default 'teacher' check (origin in ('teacher', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_deadline_after_application
    check (application_date is null or deadline is null or deadline >= application_date)
);

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  subject text,
  content text,
  skill text,
  objective text,
  start_date date,
  end_date date,
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_plan_dates check (start_date is null or end_date is null or end_date >= start_date)
);

create table if not exists public.pedagogical_records (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  student_id uuid references public.students(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  record_type text not null,
  description text not null,
  record_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.pedagogical_analyses (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  assessment_id uuid references public.assessments(id) on delete restrict,
  summary text not null,
  analysis_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_teachers_school on public.teachers(school_id);
create index if not exists idx_classes_teacher on public.classes(teacher_id);
create index if not exists idx_classes_school on public.classes(school_id);
create index if not exists idx_students_class on public.students(class_id);
create index if not exists idx_assessments_class_date on public.assessments(class_id, assessment_date desc);
create index if not exists idx_results_student on public.assessment_results(student_id);
create index if not exists idx_activities_class on public.activities(class_id);
create index if not exists idx_lesson_plans_class on public.lesson_plans(class_id);
create index if not exists idx_ped_records_class_date on public.pedagogical_records(class_id, record_date desc);
create index if not exists idx_ped_analyses_class_date on public.pedagogical_analyses(class_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['schools','teachers','classes','students','assessments','assessment_results','activities','lesson_plans'] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Retorna o perfil do professor vinculado à sessão autenticada.
create or replace function public.current_teacher_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.teachers where auth_user_id = auth.uid() limit 1;
$$;

alter table public.schools enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;
alter table public.activities enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.pedagogical_records enable row level security;
alter table public.pedagogical_analyses enable row level security;

-- Escolas: um usuário autenticado pode criar uma escola; leitura/edição somente
-- para professores vinculados à escola.
drop policy if exists schools_select_member on public.schools;
create policy schools_select_member on public.schools for select to authenticated
using (created_by = auth.uid()
  or exists (select 1 from public.teachers t where t.school_id = schools.id and t.auth_user_id = auth.uid()));
drop policy if exists schools_insert_authenticated on public.schools;
create policy schools_insert_authenticated on public.schools for insert to authenticated
with check (created_by = auth.uid());
drop policy if exists schools_update_member on public.schools;
create policy schools_update_member on public.schools for update to authenticated
using (created_by = auth.uid()
  or exists (select 1 from public.teachers t where t.school_id = schools.id and t.auth_user_id = auth.uid()))
with check (created_by = auth.uid()
  or exists (select 1 from public.teachers t where t.school_id = schools.id and t.auth_user_id = auth.uid()));

-- Perfil do professor: usuário só enxerga e altera o próprio perfil.
drop policy if exists teachers_select_self on public.teachers;
create policy teachers_select_self on public.teachers for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists teachers_insert_self on public.teachers;
create policy teachers_insert_self on public.teachers for insert to authenticated
with check (auth_user_id = auth.uid()
  and exists (select 1 from public.schools s where s.id = school_id and s.created_by = auth.uid()));
drop policy if exists teachers_update_self on public.teachers;
create policy teachers_update_self on public.teachers for update to authenticated
using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- Turmas e entidades relacionadas: isolamento por professor autenticado.
drop policy if exists classes_teacher_all on public.classes;
create policy classes_teacher_all on public.classes for all to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id()
  and exists (select 1 from public.teachers t where t.id = teacher_id and t.school_id = school_id));

drop policy if exists students_teacher_all on public.students;
create policy students_teacher_all on public.students for all to authenticated
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = public.current_teacher_id()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = public.current_teacher_id()));

drop policy if exists assessments_teacher_all on public.assessments;
create policy assessments_teacher_all on public.assessments for all to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id()
  and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = teacher_id));

drop policy if exists results_teacher_all on public.assessment_results;
create policy results_teacher_all on public.assessment_results for all to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and a.teacher_id = public.current_teacher_id()))
with check (
  exists (select 1 from public.assessments a where a.id = assessment_id and a.teacher_id = public.current_teacher_id())
  and exists (select 1 from public.students s join public.assessments a on a.class_id = s.class_id
              where s.id = student_id and a.id = assessment_id)
);

drop policy if exists activities_teacher_all on public.activities;
create policy activities_teacher_all on public.activities for all to authenticated
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = public.current_teacher_id()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = public.current_teacher_id()));

drop policy if exists lesson_plans_teacher_all on public.lesson_plans;
create policy lesson_plans_teacher_all on public.lesson_plans for all to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id()
  and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = teacher_id));

drop policy if exists records_teacher_all on public.pedagogical_records;
create policy records_teacher_all on public.pedagogical_records for all to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id()
  and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = teacher_id)
  and (student_id is null or exists (select 1 from public.students s where s.id = student_id and s.class_id = class_id)));

drop policy if exists analyses_teacher_all on public.pedagogical_analyses;
create policy analyses_teacher_all on public.pedagogical_analyses for all to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id()
  and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = teacher_id)
  and (assessment_id is null or exists (select 1 from public.assessments a where a.id = assessment_id and a.class_id = class_id and a.teacher_id = teacher_id)));
