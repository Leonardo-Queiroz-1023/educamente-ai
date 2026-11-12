import { createClient } from "@supabase/supabase-js";
import { getConfig, requireSupabase } from "./config";
import { SupabaseRepository } from "./data/supabase-repository";
import type { ClassInfo, DataRepository } from "./data/repository";
import { AppError } from "./errors";

export interface AuthContext {
  userId: string;
  teacherId: string;
  repo: DataRepository;
}

/**
 * Valida o token de sessão do Supabase enviado pelo front-end (Authorization: Bearer)
 * e cria um cliente que consulta o banco COMO o professor: o RLS continua valendo.
 */
export async function authenticate(req: Request): Promise<AuthContext> {
  const { url, anonKey } = requireSupabase(getConfig());
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AppError("UNAUTHENTICATED", "Entre com sua conta para usar a IA.");

  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Saia e entre novamente.");
  }

  const { data: teacher, error: teacherError } = await db
    .from("teachers")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (teacherError) throw new AppError("DATA_ERROR", "Não foi possível consultar seu perfil de professor.");
  if (!teacher) throw new AppError("FORBIDDEN", "Sua conta ainda não tem perfil de professor. Conclua o cadastro.");

  return { userId: data.user.id, teacherId: teacher.id, repo: new SupabaseRepository(db) };
}

/** Garante que a turma pertence ao professor antes de qualquer consulta ou gravação. */
export async function requireOwnedClass(auth: AuthContext, classId: string): Promise<ClassInfo> {
  const cls = await auth.repo.getOwnedClass(classId, auth.teacherId);
  if (!cls) throw new AppError("FORBIDDEN", "Turma não encontrada entre as suas turmas.");
  return cls;
}
