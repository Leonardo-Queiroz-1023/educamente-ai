/**
 * Proteções determinísticas aplicadas a todo texto produzido pela IA.
 * Complementam as instruções do prompt: se o modelo escorregar, o código recusa.
 */

/** Termos de diagnóstico, rótulo permanente ou decisão definitiva que a IA não pode usar. */
const FORBIDDEN: { re: RegExp; reason: string }[] = [
  { re: /\bdiagn[oó]stic/i, reason: "diagnóstico" },
  { re: /\btranstorno/i, reason: "transtorno" },
  { re: /\bTDA-?H\b|d[eé]ficit de aten[cç][aã]o/i, reason: "transtorno de atenção" },
  { re: /\bdisl[eé]xi|\bdiscalcul|\bdisgraf/i, reason: "transtorno de aprendizagem" },
  { re: /\bautis|\bTEA\b|espectro autista/i, reason: "autismo" },
  { re: /neurodiverg|neuroat[ií]pic/i, reason: "neurodivergência" },
  { re: /\bdefici[eê]ncia/i, reason: "deficiência" },
  { re: /\bincapa(z|cidade)/i, reason: "incapacidade" },
  { re: /\blaudo/i, reason: "laudo" },
  { re: /\breprova(r|[cç][aã]o|do|da)\b/i, reason: "reprovação" },
  { re: /\bretido\b|\breten[cç][aã]o escolar/i, reason: "retenção" },
  { re: /\b(aluno|estudante)s? (fraco|burro|lento|atrasado)s?\b/i, reason: "rótulo depreciativo" },
];

export function findForbiddenTerms(text: string): string[] {
  return [...new Set(FORBIDDEN.filter((f) => f.re.test(text)).map((f) => f.reason))];
}

/** Códigos de estudante (E3) ou "Estudante 3" — não podem aparecer no material entregue aos alunos. */
export function mentionsStudentCode(text: string): boolean {
  return /\bE\d{1,3}\b|\bestudante\s+\d{1,3}\b/i.test(text);
}

/**
 * Percentuais citados no texto que não correspondem a nenhum valor calculado
 * Tolerância de 0,5 ponto: cobre arredondamento (57,6% -> 58%) sem aceitar
 * um número inventado só por estar perto de outro indicador (66,7% vs. 66%).
 */
export function unsupportedPercentages(text: string, citable: number[], tolerance = 0.5): string[] {
  const found = [...text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => m[1]);
  return found.filter((raw) => {
    const n = Number(raw.replace(",", "."));
    return !citable.some((c) => Math.abs(c - n) <= tolerance);
  });
}
