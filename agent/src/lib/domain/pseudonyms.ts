/**
 * Pseudônimos de estudantes (E1, E2, ...). O modelo de IA só vê esses códigos:
 * nenhum nome ou UUID de estudante é enviado ao provedor. O front-end traduz
 * os códigos para os nomes, localmente, usando a legenda (código -> student_id).
 */
export class Pseudonymizer {
  private readonly toCode = new Map<string, string>();
  private readonly toId = new Map<string, string>();

  constructor(studentIdsInOrder: string[]) {
    studentIdsInOrder.forEach((id, i) => {
      const code = `E${i + 1}`;
      this.toCode.set(id, code);
      this.toId.set(code, id);
    });
  }

  code(studentId: string): string {
    const code = this.toCode.get(studentId);
    if (code) return code;
    // Resultado de um estudante que não está mais na turma: recebe um código novo.
    const next = `E${this.toCode.size + 1}`;
    this.toCode.set(studentId, next);
    this.toId.set(next, studentId);
    return next;
  }

  studentId(code: string): string | undefined {
    return this.toId.get(code.trim().toUpperCase());
  }

  legend(): { code: string; student_id: string }[] {
    return [...this.toCode.entries()].map(([student_id, code]) => ({ code, student_id }));
  }
}
