-- Compatibilidade com o campo local alunos.obs.
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS observation text;
