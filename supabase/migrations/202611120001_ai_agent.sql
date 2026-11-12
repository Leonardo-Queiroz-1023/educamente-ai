-- EducaMente AI — colunas usadas pelo agente de IA.
-- Só adiciona colunas e índices; nenhum dado existente é alterado.

-- Atividades geradas com IA: rascunho ("draft") até o professor aprovar.
alter table public.activities
  add column if not exists teacher_guidance text,
  add column if not exists justification text,
  add column if not exists complexity text,
  add column if not exists target_group text,
  add column if not exists worked_examples jsonb not null default '[]'::jsonb,
  add column if not exists analysis_id uuid references public.pedagogical_analyses(id) on delete set null,
  add column if not exists generation_metadata jsonb not null default '{}'::jsonb,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.teachers(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_complexity_valid') then
    alter table public.activities add constraint activities_complexity_valid
      check (complexity is null or complexity in ('reforco', 'consolidacao', 'aprofundamento'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activities_ai_approval_consistent') then
    -- Uma atividade só tem data de aprovação se não for mais rascunho.
    alter table public.activities add constraint activities_ai_approval_consistent
      check (approved_at is null or status <> 'draft');
  end if;
end $$;

create index if not exists idx_activities_class_origin on public.activities(class_id, origin, created_at desc);

-- Análises: guarda também o recorte analisado.
alter table public.pedagogical_analyses
  add column if not exists subject text,
  add column if not exists content text;
