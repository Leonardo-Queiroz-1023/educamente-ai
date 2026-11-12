import { z } from "zod";
import { authenticate, requireOwnedClass } from "../../../../src/lib/auth";
import { AppError } from "../../../../src/lib/errors";
import { json, preflight, route } from "../../../../src/lib/http";

export const dynamic = "force-dynamic";

type AnalysisData = { attention_points?: unknown; recommendations?: unknown; suggested_complexity?: unknown; students_legend?: unknown };

/** Histórico de análises e atividades geradas com IA de uma turma. */
export const GET = route(async (req: Request) => {
  const classId = new URL(req.url).searchParams.get("class_id") ?? "";
  if (!z.string().uuid().safeParse(classId).success) throw new AppError("BAD_REQUEST", "Informe class_id.");
  const auth = await authenticate(req);
  await requireOwnedClass(auth, classId);
  const [analyses, activities] = await Promise.all([
    auth.repo.listAnalyses(classId, 20),
    auth.repo.listActivities(classId, { origin: "ai", limit: 30 }),
  ]);
  return json(req, {
    analyses: analyses.map((a) => {
      const d = a.analysis_data as AnalysisData;
      return {
        id: a.id,
        created_at: a.created_at,
        assessment_id: a.assessment_id,
        subject: a.subject,
        content: a.content,
        summary: a.summary,
        attention_points: d.attention_points ?? [],
        recommendations: d.recommendations ?? [],
        suggested_complexity: d.suggested_complexity ?? null,
        // Código -> student_id; o navegador traduz para nomes localmente.
        students: d.students_legend ?? [],
      };
    }),
    activities,
  });
});

export const OPTIONS = (req: Request) => preflight(req);
