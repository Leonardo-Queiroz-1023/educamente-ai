/*
 * EducaMente AI — impressão e download de documentos (atividades e relatórios).
 * Monta um documento A4 limpo, sem o visual do app.
 * - imprimir: abre a janela de impressão do navegador (que também permite "Salvar como PDF");
 * - baixar: gera um arquivo .doc que abre e pode ser editado no Word, no LibreOffice e no Google Docs.
 * Quem chama monta o conteúdo em HTML, sempre com os textos já escapados (EducaPrint.esc).
 */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toLocaleDateString('pt-BR');

  const CSS = `
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font: 11.5pt/1.5 "Segoe UI", Arial, sans-serif; }
    .doc { max-width: 178mm; margin: 0 auto; }
    .doc-head { border-bottom: 1.5pt solid #111; padding-bottom: 8pt; margin-bottom: 12pt; }
    .doc-escola { font-size: 9.5pt; color: #444; margin: 0 0 2pt; }
    h1 { font-size: 17pt; line-height: 1.2; margin: 0 0 4pt; }
    .doc-meta { font-size: 10pt; color: #333; margin: 0; }
    h2 { font-size: 12.5pt; margin: 16pt 0 6pt; page-break-after: avoid; }
    p { margin: 0 0 6pt; }
    ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
    li { margin: 2pt 0; }
    .ident { display: flex; gap: 12pt; width: 100%; margin: 0 0 12pt; font-size: 10.5pt; }
    .ident span { display: flex; align-items: flex-end; gap: 4pt; flex: 1; white-space: nowrap; }
    .ident span:first-child { flex: 3; }
    .ident i { display: inline-block; flex: 1; min-width: 18mm; height: 12pt; border-bottom: 0.75pt solid #111; }
    .box { border: 0.75pt solid #999; padding: 8pt 10pt; margin: 0 0 10pt; }
    .q { margin: 0 0 12pt; page-break-inside: avoid; }
    .q-n { font-weight: 700; }
    .q ol { list-style: upper-alpha; }
    .lines { margin-top: 6pt; }
    .lines div { border-bottom: 0.75pt solid #aaa; height: 20pt; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; font-size: 10pt; }
    th, td { border: 0.75pt solid #999; padding: 4pt 6pt; text-align: left; vertical-align: top; }
    th { background: #eee; }
    td.n, th.n { text-align: center; }
    .stats td { text-align: center; font-size: 10pt; }
    .stats b { display: block; font-size: 14pt; }
    .muted { color: #555; font-size: 9.5pt; }
    .page-break { page-break-before: always; }
    .doc-foot { margin-top: 18pt; padding-top: 6pt; border-top: 0.75pt solid #999; font-size: 8.5pt; color: #555; }
    @media screen { body { padding: 24px; background: #f2f2f2; } .doc { background: #fff; padding: 18mm 16mm; } }
  `;

  /** Documento completo. `body` é HTML confiável (já escapado por quem chama). */
  function build({ title, escola, meta = [], body, rodape }) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="doc">
      <header class="doc-head">${escola ? `<p class="doc-escola">${esc(escola)}</p>` : ''}<h1>${esc(title)}</h1>
      ${meta.length ? `<p class="doc-meta">${meta.filter(([, v]) => v).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' &nbsp;·&nbsp; ')}</p>` : ''}</header>
      ${body}
      <p class="doc-foot">${esc(rodape || `Gerado pelo EducaMente AI em ${today()}.`)}</p></div></body></html>`;
  }

  /** Cabeçalho para o aluno preencher. */
  const identificacao = () => '<div class="ident"><span>Nome: <i></i></span><span>Turma: <i></i></span><span>Data: <i></i></span></div>';
  const linhas = (n = 5) => `<div class="lines">${'<div></div>'.repeat(n)}</div>`;

  function print(doc) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const w = frame.contentWindow;
    w.document.open();
    w.document.write(build(doc));
    w.document.close();
    const go = () => {
      w.focus();
      w.print();
      setTimeout(() => frame.remove(), 1500);
    };
    if (w.document.readyState === 'complete') setTimeout(go, 50); else frame.onload = go;
  }

  const slug = (s) => String(s || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'documento';

  /** Baixa como .doc (HTML que o Word abre e edita). */
  function download(doc, nome) {
    const html = build(doc).replace('<html lang="pt-BR">', '<html lang="pt-BR" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">');
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(nome || doc.title)}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.EducaPrint = { esc, build, print, download, identificacao, linhas, slug };
})();
