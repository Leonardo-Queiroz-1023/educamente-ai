(async function () {
  // Aguarda o carregamento inicial dos dados remotos antes de montar a interface.
  try { await window.educamenteSync?.ready; } catch (error) { console.warn(error); }

/* ===== acesso: conta Supabase ou modo sem conta escolhido no login ===== */
const LOCAL_FLAG="educamente.localMode";
const localMode=(()=>{try{return localStorage.getItem(LOCAL_FLAG)==="1"}catch(e){return false}})();
// Sem sessão (ou sem perfil de professor) e sem ter escolhido o modo sem conta: volta para o login.
if(!localMode&&["no-session","no-profile"].includes(window.educamenteSync?.state?.reason)){location.replace("index.html");return}

/* ===== repositório local (trocável por Supabase) ===== */
const Repo={key:"educamente.v2",read(){try{return JSON.parse(localStorage.getItem(this.key))||{}}catch(e){return{}}},write(d){try{localStorage.setItem(this.key,JSON.stringify(d))}catch(e){}}};
const DB=Object.assign({turmas:[],alunos:[],avaliacoes:[],resultados:[],atividades:[],planejamentos:[],settings:{}},Repo.read());
const persist=()=>{Repo.write(DB);window.educamenteSync?.scheduleSync(DB)},uid=()=>crypto.randomUUID();
/* ===== serviços (classes, students, assessments, activities, planning) ===== */
const Svc={
 get:(n,id)=>DB[n].find(x=>x.id===id),
 save(n,o){if(o.id){const i=DB[n].findIndex(x=>x.id===o.id);DB[n][i]={...DB[n][i],...o}}else{o={...o,id:uid(),criadoEm:new Date().toISOString()};DB[n].push(o)}persist();return o},
 remove(n,id){
  const snapshot=JSON.parse(JSON.stringify(DB));
  if(n==="turmas"){
   const studentIds=DB.alunos.filter(a=>a.turmaId===id).map(a=>a.id);
   const assessmentIds=DB.avaliacoes.filter(a=>a.turmaId===id).map(a=>a.id);
   DB.resultados=DB.resultados.filter(r=>!assessmentIds.includes(r.avaliacaoId)&&!studentIds.includes(r.alunoId));
   DB.alunos=DB.alunos.filter(a=>a.turmaId!==id);
   DB.avaliacoes=DB.avaliacoes.filter(a=>a.turmaId!==id);
   DB.atividades=DB.atividades.filter(x=>x.turmaId!==id);
   DB.planejamentos=DB.planejamentos.filter(x=>x.turmaId!==id);
  }
  if(n==="alunos")DB.resultados=DB.resultados.filter(r=>r.alunoId!==id);
  if(n==="avaliacoes")DB.resultados=DB.resultados.filter(r=>r.avaliacaoId!==id);
  DB[n]=DB[n].filter(x=>x.id!==id);
  window.educamenteSync?.scheduleDelete(n,id,snapshot);
  persist()}};
/* ===== análises de desempenho (base para a futura IA) ===== */
const pct=r=>{const a=Svc.get("avaliacoes",r.avaliacaoId);return a&&a.total?r.pontos/a.total*100:null};
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const res=f=>DB.resultados.filter(f).map(pct).filter(p=>p!=null);
const turmaAvg=id=>avg(res(r=>Svc.get("avaliacoes",r.avaliacaoId)?.turmaId===id)),alunoAvg=id=>avg(res(r=>r.alunoId===id)),avAvg=id=>avg(res(r=>r.avaliacaoId===id));
const groupAvg=(avs,key)=>{const g={};avs.forEach(a=>(g[a[key]]??=[]).push(a.id));return Object.entries(g).map(([l,ids])=>({l,v:avg(res(r=>ids.includes(r.avaliacaoId)))}))};
/* ===== analysesService: pontos de acesso para a futura IA (sem IA nesta versão) ===== */
const AnalysesService={listAssessments:()=>DB.avaliacoes.slice(),
 studentResults:id=>DB.resultados.filter(r=>r.alunoId===id).map(r=>({...r,percentual:pct(r),avaliacao:Svc.get("avaliacoes",r.avaliacaoId)})),
 performanceHistory:id=>AnalysesService.studentResults(id).filter(x=>x.avaliacao).sort((a,b)=>a.avaliacao.data<b.avaliacao.data?-1:1),
 weakestContents:(turmaId,n=3)=>groupAvg(DB.avaliacoes.filter(a=>!turmaId||a.turmaId===turmaId),"conteudo").filter(c=>c.v!=null).sort((a,b)=>a.v-b.v).slice(0,n),
 saveActivity:o=>Svc.save("atividades",{status:"Rascunho",...o})};
const notifs=()=>{const h=new Date().toISOString().slice(0,10),n=[];
 DB.atividades.filter(a=>a.status!=="Concluída"&&a.prazo&&a.prazo<h).forEach(a=>n.push("Atividade com prazo vencido: "+a.titulo));
 DB.atividades.filter(a=>a.status==="draft").forEach(a=>n.push("Atividade gerada com IA aguardando sua aprovação: "+a.titulo));
 DB.avaliacoes.forEach(a=>{const t=DB.alunos.filter(x=>x.turmaId===a.turmaId).length,r=DB.resultados.filter(x=>x.avaliacaoId===a.id).length;if(t&&r<t)n.push(`Resultados pendentes em "${a.nome}" (${r}/${t})`)});return n};
/* ===== utilidades ===== */
const $=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>n==null?"—":(Math.round(n*10)/10).toString().replace(".",",")+"%",dt=d=>d?d.split("-").reverse().join("/"):"—";
const bc=p=>p==null?"pr":p>=70?"":p>=50?"wn":"bad",chipP=p=>`<span class="chip ${p==null?"":p>=70?"ok":p>=50?"wn":"bad"}">${fmt(p)}</span>`;
const nm=(c,id,k="nome")=>Svc.get(c,id)?.[k]??"—";
const bars=it=>it.length?it.map(i=>`<div class="ln"><span>${esc(i.l)}</span><div class="bar ${bc(i.v)}"><i style="width:${i.v||0}%"></i></div><b>${fmt(i.v)}</b></div>`).join(""):'<div class="empty">Sem dados.</div>';
const toast=m=>{$("toast").innerHTML=`<div class="toast">${esc(m)}</div>`;setTimeout(()=>$("toast").innerHTML="",2600)};
/* Público: ensino fundamental II (6º ao 9º ano) e ensino médio (1ª a 3ª série). */
const ANOS=["6º ano","7º ano","8º ano","9º ano","1ª série (ensino médio)","2ª série (ensino médio)","3ª série (ensino médio)"],COMPS=["Matemática","Língua Portuguesa","Ciências","Física","Química","Biologia","História","Geografia","Filosofia","Sociologia","Arte","Educação Física","Inglês"];
const O=a=>()=>a.map(x=>[x,x]),turmaO=()=>DB.turmas.map(t=>[t.id,t.nome]);
/* ===== módulos (esquemas de formulário, colunas e filtros) ===== */
const ST=["Rascunho","Planejada","Em andamento","Concluída"];
const MOD={
turmas:{t:"Turmas",s:"turma",fields:[{k:"nome",l:"Nome",r:1},{k:"ano",l:"Ano escolar",t:"select",o:O(ANOS),r:1},{k:"turno",l:"Turno",t:"select",o:O(["Manhã","Tarde","Integral"]),r:1},{k:"escola",l:"Escola",r:1},{k:"anoLetivo",l:"Ano letivo",t:"number",min:2000,max:2100,r:1},{k:"descricao",l:"Descrição (opcional)",t:"textarea",w:1}],
 search:["nome","escola"],flt:[["ano","Ano escolar",O(ANOS)]],
 cols:[["Turma",t=>`<b>${esc(t.nome)}</b><br><span class="muted">${esc(t.escola)}</span>`],["Ano",t=>esc(t.ano)],["Turno",t=>esc(t.turno)],["Alunos",t=>DB.alunos.filter(a=>a.turmaId===t.id).length],["Aproveitamento",t=>chipP(turmaAvg(t.id))],["Avaliações",t=>DB.avaliacoes.filter(a=>a.turmaId===t.id).length]]},
alunos:{t:"Alunos",s:"aluno",fields:[{k:"nome",l:"Nome (fictício)",r:1},{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"obs",l:"Observações pedagógicas (opcional)",t:"textarea",w:1}],
 search:["nome"],flt:[["turmaId","Turma",turmaO]],
 cols:[["Aluno",a=>`<b>${esc(a.nome)}</b>`],["Turma",a=>esc(nm("turmas",a.turmaId))],["Ano",a=>esc(nm("turmas",a.turmaId,"ano"))],["Avaliações",a=>DB.resultados.filter(r=>r.alunoId===a.id).length],["Aproveitamento",a=>chipP(alunoAvg(a.id))]]},
avaliacoes:{t:"Avaliações",s:"avaliação",fields:[{k:"nome",l:"Nome da avaliação",r:1},{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"componente",l:"Componente curricular",t:"select",o:O(COMPS),r:1},{k:"conteudo",l:"Conteúdo ou habilidade",r:1},{k:"data",l:"Data",t:"date",r:1},{k:"total",l:"Total de questões ou pontos",t:"number",min:1,r:1},{k:"descricao",l:"Descrição (opcional)",t:"textarea",w:1}],
 search:["nome","conteudo"],flt:[["turmaId","Turma",turmaO],["componente","Componente",O(COMPS)]],
 chk:(o,id)=>id&&DB.resultados.some(r=>r.avaliacaoId===id&&r.pontos>o.total)?{total:"Há resultados acima deste total. Ajuste-os antes."}:{},
 extra:a=>`<button class="ib" data-act="res:${a.id}">Resultados</button>`,
 cols:[["Avaliação",a=>`<b>${esc(a.nome)}</b><br><span class="muted">${esc(a.conteudo)}</span>`],["Turma",a=>esc(nm("turmas",a.turmaId))],["Componente",a=>esc(a.componente)],["Data",a=>dt(a.data)],["Total",a=>a.total],["Registrados",a=>`${DB.resultados.filter(r=>r.avaliacaoId===a.id).length}/${DB.alunos.filter(x=>x.turmaId===a.turmaId).length}`],["Média",a=>chipP(avAvg(a.id))]]},
atividades:{t:"Atividades",s:"atividade",fields:[{k:"titulo",l:"Título",r:1},{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"componente",l:"Componente curricular",t:"select",o:O(COMPS),r:1},{k:"conteudo",l:"Conteúdo",r:1},{k:"tipo",l:"Tipo de atividade",t:"select",o:O(["Exercícios","Questionário","Atividade prática","Revisão","Trabalho","Atividade avaliativa"]),r:1},{k:"status",l:"Status",t:"select",o:O(ST),r:1},{k:"aplicacao",l:"Data de aplicação",t:"date"},{k:"prazo",l:"Prazo",t:"date"},{k:"descricao",l:"Descrição",t:"textarea",w:1},{k:"objetivo",l:"Objetivo pedagógico",t:"textarea",w:1},{k:"habilidade",l:"Habilidade trabalhada",w:1},{k:"instrucoes",l:"Instruções",t:"textarea",w:1},{k:"questoes",l:"Questões ou exercícios",t:"textarea",w:1},{k:"gabarito",l:"Gabarito ou orientação (opcional)",t:"textarea",w:1}],
 search:["titulo","conteudo"],flt:[["turmaId","Turma",turmaO],["componente","Componente",O(COMPS)],["status","Status",O(ST)]],
 chk:o=>o.aplicacao&&o.prazo&&o.prazo<o.aplicacao?{prazo:"O prazo não pode ser anterior à aplicação."}:{},
 cols:[["Atividade",a=>`<b>${esc(a.titulo)}</b>${a.origem==="ai"?' <span class="chip" title="Gerada com auxílio de IA">IA</span>':""}<br><span class="muted">${esc(a.conteudo)}</span>`],["Turma",a=>esc(nm("turmas",a.turmaId))],["Componente",a=>esc(a.componente)],["Tipo",a=>esc(a.tipo)],["Aplicação",a=>dt(a.aplicacao)],["Prazo",a=>dt(a.prazo)],["Status",a=>statusChip(a.status)]]},
planejamentos:{t:"Planejamento pedagógico",s:"planejamento",fields:[{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"componente",l:"Componente curricular",t:"select",o:O(COMPS),r:1},{k:"conteudo",l:"Conteúdo",r:1},{k:"habilidade",l:"Habilidade"},{k:"avaliacaoId",l:"Avaliação relacionada (opcional)",t:"select",o:()=>DB.avaliacoes.map(a=>[a.id,a.nome])},{k:"inicio",l:"Início",t:"date",r:1},{k:"fim",l:"Fim",t:"date"},{k:"objetivo",l:"Objetivo de aprendizagem",t:"textarea",w:1},{k:"obs",l:"Observações",t:"textarea",w:1}],
 search:["conteudo","objetivo"],flt:[["turmaId","Turma",turmaO],["componente","Componente",O(COMPS)]],
 chk:o=>o.inicio&&o.fim&&o.fim<o.inicio?{fim:"O fim não pode ser anterior ao início."}:{},
 cols:[["Conteúdo",p=>`<b>${esc(p.conteudo)}</b><br><span class="muted">${esc(p.habilidade)}</span>`],["Turma",p=>esc(nm("turmas",p.turmaId))],["Componente",p=>esc(p.componente)],["Período",p=>`${dt(p.inicio)} a ${dt(p.fim)}`],["Objetivo",p=>esc(p.objetivo)]]}
};
/* ===== listagens com busca e filtros ===== */
const FL={};
function rowsOf(m){const M=MOD[m],F=FL[m]||{},q=(F.q||"").toLowerCase();
 return DB[m].filter(r=>(!q||M.search.some(k=>String(r[k]||"").toLowerCase().includes(q)))&&M.flt.every(([k])=>!F[k]||r[k]===F[k])).slice().reverse()}
function tableHtml(m){const M=MOD[m],rows=rowsOf(m);
 if(!rows.length)return`<div class="empty">${DB[m].length?"Nenhum registro encontrado com estes filtros.":`Nenhum(a) ${M.s} cadastrado(a) ainda.`}</div>`;
 return`<div class="tw"><table><tr>${M.cols.map(c=>`<th>${c[0]}</th>`).join("")}<th></th></tr>${rows.map(r=>`<tr>${M.cols.map(c=>`<td>${c[1](r)}</td>`).join("")}<td style="white-space:nowrap">${M.extra?M.extra(r):""}<button class="ib" data-act="view:${m}:${r.id}">Ver</button><button class="ib" data-act="edit:${m}:${r.id}">Editar</button><button class="ib d" data-act="del:${m}:${r.id}">Excluir</button></td></tr>`).join("")}</table></div>`}
function listView(m){const M=MOD[m],F=FL[m]||{};
 return`<div class="top"><div><h1>${M.t}</h1><p class="sub" style="margin:2px 0 0">${DB[m].length} registro(s)</p></div><div>${m==="atividades"?'<button class="btn g" data-act="aiGen:">Gerar atividade com IA</button> ':""}<button class="btn" data-act="new:${m}">+ Nova ${M.s}</button></div></div>
 <div class="card"><div class="flt"><input placeholder="Pesquisar…" data-flt="${m}|q" value="${esc(F.q||"")}">${M.flt.map(([k,l,o])=>`<select data-flt="${m}|${k}"><option value="">${l}: todos</option>${o().map(([a,b])=>`<option value="${esc(a)}" ${F[k]===a?"selected":""}>${esc(b)}</option>`).join("")}</select>`).join("")}</div><div id="tbl">${tableHtml(m)}</div></div>`}
/* ===== modal, formulários e validação ===== */
const openM=h=>$("modal").innerHTML=`<div class="ov"><div class="md">${h}</div></div>`,closeM=()=>$("modal").innerHTML="";
function fieldHtml(f,v){const id="f_"+f.k;let c;
 if(f.t==="select")c=`<select id="${id}"><option value="">Selecione…</option>${f.o().map(([a,b])=>`<option value="${esc(a)}" ${a===v?"selected":""}>${esc(b)}</option>`).join("")}</select>`;
 else if(f.t==="textarea")c=`<textarea id="${id}">${esc(v)}</textarea>`;
 else c=`<input id="${id}" type="${f.t||"text"}" ${f.t==="number"?'step="any"':""} value="${esc(v)}">`;
 return`<div class="${f.w?"full":""}"><label for="${id}">${f.l}${f.r?" *":""}</label>${c}<span class="err" id="e_${f.k}"></span></div>`}
function formM(m,id,pre){const M=MOD[m],r=id?Svc.get(m,id):{status:"Rascunho",anoLetivo:2026,...pre};
 if(m!=="turmas"&&!DB.turmas.length)return openM(`<h2>Cadastre uma turma primeiro</h2><p class="muted">Este registro precisa estar vinculado a uma turma.</p><button class="btn" data-act="close">Entendi</button>`);
 openM(`<h2>${id?"Editar":"Nova"} ${M.s}</h2><div class="fg">${M.fields.map(f=>fieldHtml(f,r[f.k])).join("")}</div><p style="text-align:right;margin:16px 0 0"><button class="btn s" data-act="close">Cancelar</button> <button class="btn" data-act="submit:${m}:${id||""}">Salvar</button></p>`)}
function submit(m,id){const M=MOD[m],o={},er={};
 M.fields.forEach(f=>{let v=$("f_"+f.k).value.trim();
  if(f.r&&!v)er[f.k]="Campo obrigatório.";
  else if(f.t==="number"&&v!==""){v=+v;if(isNaN(v)||v<(f.min??0)||(f.max&&v>f.max))er[f.k]="Informe um valor válido."}
  o[f.k]=v});
 if(!Object.keys(er).length&&M.chk)Object.assign(er,M.chk(o,id));
 document.querySelectorAll(".err").forEach(e=>e.textContent="");Object.entries(er).forEach(([k,t])=>$("e_"+k).textContent=t);
 if(Object.keys(er).length)return;
 if(id){o.id=id;if(m==="avaliacoes"&&Svc.get(m,id).turmaId!==o.turmaId)DB.resultados=DB.resultados.filter(r=>r.avaliacaoId!==id)}
 const sv=Svc.save(m,o);closeM();render();toast("Salvo com sucesso.");if(m==="avaliacoes"&&!id)resM(sv.id)}
/* ===== detalhes ===== */
const show=(f,r)=>f.k==="turmaId"?nm("turmas",r.turmaId):f.k==="avaliacaoId"?nm("avaliacoes",r.avaliacaoId):f.t==="date"?dt(r[f.k]):r[f.k]||"—";
const kv=(m,r)=>`<dl class="kv">${MOD[m].fields.map(f=>`<dt>${f.l.replace(" (opcional)","")}</dt><dd>${esc(show(f,r))}</dd>`).join("")}</dl>`;
const sec=(t,h)=>`<h2 style="margin-top:18px">${t}</h2>${h}`;
const mini=(rows,fn)=>rows.length?`<div class="tw"><table>${rows.map(fn).join("")}</table></div>`:'<p class="muted">Nenhum registro.</p>';
const DET={
 turmas:t=>{const av=DB.avaliacoes.filter(a=>a.turmaId===t.id);return kv("turmas",t)+`<p><b>Aproveitamento médio:</b> ${chipP(turmaAvg(t.id))}</p>`+sec("Alunos",mini(DB.alunos.filter(a=>a.turmaId===t.id),a=>`<tr><td>${esc(a.nome)}</td><td>${chipP(alunoAvg(a.id))}</td><td><button class="ib" data-act="view:alunos:${a.id}">Perfil</button></td></tr>`))+sec("Desempenho por disciplina",bars(groupAvg(av,"componente")))+sec("Avaliações",mini(av,a=>`<tr><td>${esc(a.nome)}</td><td>${dt(a.data)}</td><td>${chipP(avAvg(a.id))}</td><td><button class="ib" data-act="res:${a.id}">Resultados</button></td></tr>`))+sec("Atividades",mini(DB.atividades.filter(x=>x.turmaId===t.id),x=>`<tr><td>${esc(x.titulo)}</td><td>${esc(x.status)}</td></tr>`))},
 alunos:a=>{const rs=DB.resultados.filter(r=>r.alunoId===a.id).map(r=>({r,a:Svc.get("avaliacoes",r.avaliacaoId)})).filter(x=>x.a).sort((x,y)=>x.a.data<y.a.data?-1:1);
  const cont=groupAvg(rs.map(x=>x.a),"conteudo").map(g=>({l:g.l,v:avg(rs.filter(x=>x.a.conteudo===g.l).map(x=>pct(x.r)))}));
  return kv("alunos",a)+`<p><b>Ano escolar:</b> ${esc(nm("turmas",a.turmaId,"ano"))}</p><p><b>Média geral:</b> ${chipP(alunoAvg(a.id))}</p>`+sec("Evolução nas avaliações",rs.length?bars(rs.map(x=>({l:x.a.nome,v:pct(x.r)}))):'<p class="muted">Sem resultados.</p>')+sec("Desempenho por conteúdo",bars(cont))+sec("Histórico",mini(rs,x=>`<tr><td>${esc(x.a.nome)}</td><td>${dt(x.a.data)}</td><td>${x.r.pontos}/${x.a.total}</td><td>${chipP(pct(x.r))}</td><td>${esc(x.r.obs)}</td></tr>`))+sec("Atividades da turma",mini(DB.atividades.filter(x=>x.turmaId===a.turmaId),x=>`<tr><td>${esc(x.titulo)}</td><td>${esc(x.status)}</td></tr>`))},
 avaliacoes:a=>kv("avaliacoes",a)+`<p><b>Média da turma:</b> ${chipP(avAvg(a.id))}</p>`+sec("Resultados",mini(DB.alunos.filter(x=>x.turmaId===a.turmaId),x=>{const r=DB.resultados.find(y=>y.avaliacaoId===a.id&&y.alunoId===x.id);return`<tr><td>${esc(x.nome)}</td><td>${r?`${r.pontos}/${a.total}`:"—"}</td><td>${r?chipP(pct(r)):"—"}</td><td>${esc(r?.obs)}</td></tr>`})),
 atividades:a=>`<p><label>Alterar status</label><select data-qs="${a.id}" style="max-width:220px">${ST.map(s=>`<option ${s===a.status?"selected":""}>${s}</option>`).join("")}</select></p>`+kv("atividades",a),
 planejamentos:p=>kv("planejamentos",p)};
function viewM(m,id){const r=Svc.get(m,id);if(!r)return;openM(`<h2 style="font-size:18px">${esc(r.nome||r.titulo||r.conteudo)}</h2>${DET[m](r)}<p style="text-align:right;margin:16px 0 0"><button class="btn" data-act="close">Fechar</button></p>`)}
/* ===== registro de resultados ===== */
function resM(id){const a=Svc.get("avaliacoes",id),al=DB.alunos.filter(x=>x.turmaId===a.turmaId);
 if(!al.length)return openM(`<h2>${esc(a.nome)}</h2><p class="muted">A turma ainda não tem alunos. Cadastre alunos antes de registrar resultados.</p><button class="btn" data-act="close">Fechar</button>`);
 openM(`<h2>Resultados: ${esc(a.nome)}</h2><p class="muted">Total possível: ${a.total}. Preencha apenas os alunos que fizeram a avaliação; você pode salvar parcialmente.</p><div class="tw"><table><tr><th>Aluno</th><th>Pontuação</th><th>Total</th><th>%</th><th>Observação</th></tr>${al.map(x=>{const r=DB.resultados.find(y=>y.avaliacaoId===id&&y.alunoId===x.id);return`<tr><td>${esc(x.nome)}</td><td><input type="number" min="0" max="${a.total}" step="any" data-pt="${x.id}" data-tot="${a.total}" id="p_${x.id}" value="${r?r.pontos:""}"></td><td>${a.total}</td><td id="c_${x.id}">${r?fmt(pct(r)):"—"}</td><td><input style="width:100%" id="o_${x.id}" value="${esc(r?.obs)}"></td></tr>`}).join("")}</table></div><p class="err" id="reserr"></p><p style="text-align:right;margin:12px 0 0"><button class="btn s" data-act="close">Cancelar</button> <button class="btn" data-act="saveres:${id}">Salvar resultados</button></p>`)}
function saveRes(id){const a=Svc.get("avaliacoes",id),al=DB.alunos.filter(x=>x.turmaId===a.turmaId),out=[];
 for(const x of al){const v=$("p_"+x.id).value.trim();if(v==="")continue;const n=+v;
  if(isNaN(n)||n<0||n>a.total)return $("reserr").textContent=`Pontuação inválida para ${x.nome}: use um valor de 0 a ${a.total}.`;
  out.push({id:DB.resultados.find(r=>r.avaliacaoId===id&&r.alunoId===x.id)?.id||uid(),avaliacaoId:id,alunoId:x.id,pontos:n,obs:$("o_"+x.id).value.trim()})}
 DB.resultados=DB.resultados.filter(r=>r.avaliacaoId!==id).concat(out);persist();closeM();render();toast("Resultados salvos.")}
/* ===== dashboard ===== */
function dash(){
 const all=DB.resultados.map(pct).filter(p=>p!=null),av=DB.avaliacoes;
 const qa=`<div class="card"><h2>Ações rápidas</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="quick:turmas">Nova turma</button><button class="btn s" data-act="quick:alunos">Novo aluno</button><button class="btn s" data-act="quick:avaliacoes">Registrar avaliação</button><button class="btn s" data-act="quick:atividades">Criar atividade</button><button class="btn s" data-act="go:historico">Consultar histórico</button></div></div>`;
 if(!DB.turmas.length)return`<h1>Dashboard</h1><p class="sub">Visão geral da sua atividade pedagógica.</p><div class="card empty"><h2>Comece por aqui</h2><p>Cadastre sua primeira turma, depois os alunos, e registre avaliações para ver indicadores e gráficos.<br>Prefere explorar antes? Carregue dados fictícios de demonstração.</p><button class="btn g" data-act="demo">Carregar dados de demonstração</button></div>`+qa;
 const ord=av.slice().sort((a,b)=>a.data<b.data?-1:1),pts=ord.map(a=>({l:a.nome,v:avAvg(a.id)})).filter(p=>p.v!=null);
 const W=360,H=150,px=i=>pts.length>1?30+i*(W-50)/(pts.length-1):W/2,py=v=>H-25-v/100*(H-45);
 const line=pts.length?`<svg viewBox="0 0 ${W} ${H}" style="width:100%"><g stroke="var(--bd)">${[0,50,100].map(v=>`<line x1="24" x2="${W}" y1="${py(v)}" y2="${py(v)}"/>`).join("")}</g><polyline fill="none" stroke="var(--pr)" stroke-width="2.5" points="${pts.map((p,i)=>px(i)+","+py(p.v)).join(" ")}"/>${pts.map((p,i)=>`<circle cx="${px(i)}" cy="${py(p.v)}" r="4" fill="var(--pr)"/><text x="${px(i)}" y="${py(p.v)-9}" font-size="10" text-anchor="middle" fill="var(--tx)">${Math.round(p.v)}%</text><text x="${px(i)}" y="${H-6}" font-size="9" text-anchor="middle" fill="var(--mt)">${esc(p.l.slice(0,10))}</text>`).join("")}</svg>`:'<div class="empty">Registre resultados para ver a evolução.</div>';
 const bands=[["Abaixo de 50%",p=>p<50,"bad"],["50% a 69%",p=>p>=50&&p<70,"wn"],["70% a 89%",p=>p>=70&&p<90,""],["90% a 100%",p=>p>=90,""]];
 const dist=bands.map(([l,f])=>({l,n:all.filter(f).length}));const mx=Math.max(1,...dist.map(d=>d.n));
 const cont=groupAvg(av,"conteudo").filter(c=>c.v!=null).sort((a,b)=>a.v-b.v).slice(0,4);
 const pend=DB.atividades.filter(a=>a.status!=="Concluída").sort((a,b)=>(a.prazo||"9")<(b.prazo||"9")?-1:1).slice(0,4);
 return`<h1>Dashboard</h1><p class="sub">Visão geral calculada a partir dos seus registros.</p>
 <div class="kp">${[["Turmas",DB.turmas.length],["Alunos",DB.alunos.length],["Avaliações",av.length],["Aproveitamento médio",fmt(avg(all))],["Atividades",DB.atividades.length]].map(([l,v])=>`<div class="card"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
 <div class="g2" style="margin-bottom:16px"><div class="card"><h2>Desempenho por componente</h2>${bars(groupAvg(av,"componente").filter(c=>c.v!=null))}</div><div class="card"><h2>Evolução do desempenho</h2>${line}</div></div>
 <div class="g2" style="margin-bottom:16px"><div class="card"><h2>Distribuição de aproveitamento</h2>${dist.map((d,i)=>`<div class="ln"><span>${d.l}</span><div class="bar ${bands[i][2]}"><i style="width:${d.n/mx*100}%"></i></div><b>${d.n}</b></div>`).join("")}<p class="muted" style="font-size:12px;margin:8px 0 0">Faixas descritivas dos resultados registrados; não são diagnósticos.</p></div>
 <div class="card"><h2>Atenção pedagógica: menores médias por conteúdo</h2>${bars(cont)}</div></div>
 <div class="g2" style="margin-bottom:16px"><div class="card"><h2>Avaliações recentes</h2>${mini(ord.slice(-4).reverse(),a=>`<tr><td>${esc(a.nome)}</td><td>${dt(a.data)}</td><td>${chipP(avAvg(a.id))}</td></tr>`)}</div>
 <div class="card"><h2>Atividades pendentes</h2>${mini(pend,a=>`<tr><td>${esc(a.titulo)}</td><td>${esc(statusLabel(a.status))}</td><td>${dt(a.prazo)}</td></tr>`)}</div></div>`+qa}
/* ===== histórico ===== */
const H={};
function histRows(){const e=[],t=id=>nm("turmas",id);
 DB.avaliacoes.forEach(a=>{e.push({tipo:"Avaliação",d:a.data,t:a.nome,tu:a.turmaId,c:a.componente,x:`${a.conteudo}, média ${fmt(avAvg(a.id))}`});const n=DB.resultados.filter(r=>r.avaliacaoId===a.id).length;if(n)e.push({tipo:"Resultados",d:a.data,t:"Resultados: "+a.nome,tu:a.turmaId,c:a.componente,x:`${n} aluno(s) com resultado`})});
 DB.atividades.forEach(a=>e.push({tipo:"Atividade",d:a.aplicacao||a.criadoEm?.slice(0,10),t:a.titulo,tu:a.turmaId,c:a.componente,x:`${a.tipo}, ${statusLabel(a.status)}${a.origem==="ai"?", gerada com IA":""}`}));
 DB.planejamentos.forEach(p=>e.push({tipo:"Planejamento",d:p.inicio,t:p.conteudo,tu:p.turmaId,c:p.componente,x:p.objetivo}));
 DB.alunos.filter(a=>a.obs).forEach(a=>e.push({tipo:"Registro pedagógico",d:a.criadoEm?.slice(0,10),t:a.nome,tu:a.turmaId,c:"",x:a.obs}));
 return e.filter(r=>(!H.tu||r.tu===H.tu)&&(!H.c||r.c===H.c)&&(!H.tipo||r.tipo===H.tipo)&&(!H.de||(r.d||"")>=H.de)&&(!H.ate||(r.d||"")<=H.ate)).sort((a,b)=>(b.d||"")<(a.d||"")?-1:1)}
const histTbl=()=>{const r=histRows();return r.length?`<div class="tw"><table><tr><th>Data</th><th>Tipo</th><th>Registro</th><th>Turma</th><th>Componente</th><th>Detalhe</th></tr>${r.map(x=>`<tr><td>${dt(x.d)}</td><td><span class="chip">${x.tipo}</span></td><td>${esc(x.t)}</td><td>${esc(nm("turmas",x.tu))}</td><td>${esc(x.c)}</td><td>${esc(x.x)}</td></tr>`).join("")}</table></div>`:'<div class="empty">Nenhum registro encontrado.</div>'};
const histView=()=>`<h1>Histórico</h1><p class="sub">Todos os registros pedagógicos em um só lugar.</p><div class="card"><div class="flt"><select data-h="tu"><option value="">Turma: todas</option>${turmaO().map(([a,b])=>`<option value="${a}" ${H.tu===a?"selected":""}>${esc(b)}</option>`).join("")}</select><select data-h="c"><option value="">Componente: todos</option>${COMPS.map(c=>`<option ${H.c===c?"selected":""}>${c}</option>`).join("")}</select><select data-h="tipo"><option value="">Tipo: todos</option>${["Avaliação","Resultados","Atividade","Planejamento","Registro pedagógico"].map(c=>`<option ${H.tipo===c?"selected":""}>${c}</option>`).join("")}</select><div><label>De</label><input type="date" data-h="de" value="${H.de||""}"></div><div><label>Até</label><input type="date" data-h="ate" value="${H.ate||""}"></div></div><div id="htbl">${histTbl()}</div></div>`;
/* ===== configurações e dados de demonstração ===== */
function demoData(){const T="demo_t1",ids=n=>"demo_"+n,c="2026-09-01T10:00:00.000Z";
 DB.turmas.push({id:T,nome:"6º Ano A",ano:"6º ano",turno:"Manhã",escola:"Escola Municipal Exemplo",anoLetivo:2026,descricao:"Turma fictícia de demonstração.",criadoEm:c});
 "ABCDE".split("").forEach((l,i)=>DB.alunos.push({id:ids("a"+i),nome:"Aluno "+l,turmaId:T,obs:i===2?"Participa bem de atividades em grupo (dado fictício).":"",criadoEm:c}));
 const av=[["Múltiplos e divisores","2026-09-15",10,[9,4,6,10,3]],["Frações equivalentes","2026-10-06",10,[8,5,7,9,4]],["Números decimais","2026-10-27",20,[16,9,12,18,7]]];
 av.forEach(([n,d,t,s],j)=>{DB.avaliacoes.push({id:ids("v"+j),nome:n,turmaId:T,componente:"Matemática",conteudo:n,data:d,total:t,descricao:"",criadoEm:c});s.forEach((p,i)=>DB.resultados.push({id:ids("r"+j+i),avaliacaoId:ids("v"+j),alunoId:ids("a"+i),pontos:p,obs:""}))});
 [["Lista de exercícios de múltiplos e divisores","Múltiplos e divisores","Exercícios","Concluída","2026-09-18","2026-09-25"],["Questionário de frações equivalentes","Frações equivalentes","Questionário","Em andamento","2026-11-09","2026-11-16"],["Revisão de números decimais","Números decimais","Revisão","Planejada","2026-11-18","2026-11-20"]].forEach(([titulo,conteudo,tipo,status,aplicacao,prazo],i)=>DB.atividades.push({id:ids("x"+i),titulo,turmaId:T,componente:"Matemática",conteudo,tipo,status,aplicacao,prazo,descricao:"",objetivo:"Praticar "+conteudo.toLowerCase()+".",habilidade:"",instrucoes:"Resolver individualmente, com apoio do professor.",questoes:"1) ...\n2) ...",gabarito:"",criadoEm:c}));
 [["Multiplicação","2026-09-01","2026-09-20"],["Frações","2026-10-15","2026-11-20"]].forEach(([conteudo,inicio,fim],i)=>DB.planejamentos.push({id:ids("p"+i),turmaId:T,componente:"Matemática",conteudo,habilidade:"Resolver problemas com "+conteudo.toLowerCase(),inicio,fim,objetivo:"Consolidar "+conteudo.toLowerCase()+" ao longo do período.",obs:"",criadoEm:c}));
 DB.settings.demo=true;persist()}
function clearDemo(){const d=x=>String(x.id||"").startsWith("demo_")||String(x.turmaId||"").startsWith("demo_");["alunos","avaliacoes","resultados","atividades","planejamentos","turmas"].forEach(k=>DB[k]=DB[k].filter(x=>!d(x)&&!String(x.avaliacaoId||"").startsWith("demo_")));DB.analisesIA=(DB.analisesIA||[]).filter(a=>!String(a.turmaId).startsWith("demo_"));DB.settings.demo=false;persist()}
const cfgView=()=>{const cloud=window.educamenteSync?.state;return `<h1>Configurações</h1><p class="sub">Perfil e armazenamento da EducaMente AI.</p>
<div class="card"><h2>Perfil</h2><dl class="kv"><dt>Professor</dt><dd>${esc(cloud?.teacher?.name||"Conta local")}</dd><dt>Escola</dt><dd>${esc(cloud?.schoolName||DB.turmas[0]?.escola||"—")}</dd><dt>Acesso</dt><dd>${cloud?.authenticated?"Conectado ao Supabase":"Modo local (sem sessão autenticada)"}</dd></dl></div>
<div class="card"><h2>Armazenamento</h2><p class="note">${cloud?.authenticated?"As alterações são sincronizadas com o Supabase. O navegador mantém um cache local de apoio.":"O aplicativo está usando o armazenamento local. Para sincronizar com a nuvem, use o botão Entrar no topo da página e acesse sua conta."}</p>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn g" data-act="demo">Carregar dados fictícios</button><button class="btn s" data-act="cdemo">Limpar dados de demonstração</button><button class="btn d" data-act="call">Apagar dados deste navegador</button></div></div>
<div class="card"><h2>Inteligência artificial</h2><p class="muted" style="margin:0 0 12px">A análise pedagógica e a geração de atividades usam o serviço de IA em <b>${esc(AGENT_URL)}</b>, com a sua sessão${AI_DEMO?" ou, sem login, no modo demonstração (dados deste navegador)":""}. A IA recebe apenas códigos de estudantes, nunca nomes, e toda atividade gerada fica como rascunho até você aprovar.</p><button class="btn s" data-act="aiHealth">Verificar serviço de IA</button></div>`};
/* ===== agente de IA (serviço em agent/, chamado com a sessão do professor) ===== */
const AGENT_URL=((window.EDUCAMENTE_SUPABASE_CONFIG||{}).agentUrl||"http://localhost:3000").replace(/\/$/,"");
const LEVEL={
 reforco:["Nível 1 — Reforço","Questões introdutórias, instruções guiadas, exemplos resolvidos e progressão gradual."],
 consolidacao:["Nível 2 — Consolidação","Questões intermediárias, aplicação do conteúdo e problemas contextualizados."],
 aprofundamento:["Nível 3 — Aprofundamento","Questões mais complexas, raciocínio aplicado e problemas com várias etapas."]};
const TARGET={turma:"Turma toda",menor_aproveitamento:"Estudantes com menor aproveitamento no conteúdo",estudantes_selecionados:"Estudantes escolhidos por você"};
const TIPOS=["Exercícios","Questionário","Atividade prática","Revisão","Trabalho","Atividade avaliativa"];
const cloudOn=()=>!!window.educamenteSync?.state?.authenticated;
const rid=(g,id)=>window.educamenteSync.remoteIdOf(g,id),lid=(g,u)=>window.educamenteSync.localIdOf(g,u);
const statusLabel=s=>s==="draft"?"Aguardando aprovação":s||"—";
const statusChip=s=>`<span class="chip ${s==="Concluída"?"ok":s==="Em andamento"||s==="draft"?"wn":""}">${esc(statusLabel(s))}</span>`;

/* Modo demonstração (MVP): o serviço de IA pode aceitar uso sem login (DEMO_MODE=true no agent).
   Nesse caso, sem conta conectada, a IA trabalha sobre uma cópia dos dados deste navegador. */
let AI_DEMO=false,AI_STATUS="checking";/* checking | demo (IA sem login) | off (agente exige login) | down (agente não respondeu) */
const aiOn=()=>cloudOn()||AI_DEMO,demoAi=()=>!cloudOn()&&AI_DEMO;
/* Confere o agente de novo sempre que for preciso: ele pode ter subido depois que a página abriu. */
async function checkAi(){try{const r=await fetch(AGENT_URL+"/api/health",{cache:"no-store"});const j=await r.json();AI_STATUS=j.demo_mode?"demo":"off"}catch{AI_STATUS="down"}
 const was=AI_DEMO;AI_DEMO=AI_STATUS==="demo";if(AI_DEMO!==was)render();return AI_STATUS}
checkAi();
/* Sem login e sem IA: explica o motivo certo (agente fora do ar ou modo demonstração desligado). */
const aiOffText=()=>AI_STATUS==="down"
 ?`<p>O serviço de IA não respondeu em <b>${esc(AGENT_URL)}</b>, então a IA sem login não está disponível agora.</p><p class="muted">Para usar sem conta: rode <code>npm run dev</code> na pasta <code>agent</code>, ou coloque em <code>agentUrl</code> (arquivo <code>supabase-config.js</code>) o endereço do agente publicado.</p>`
 :`<p>O serviço de IA está no ar, mas o uso sem login está desligado nele (<code>DEMO_MODE=false</code>). Ligue o modo demonstração no agente ou use o botão <b>Entrar</b> no topo para acessar sua conta.</p>`;
const aiOffNote=()=>AI_STATUS==="down"
 ?`<p class="note">O serviço de IA não respondeu em <b>${esc(AGENT_URL)}</b>. Para usar a IA sem conta, rode <code>npm run dev</code> na pasta <code>agent</code> ou configure <code>agentUrl</code> com o endereço do agente publicado.</p><p style="margin:-4px 0 16px"><button class="btn s" data-act="aiRecheck">Verificar de novo</button></p>`
 :AI_STATUS==="checking"?`<p class="note">Verificando o serviço de IA…</p>`
 :`<p class="note">O uso da IA sem login está desligado no agente. Use o botão <b>Entrar</b> no topo para acessar sua conta.</p>`;
async function aiRecheck(){const st=await checkAi();render();toast(st==="demo"?"IA disponível sem login.":st==="down"?`O serviço de IA não respondeu em ${AGENT_URL}.`:"O agente respondeu, mas o uso sem login está desligado.")}

/* Cópia da turma enviada no modo demonstração: ids, notas e conteúdos. Nomes de alunos e observações não saem do navegador. */
function demoSnapshot(turmaId){const t=Svc.get("turmas",turmaId),avs=DB.avaliacoes.filter(a=>a.turmaId===turmaId),avIds=new Set(avs.map(a=>a.id));
 return{class:{id:rid("turmas",t.id),name:t.nome,grade:t.ano||null},
  students:DB.alunos.filter(a=>a.turmaId===turmaId).map(a=>({id:rid("alunos",a.id),...(a.criadoEm?{created_at:a.criadoEm}:{})})),
  assessments:avs.map(a=>({id:rid("avaliacoes",a.id),title:a.nome,subject:a.componente||"",content:a.conteudo||"",assessment_date:a.data,total_points:Number(a.total)})),
  results:DB.resultados.filter(r=>avIds.has(r.avaliacaoId)).map(r=>({id:rid("resultados",r.id),assessment_id:rid("avaliacoes",r.avaliacaoId),student_id:rid("alunos",r.alunoId),score:Number(r.pontos)})),
  activities:DB.atividades.filter(x=>x.turmaId===turmaId).slice(-100).map(x=>({id:rid("atividades",x.id),title:x.titulo,subject:x.componente||null,content:x.conteudo||null,activity_type:x.tipo||null,status:x.status||"Rascunho",origin:x.origem==="ai"?"ai":"teacher",complexity:x.ia?.complexity||null,...(x.criadoEm?{created_at:x.criadoEm}:{})})),
  analyses:(DB.analisesIA||[]).filter(a=>a.turmaId===turmaId).slice(-30).map(a=>({id:a.id,content:a.content||null,summary:String(a.summary).slice(0,2000),created_at:a.created_at}))}}
/* Linha no formato da tabela activities a partir do registro local (para reaproveitar mapActivity). */
const rowFromLocal=(a,p={})=>{const ia=a.ia||{};return{id:rid("atividades",a.id),title:a.titulo,description:a.descricao,class_id:rid("turmas",a.turmaId),subject:a.componente,content:a.conteudo,objective:a.objetivo,skill:a.habilidade,activity_type:a.tipo,application_date:a.aplicacao||null,deadline:a.prazo||null,instructions:a.instrucoes,questions:ia.questions,answer_key:ia.answer_key,worked_examples:ia.worked_examples,teacher_guidance:ia.teacher_guidance,justification:ia.justification,complexity:ia.complexity,target_group:ia.target_group,analysis_id:ia.analysis_id,approved_at:ia.approved_at,generation_metadata:ia.generation_metadata,status:a.status,origin:"ai",created_at:a.criadoEm,...p}};
/* Confere a estrutura no servidor (mesmas regras do fluxo com login) antes de mudar o registro local. */
async function demoValidate(a,edit){const ia=a.ia||{};
 const v=await agentFetch("/api/demo/activities/validate",{method:"POST",body:{activity:{title:a.titulo,objective:a.objetivo||"",skill:a.habilidade||"",instructions:a.instrucoes||"",teacher_guidance:ia.teacher_guidance||"",worked_examples:ia.worked_examples||[],questions:ia.questions||[],answer_key:ia.answer_key||[],...edit,content:a.conteudo||"",complexity:ia.complexity||"consolidacao",justification:ia.justification||""}}});
 if(!v.valid)throw Object.assign(new Error(edit?"A atividade editada tem problemas. Corrija e salve de novo.":"A atividade ainda tem problemas e não pode ser aprovada. Edite e corrija antes."),{details:{issues:v.issues}})}

async function agentFetch(path,opts={}){
 const client=window.educamenteSupabase?.client,sync=window.educamenteSync;
 const headers={"Content-Type":"application/json"};
 if(cloudOn()){
  const session=client?(await client.auth.getSession()).data?.session:null;
  if(!session?.access_token)throw new Error("Sua sessão expirou. Saia e entre novamente.");
  // A IA lê o banco: os cadastros pendentes precisam chegar à nuvem antes.
  await sync?.flush();
  if(sync?.state?.dirty)throw new Error("Há alterações que ainda não chegaram à nuvem. Verifique a conexão e tente de novo.");
  headers.Authorization="Bearer "+session.access_token;
 }else if(!AI_DEMO&&(await checkAi())!=="demo")throw new Error(AI_STATUS==="down"?`O serviço de IA não respondeu em ${AGENT_URL}. Rode npm run dev na pasta agent ou configure agentUrl com o endereço do agente publicado.`:"O uso da IA sem login está desligado no agente. Entre com sua conta para usar a IA.");
 // Com onEvent, o agente transmite o progresso real (NDJSON) enquanto trabalha.
 if(opts.onEvent)headers.Accept="application/x-ndjson";
 let r;
 try{r=await fetch(AGENT_URL+path,{method:opts.method||"GET",headers,body:opts.body?JSON.stringify(opts.body):undefined})}
 catch(e){throw Object.assign(new Error(`O serviço de IA não respondeu em ${AGENT_URL}. Confira se ele está rodando (npm run dev na pasta agent).`),{retryable:true})}
 if(opts.onEvent&&r.ok&&r.body&&(r.headers.get("content-type")||"").includes("ndjson"))return readAgentStream(r,opts.onEvent);
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(j.error?.message||`Erro ${r.status} no serviço de IA.`),{code:j.error?.code,retryable:j.error?.retryable,details:j.error?.details});
 return j}

/* Lê a resposta transmitida: eventos de progresso, depois o resultado (ou o erro) com o mesmo corpo do JSON de sempre. */
async function readAgentStream(r,onEvent){const rd=r.body.getReader(),dec=new TextDecoder();let buf="",end=null;
 const handle=line=>{if(!line.trim())return;let ev;try{ev=JSON.parse(line)}catch{return}
  if(ev.type==="result")end={data:ev.data};else if(ev.type==="error")end={error:ev.error||{},status:ev.status};else try{onEvent(ev)}catch{}};
 try{for(;;){const{value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf("\n"))>=0){handle(buf.slice(0,i));buf=buf.slice(i+1)}}handle(buf+dec.decode())}
 catch{end=null}
 if(end?.error)throw Object.assign(new Error(end.error.message||`Erro ${end.status} no serviço de IA.`),{code:end.error.code,retryable:end.error.retryable,details:end.error.details});
 if(!end)throw Object.assign(new Error("A conexão com o serviço de IA caiu antes do fim. Confira o histórico antes de tentar de novo: o resultado pode ter sido salvo."),{retryable:true});
 return end.data}

/* ===== painel "a IA está trabalhando": mostra só o que o agente informa em tempo real ===== */
const THINK={};let thinkTimer=null;
const mmss=ms=>{const s=Math.max(0,Math.floor(ms/1000));return`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`};
const THINK_MARK=`<svg class="think-mark" viewBox="0 0 24 24" aria-hidden="true"><circle class="orbit" cx="12" cy="12" r="10.5"/><path class="spark" fill="currentColor" d="M12 3.2c.7 4.6 4.2 8.1 8.8 8.8-4.6.7-8.1 4.2-8.8 8.8-.7-4.6-4.2-8.1-8.8-8.8 4.6-.7 8.1-4.2 8.8-8.8Z"/></svg>`;
const thinkLi=t=>`<li><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${esc(t)}</span></li>`;
function thinkStart(key){THINK[key]={t0:Date.now(),label:"Conectando ao serviço de IA",phase:"checking",steps:[]};
 if(!thinkTimer)thinkTimer=setInterval(()=>{const ks=Object.keys(THINK);if(!ks.length){clearInterval(thinkTimer);thinkTimer=null;return}
  ks.forEach(k=>{const el=document.querySelector(`#think-${k} .think-time`);if(el)el.textContent=mmss(Date.now()-THINK[k].t0)})},1000);
 return ev=>{const s=THINK[key];if(!s)return;const box=document.getElementById("think-"+key);
  if(ev.type==="step"){s.steps.push(ev.text);box?.querySelector(".think-steps")?.insertAdjacentHTML("beforeend",thinkLi(ev.text))}
  else if(ev.type==="status"){s.label=ev.label;s.phase=ev.phase;const n=box?.querySelector(".think-now");if(n){n.textContent=ev.label;n.dataset.phase=ev.phase}}}}
const thinkEnd=key=>{delete THINK[key]};
function thinkHtml(key,hint){const s=THINK[key];if(!s)return"";
 return`<section class="think" id="think-${key}" aria-label="Progresso da IA"><div class="think-head">${THINK_MARK}<div class="think-title"><b>A IA está trabalhando</b><span class="think-now" data-phase="${esc(s.phase)}">${esc(s.label)}</span></div><span class="think-time" aria-hidden="true">${mmss(Date.now()-s.t0)}</span></div>
 <ol class="think-steps" aria-live="polite" aria-label="Etapas concluídas">${s.steps.map(thinkLi).join("")}</ol>${hint?`<p class="think-hint">${hint}</p>`:""}</section>`}

/* Nomes de estudantes ficam só no navegador: a IA trabalha com códigos (E1, E2...). */
const nameOfStudent=uuid=>DB.alunos.find(a=>a.id===lid("alunos",uuid))?.nome;
const legendOf=students=>Object.fromEntries((students||[]).map(s=>[s.code,nameOfStudent(s.student_id)||s.code]));
const named=(text,L)=>esc(text).replace(/\bE\d{1,3}\b/g,c=>L[c]&&L[c]!==c?`<b title="${c}">${esc(L[c])}</b>`:c);
const opsHtml=ops=>ops?.length?`<div class="card"><h2>O que a IA fez</h2><ol class="ops">${ops.map(o=>`<li>${esc(o)}</li>`).join("")}</ol></div>`:"";
function upsertLocalActivity(row){const rec=window.educamenteSync.mapActivity(row),i=DB.atividades.findIndex(x=>x.id===rec.id);
 if(i>=0)DB.atividades[i]=rec;else DB.atividades.push(rec);Repo.write(DB);return rec}

/* ----- página de análise pedagógica ----- */
const AN={turma:"",avaliacao:"",conteudo:"",busy:false,result:null,error:null,history:null};
function anView(){
 const head=`<h1>Análise pedagógica</h1><p class="sub">A IA consulta os resultados registrados, calcula os indicadores e explica o que eles mostram. A decisão pedagógica é sua.</p>`;
 if(!DB.turmas.length)return head+`<div class="card empty">Cadastre uma turma, os alunos e uma avaliação com resultados para analisar.</div>`;
 if(!Svc.get("turmas",AN.turma))AN.turma=DB.turmas[0].id;
 const avs=DB.avaliacoes.filter(a=>a.turmaId===AN.turma),conts=[...new Set(avs.map(a=>a.conteudo).filter(Boolean))];
 return head+(cloudOn()?"":AI_DEMO?`<p class="note"><b>Modo demonstração:</b> a IA usa os dados salvos neste navegador, sem login. Os nomes dos alunos não são enviados, e os resultados ficam só aqui.</p>`:aiOffNote())+
 `<div class="card"><div class="flt">
  <div><label for="anT">Turma</label><select id="anT" data-an="turma">${turmaO().map(([a,b])=>`<option value="${esc(a)}" ${a===AN.turma?"selected":""}>${esc(b)}</option>`).join("")}</select></div>
  <div><label for="anA">Avaliação</label><select id="anA" data-an="avaliacao"><option value="">Todas</option>${avs.map(a=>`<option value="${esc(a.id)}" ${a.id===AN.avaliacao?"selected":""}>${esc(a.nome)} (${dt(a.data)})</option>`).join("")}</select></div>
  <div><label for="anC">Conteúdo</label><select id="anC" data-an="conteudo"><option value="">Todos</option>${conts.map(c=>`<option value="${esc(c)}" ${c===AN.conteudo?"selected":""}>${esc(c)}</option>`).join("")}</select></div></div>
  <div class="row-act"><button class="btn" data-act="anRun" ${AN.busy||!aiOn()?"disabled":""}>${AN.busy?"Analisando…":"Analisar aprendizagem com IA"}</button></div></div>
 <div id="anOut" aria-live="polite">${anResultHtml()}</div>
 <div class="card"><div class="top" style="margin-bottom:8px"><h2 style="margin:0">Análises anteriores</h2><button class="btn s" data-act="anHist" ${aiOn()?"":"disabled"}>${AN.history?"Atualizar":"Carregar histórico"}</button></div>${anHistHtml()}</div>`}

function anResultHtml(){
 if(AN.busy)return`<div class="card">${thinkHtml("an","Costuma levar até um minuto. A IA recebe só códigos (E1, E2…), nunca os nomes dos alunos.")}</div>`;
 if(AN.error)return`<div class="card"><h2>Não foi possível concluir a análise</h2><p class="err" style="font-size:14px">${esc(AN.error.message)}</p><p class="muted" style="font-size:13px">Nenhum registro foi alterado.</p>${AN.error.retryable!==false?`<button class="btn s" data-act="anRun">Tentar novamente</button>`:""}</div>`+opsHtml(AN.error.details?.operations);
 const r=AN.result;if(!r)return"";
 if(r.status==="insufficient_data")return`<div class="card"><h2>Dados insuficientes</h2><p style="margin:0">${esc(r.message)}</p></div>`+opsHtml(r.operations);
 const L=legendOf(r.students),ev=r.evidence,a=r.analysis;
 return`<div class="card"><h2>Resultado da análise</h2><p style="margin-top:0">${named(a.summary,L)}</p>
 ${a.attention_points.length?`<h2 class="h-sec">Pontos de atenção</h2><ul>${a.attention_points.map(p=>`<li>${named(p,L)}</li>`).join("")}</ul>`:""}
 <h2 class="h-sec">Recomendações</h2><ul>${a.recommendations.map(x=>`<li>${named(x.text,L)}<br><span class="muted" style="font-size:13px">Evidência: ${named(x.evidence,L)}</span></li>`).join("")}</ul>
 ${r.suggested_complexity?`<p class="note">Os dados sugerem <b>${LEVEL[r.suggested_complexity][0]}</b> para uma atividade em <b>${esc(r.focus_content||"")}</b>. É só uma sugestão: você escolhe o nível.</p>`:""}
 <div class="row-act"><button class="btn g" data-act="aiGen:analysis">Gerar atividade com IA</button><button class="btn s" data-act="anPrint">Imprimir relatório</button><button class="btn s" data-act="anDownload">Baixar relatório (Word)</button></div>
 <p class="muted" style="font-size:12px;margin:12px 0 0">Análise gerada com IA a partir dos resultados registrados e salva no histórico da turma. Revise antes de usar.</p></div>
 <div class="card"><h2>Evidências utilizadas</h2>
 <div class="stats">${[["Aproveitamento médio",fmt(ev.overall_mean)],["Avaliações",ev.assessment_count],["Resultados",ev.result_count],["Abaixo de 50%",`${ev.students_below_threshold} de ${ev.students_with_results}`]].map(([l,v])=>`<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
 <div class="g2"><div><h2>Por conteúdo</h2>${bars(ev.by_content.filter(c=>c.mean!=null).map(c=>({l:c.label,v:c.mean})))}</div>
 <div><h2>Distribuição dos resultados</h2>${ev.distribution.map(d=>`<div class="ln"><span>${esc(d.label)}</span><div class="bar ${d.band==="abaixo_de_50"?"bad":d.band==="de_50_a_69"?"wn":""}"><i style="width:${d.pct}%"></i></div><b>${d.count}</b></div>`).join("")}</div></div>
 <h2 class="h-sec">Por estudante</h2>${mini(ev.students,s=>`<tr><td>${esc(L[s.code]||s.code)}</td><td>${chipP(s.mean)}</td><td>${s.results} resultado(s)</td></tr>`)}
 <h2 class="h-sec">Evolução</h2>${ev.evolution.comparable?ev.evolution.groups.map(g=>g.steps.map(s=>`<p style="font-size:14px;margin:4px 0">${esc(g.content)}: ${esc(s.from.title)} (${fmt(s.from.mean)}) → ${esc(s.to.title)} (${fmt(s.to.mean)}), ${s.class_delta>0?"+":""}${String(s.class_delta).replace(".",",")} pontos.</p>`).join("")).join(""):`<p class="muted" style="font-size:14px;margin:4px 0">${esc(ev.evolution.note)}</p>`}
 <p class="muted" style="font-size:12px;margin:12px 0 0">Os nomes aparecem só no seu navegador: a IA recebeu apenas códigos (E1, E2…).</p></div>`+opsHtml(r.operations)}

function anHistHtml(){const h=AN.history;
 if(!h)return'<p class="muted" style="margin:0">As análises e atividades geradas com IA ficam registradas e podem ser consultadas aqui.</p>';
 if(h.error)return`<p class="err">${esc(h.error)}</p>`;
 return(h.analyses.length?mini(h.analyses,a=>`<tr><td style="white-space:nowrap">${dt(a.created_at.slice(0,10))}</td><td>${esc(a.content||"Todos os conteúdos")}</td><td>${named(a.summary,legendOf(a.students))}</td></tr>`):'<p class="muted">Nenhuma análise registrada para esta turma.</p>')+
 (h.activities.length?`<h2 class="h-sec">Atividades geradas com IA</h2>`+mini(h.activities,x=>`<tr><td style="white-space:nowrap">${dt(x.created_at.slice(0,10))}</td><td>${esc(x.title)}</td><td>${statusChip(x.status)}</td><td><button class="ib" data-act="aiOpen:${esc(x.id)}">Abrir</button></td></tr>`):"")}

async function anRun(){if(AN.busy)return;
 const onEvent=thinkStart("an");
 AN.busy=true;AN.error=null;AN.result=null;render();
 try{const a=AN.avaliacao&&Svc.get("avaliacoes",AN.avaliacao);
  const filters={...(a?{assessment_id:rid("avaliacoes",a.id)}:{}),...(AN.conteudo?{content:AN.conteudo}:{})};
  AN.result=demoAi()
   ?await agentFetch("/api/demo/analyze",{method:"POST",body:{snapshot:demoSnapshot(AN.turma),...filters},onEvent})
   :await agentFetch("/api/agent/analyze",{method:"POST",body:{class_id:rid("turmas",AN.turma),...filters},onEvent});
  // No modo demonstração o histórico fica neste navegador.
  if(demoAi()&&AN.result.status==="ok"){const x=AN.result.analysis;
   (DB.analisesIA??=[]).push({id:x.id,turmaId:AN.turma,created_at:x.created_at,content:AN.conteudo||null,summary:x.summary,attention_points:x.attention_points,recommendations:x.recommendations,students:AN.result.students});
   Repo.write(DB)}
  AN.history=null}
 catch(e){AN.error=e}
 finally{AN.busy=false;thinkEnd("an");if(view==="analise")render()}}
async function anHist(){
 if(demoAi()){AN.history={analyses:(DB.analisesIA||[]).filter(a=>a.turmaId===AN.turma).slice().reverse(),
  activities:DB.atividades.filter(a=>a.turmaId===AN.turma&&a.origem==="ai").map(a=>({id:rid("atividades",a.id),title:a.titulo,status:a.status,created_at:a.criadoEm||""})).reverse()};return render()}
 try{AN.history=await agentFetch(`/api/agent/history?class_id=${encodeURIComponent(rid("turmas",AN.turma))}`)}catch(e){AN.history={error:e.message}}render()}

/* ----- geração de atividade com IA ----- */
const GEN={},AI_LAST={};
async function aiGenM(pre){
 if(!aiOn()&&!cloudOn())await checkAi();
 if(!aiOn())return openM(`<h2>Gerar atividade com IA</h2>${aiOffText()}<p style="text-align:right;margin:16px 0 0"><button class="btn" data-act="close">Entendi</button></p>`);
 if(!DB.turmas.length)return openM(`<h2>Cadastre uma turma primeiro</h2><p class="muted">A atividade é personalizada a partir dos resultados de uma turma.</p><button class="btn" data-act="close">Entendi</button>`);
 for(const k of Object.keys(GEN))delete GEN[k];
 Object.assign(GEN,{turmaId:Svc.get("turmas",AN.turma)?AN.turma:DB.turmas[0].id,publico:"turma",nivel:"consolidacao",qtd:5,tipo:"Exercícios",alunos:[]},pre||{});
 openM(genFormHtml())}
function readGen(){const v=id=>$(id)?.value.trim()??"";
 Object.assign(GEN,{conteudo:v("g_c"),componente:v("g_comp"),tipo:v("g_tipo")||GEN.tipo,qtd:v("g_q"),habilidade:v("g_h"),objetivo:v("g_o"),notas:v("g_n"),
  publico:document.querySelector('input[name="g_pub"]:checked')?.value||GEN.publico,nivel:document.querySelector('input[name="g_niv"]:checked')?.value||GEN.nivel,
  alunos:[...document.querySelectorAll('input[name="g_al"]:checked')].map(x=>x.value)})}
function genFormHtml(){const t=GEN.turmaId,avs=DB.avaliacoes.filter(a=>a.turmaId===t),conts=[...new Set(avs.map(a=>a.conteudo).filter(Boolean))],als=DB.alunos.filter(a=>a.turmaId===t);
 if(GEN.conteudo===undefined)GEN.conteudo=conts[0]||"";
 const comp=GEN.componente||avs.find(a=>a.conteudo===GEN.conteudo)?.componente||"";
 const radio=(name,val,cur,title,desc,extra="")=>`<label class="choice"><input type="radio" name="${name}" value="${val}" ${val===cur?"checked":""} ${extra}><span><b>${title}</b>${desc?`<br><span class="muted">${desc}</span>`:""}</span></label>`;
 return`<h2>Gerar atividade com IA</h2><div id="g_think"></div><div id="g_form"><p class="muted" style="margin-top:0">A IA usa os resultados desta turma para personalizar a atividade. Ela fica salva como rascunho até você revisar e aprovar.</p>
 <div class="fg">
 <div><label for="g_t">Turma *</label><select id="g_t" data-gen="turma">${turmaO().map(([a,b])=>`<option value="${esc(a)}" ${a===t?"selected":""}>${esc(b)}</option>`).join("")}</select></div>
 <div><label for="g_c">Conteúdo *</label><input id="g_c" list="g_cl" value="${esc(GEN.conteudo)}" autocomplete="off"><datalist id="g_cl">${conts.map(c=>`<option value="${esc(c)}">`).join("")}</datalist><span class="err" id="e_g_c"></span></div>
 <div><label for="g_comp">Componente curricular</label><select id="g_comp"><option value="">Não informado</option>${COMPS.map(c=>`<option ${c===comp?"selected":""}>${c}</option>`).join("")}</select></div>
 <div><label for="g_tipo">Tipo de atividade *</label><select id="g_tipo">${TIPOS.map(x=>`<option ${x===GEN.tipo?"selected":""}>${x}</option>`).join("")}</select></div>
 <div><label for="g_q">Quantidade de questões *</label><input id="g_q" type="number" min="1" max="15" step="1" value="${esc(GEN.qtd)}"><span class="err" id="e_g_q"></span></div>
 <div><label for="g_h">Habilidade (opcional)</label><input id="g_h" value="${esc(GEN.habilidade||"")}" placeholder="Ex.: EF06MA07"></div>
 <div class="full"><label for="g_o">Objetivo pedagógico (opcional)</label><textarea id="g_o" placeholder="Em branco, a IA propõe um objetivo com base nos resultados.">${esc(GEN.objetivo||"")}</textarea></div>
 <fieldset class="full"><legend>Público-alvo *</legend>
  ${Object.entries(TARGET).map(([k,l])=>radio("g_pub",k,GEN.publico,l,"",'data-gen="publico"')).join("")}
  <div id="g_alb" class="choice-list" ${GEN.publico==="estudantes_selecionados"?"":"hidden"}>${als.length?als.map(a=>`<label class="check"><input type="checkbox" name="g_al" value="${esc(a.id)}" ${GEN.alunos.includes(a.id)?"checked":""}> ${esc(a.nome)}</label>`).join(""):'<p class="muted">Esta turma não tem alunos cadastrados.</p>'}</div>
  <span class="err" id="e_g_al"></span></fieldset>
 <fieldset class="full"><legend>Nível de complexidade *</legend>
  ${Object.entries(LEVEL).map(([k,[l,d]])=>radio("g_niv",k,GEN.nivel,l+(GEN.sugerido===k?' <span class="chip">sugerido pelos dados</span>':""),d)).join("")}
  <p class="muted" style="font-size:12px;margin:4px 0 0">O nível vale só para esta atividade; não é um rótulo do estudante.</p></fieldset>
 <div class="full"><label for="g_n">Observações para a IA (opcional)</label><textarea id="g_n" maxlength="1000" placeholder="Ex.: usar situações de compras na feira.">${esc(GEN.notas||"")}</textarea></div></div></div>
 <p class="err" id="g_err" style="font-size:14px"></p><p class="muted" id="g_busy" role="status" style="font-size:13px"></p>
 <p style="text-align:right;margin:16px 0 0"><button class="btn s" data-act="close" id="g_cancel">Cancelar</button> <button class="btn" data-act="aiGenRun" id="g_run">Gerar atividade</button></p>`}

async function aiGenRun(){if(GEN.busy)return;readGen();
 const er={},q=Number(GEN.qtd);
 if(!GEN.conteudo)er.g_c="Informe o conteúdo.";
 if(!Number.isInteger(q)||q<1||q>15)er.g_q="Use de 1 a 15 questões.";
 if(GEN.publico==="estudantes_selecionados"&&!GEN.alunos.length)er.g_al="Selecione ao menos um estudante.";
 ["g_c","g_q","g_al"].forEach(k=>{if($("e_"+k))$("e_"+k).textContent=er[k]||""});
 if(Object.keys(er).length)return;
 // Enquanto a IA trabalha, o formulário dá lugar ao painel de progresso; num erro, ele volta como estava.
 const lock=on=>{GEN.busy=on;if($("g_run")){$("g_run").disabled=on;$("g_run").textContent=on?"Gerando…":"Tentar novamente"}if($("g_cancel"))$("g_cancel").disabled=on;
  if($("g_form"))$("g_form").hidden=on;
  if($("g_think"))$("g_think").innerHTML=on?thinkHtml("gen","Consultar, planejar, escrever e revisar costuma levar alguns minutos. Não feche esta janela."):""};
 const onEvent=thinkStart("gen");
 lock(true);$("g_err").textContent="";
 try{const body={class_id:rid("turmas",GEN.turmaId),content:GEN.conteudo,target_group:GEN.publico,complexity:GEN.nivel,question_count:q,activity_type:GEN.tipo,
   ...(GEN.componente?{subject:GEN.componente}:{}),...(GEN.habilidade?{skill:GEN.habilidade}:{}),...(GEN.objetivo?{objective:GEN.objetivo}:{}),...(GEN.notas?{teacher_notes:GEN.notas}:{}),
   ...(GEN.publico==="estudantes_selecionados"?{student_ids:GEN.alunos.map(id=>rid("alunos",id))}:{}),
   ...(GEN.analysisId?{analysis_id:GEN.analysisId}:{}),...(GEN.regenerateOf?{regenerate_of:GEN.regenerateOf}:{})};
  const out=demoAi()
   ?await agentFetch("/api/demo/activities",{method:"POST",body:{...body,snapshot:demoSnapshot(GEN.turmaId)},onEvent})
   :await agentFetch("/api/agent/activities",{method:"POST",body,onEvent});
  thinkEnd("gen");
  const rec=upsertLocalActivity(out.activity);
  AI_LAST[rec.id]={operations:out.operations,validation:out.validation};
  GEN.busy=false;closeM();render();aiPreview(rec.id);toast("Rascunho gerado. Revise antes de aprovar.")}
 catch(e){thinkEnd("gen");lock(false);
  if($("g_err")){const iss=e.details?.issues||[];$("g_err").innerHTML=esc(e.message)+(iss.length?`<br>${iss.map(i=>esc(typeof i==="string"?i:i.message)).join("<br>")}`:"")+(e.retryable===false?"":"<br>Nada foi salvo; você pode tentar novamente.")}
  else toast(e.message)}}

/* ----- revisão: visualizar, editar, regenerar, aprovar ----- */
function valHtml(v){if(!v)return"";
 const probs=[...(v.structural_issues||[]).map(i=>i.message),...((v.review&&v.review.issues)||[]).map(i=>(i.question?`Questão ${i.question}: `:"")+i.problem)];
 return v.passed?`<p class="note">Validação automática: estrutura, gabarito e conteúdo conferidos.${probs.length?` Observações: ${probs.map(esc).join(" ")}`:""}</p>`
  :`<div class="warnbox"><b>A validação automática apontou pontos para revisar antes de aprovar:</b><ul>${probs.map(p=>`<li>${esc(p)}</li>`).join("")}</ul></div>`}
/* ===== imprimir e baixar (print-doc.js): atividades da IA e relatório da análise ===== */
const PR=window.EducaPrint;
const escolaNome=()=>{const t=($("escola")?.textContent||"").trim();return t&&t!=="Escola"?t:""};
function aiDoc(id,kind){const a=Svc.get("atividades",id);if(!a)return null;const ia=a.ia||{},E=PR.esc,escola=escolaNome();
 const meta=[["Turma",nm("turmas",a.turmaId)],["Disciplina",a.componente],["Conteúdo",a.conteudo]];
 const folha=PR.identificacao()+(a.instrucoes?`<div class="box"><b>Instruções:</b> ${E(a.instrucoes)}</div>`:"")
  +((ia.worked_examples||[]).length?"<h2>Exemplos resolvidos</h2>"+ia.worked_examples.map(w=>`<div class="q"><p><b>${E(w.problem)}</b></p><p style="white-space:pre-wrap">${E(w.solution)}</p></div>`).join(""):"")
  +"<h2>Questões</h2>"+(ia.questions||[]).map(q=>`<div class="q"><p><span class="q-n">${E(q.number)}.</span> ${E(q.statement)}</p>${q.options?.length?`<ol>${q.options.map(o=>`<li>${E(o)}</li>`).join("")}</ol>`:PR.linhas(4)}</div>`).join("");
 const gab="<h2>Gabarito</h2>"+(ia.answer_key||[]).map(k=>`<p><b>${E(k.question)}.</b> ${E(k.answer)}${k.explanation?`<br><span class="muted">${E(k.explanation)}</span>`:""}</p>`).join("")
  +(ia.teacher_guidance?`<h2>Orientação ao professor</h2><p style="white-space:pre-wrap">${E(ia.teacher_guidance)}</p>`:"")
  +(a.objetivo||a.habilidade?`<h2>Objetivo e habilidade</h2><p>${E(a.objetivo||"")}${a.habilidade?`<br><span class="muted">Habilidade: ${E(a.habilidade)}</span>`:""}</p>`:"")
  +(ia.justification?`<h2>Por que esta atividade</h2><p style="white-space:pre-wrap">${E(ia.justification)}</p>`:"");
 const situacao=a.status==="draft"?[["Situação","rascunho não aprovado"]]:[];
 if(kind==="aluno")return{title:a.titulo,escola,meta,body:folha,rodape:"Atividade elaborada com apoio do EducaMente AI e revisada pelo professor."};
 if(kind==="professor")return{title:a.titulo+": gabarito e orientações",escola,meta:[...meta,...situacao],body:gab};
 return{title:a.titulo,escola,meta:[...meta,...situacao],body:folha+'<div class="page-break"></div><h1>Gabarito e orientações ao professor</h1>'+gab}}
function anDoc(){const r=AN.result;if(!r||r.status!=="ok")return null;const L=legendOf(r.students),ev=r.evidence,a=r.analysis,E=PR.esc,N=t=>named(t,L);
 const av=AN.avaliacao&&Svc.get("avaliacoes",AN.avaliacao);
 const body=`<table class="stats"><tr>${[["Aproveitamento médio",fmt(ev.overall_mean)],["Avaliações",ev.assessment_count],["Resultados",ev.result_count],["Abaixo de 50%",`${ev.students_below_threshold} de ${ev.students_with_results}`]].map(([l,v])=>`<td><b>${E(v)}</b>${E(l)}</td>`).join("")}</tr></table>
 <h2>Resumo</h2><p>${N(a.summary)}</p>
 ${a.attention_points.length?`<h2>Pontos de atenção</h2><ul>${a.attention_points.map(p=>`<li>${N(p)}</li>`).join("")}</ul>`:""}
 <h2>Recomendações</h2><ol>${a.recommendations.map(x=>`<li>${N(x.text)}<br><span class="muted">Evidência: ${N(x.evidence)}</span></li>`).join("")}</ol>
 <h2>Aproveitamento por conteúdo</h2><table><tr><th>Conteúdo</th><th class="n">Média</th></tr>${ev.by_content.filter(c=>c.mean!=null).map(c=>`<tr><td>${E(c.label)}</td><td class="n">${fmt(c.mean)}</td></tr>`).join("")}</table>
 <h2>Por estudante</h2><table><tr><th>Estudante</th><th class="n">Aproveitamento</th><th class="n">Resultados</th></tr>${ev.students.map(s=>`<tr><td>${E(L[s.code]||s.code)}</td><td class="n">${fmt(s.mean)}</td><td class="n">${E(s.results)}</td></tr>`).join("")}</table>
 <h2>Evolução</h2>${ev.evolution.comparable?ev.evolution.groups.map(g=>g.steps.map(st=>`<p>${E(g.content)}: ${E(st.from.title)} (${fmt(st.from.mean)}) → ${E(st.to.title)} (${fmt(st.to.mean)}), ${st.class_delta>0?"+":""}${String(st.class_delta).replace(".",",")} pontos.</p>`).join("")).join(""):`<p class="muted">${E(ev.evolution.note)}</p>`}`;
 return{title:"Relatório de análise pedagógica",escola:escolaNome(),meta:[["Turma",nm("turmas",AN.turma)],["Avaliação",av?.nome],["Conteúdo",AN.conteudo],["Data",new Date().toLocaleDateString("pt-BR")]],body,rodape:"Análise gerada com IA a partir dos resultados registrados no EducaMente AI. Revise antes de usar."}}
function aiPreview(id){const a=Svc.get("atividades",id);if(!a)return toast("Atividade não encontrada. Recarregue a página.");
 const ia=a.ia||{},meta=ia.generation_metadata||{},extra=AI_LAST[id],draft=a.status==="draft",ops=extra?.operations||meta.operations;
 openM(`<h2 style="font-size:18px">${esc(a.titulo)}</h2>
 <p>${draft?'<span class="chip wn">Rascunho gerado com IA — aguardando sua revisão</span>':`<span class="chip ok">Aprovada${ia.approved_at?" em "+dt(ia.approved_at.slice(0,10)):""}</span>`}</p>
 <div class="row-act print-row" role="group" aria-label="Imprimir ou baixar"><button class="btn s" data-act="aiPrint:${a.id}:aluno">Imprimir para os alunos</button><button class="btn s" data-act="aiPrint:${a.id}:professor">Imprimir gabarito</button><button class="btn s" data-act="aiDownload:${a.id}">Baixar (Word)</button>${draft?'<span class="muted">Ainda é rascunho: revise antes de entregar aos alunos.</span>':""}</div>
 <dl class="kv"><dt>Turma</dt><dd>${esc(nm("turmas",a.turmaId))}</dd><dt>Disciplina</dt><dd>${esc(a.componente||"—")}</dd><dt>Conteúdo</dt><dd>${esc(a.conteudo)}</dd><dt>Objetivo</dt><dd>${esc(a.objetivo)}</dd><dt>Habilidade</dt><dd>${esc(a.habilidade||"—")}</dd><dt>Público-alvo</dt><dd>${esc(TARGET[ia.target_group]||"—")}</dd><dt>Nível</dt><dd>${esc(LEVEL[ia.complexity]?.[0]||"—")}</dd><dt>Tipo</dt><dd>${esc(a.tipo)}</dd></dl>
 ${sec("Instruções",`<p style="white-space:pre-wrap;margin:0">${esc(a.instrucoes)}</p>`)}
 ${(ia.worked_examples||[]).length?sec("Exemplos resolvidos",ia.worked_examples.map(w=>`<div class="aiq"><p style="margin:0 0 4px"><b>${esc(w.problem)}</b></p><p class="muted" style="white-space:pre-wrap;margin:0">${esc(w.solution)}</p></div>`).join("")):""}
 ${sec("Questões",(ia.questions||[]).map(q=>`<div class="aiq"><p style="margin:0"><b>${q.number}.</b> ${esc(q.statement)}</p>${q.options?.length?`<ol type="A">${q.options.map(o=>`<li>${esc(o)}</li>`).join("")}</ol>`:""}</div>`).join(""))}
 <details class="aiq"><summary><b>Gabarito</b></summary>${(ia.answer_key||[]).map(k=>`<p><b>${k.question}.</b> ${esc(k.answer)}${k.explanation?`<br><span class="muted">${esc(k.explanation)}</span>`:""}</p>`).join("")}</details>
 ${sec("Orientação ao professor",`<p style="white-space:pre-wrap;margin:0">${esc(ia.teacher_guidance)}</p>`)}
 ${sec("Por que esta atividade",`<p style="white-space:pre-wrap;margin:0">${esc(ia.justification)}</p>`)}
 ${sec("Validação",valHtml(meta.validation||extra?.validation)||'<p class="muted">Sem registro de validação.</p>')}
 ${ops?.length?sec("O que a IA fez",`<ol class="ops">${ops.map(o=>`<li>${esc(o)}</li>`).join("")}</ol>`):""}
 <div class="err" id="ai_err" style="font-size:14px"></div>
 <p class="row-act" style="justify-content:flex-end"><button class="btn s" data-act="close">Fechar</button><button class="btn s" data-act="aiEdit:${a.id}">Editar</button><button class="btn s" data-act="aiRegen:${a.id}">Regenerar</button>${draft?`<button class="btn g" data-act="aiApprove:${a.id}">Aprovar atividade</button>`:""}</p>`)}

function aiEditM(id){const a=Svc.get("atividades",id);if(!a)return;const ia=a.ia||{};
 const ta=(i,l,v)=>`<label for="${i}">${l}</label><textarea id="${i}">${esc(v)}</textarea>`;
 openM(`<h2>Editar atividade</h2><p class="muted" style="margin-top:0">Ao salvar, a atividade volta a ser rascunho e precisa de nova aprovação.</p>
 <div class="fg"><div class="full"><label for="ae_t">Título</label><input id="ae_t" value="${esc(a.titulo)}"></div>
 <div class="full">${ta("ae_o","Objetivo pedagógico",a.objetivo)}</div><div class="full"><label for="ae_h">Habilidade</label><input id="ae_h" value="${esc(a.habilidade)}"></div>
 <div class="full">${ta("ae_i","Instruções",a.instrucoes)}</div></div>
 ${(ia.worked_examples||[]).map((w,i)=>`<div class="aiq">${ta("ae_wp"+i,`Exemplo resolvido ${i+1}: problema`,w.problem)}${ta("ae_ws"+i,"Resolução",w.solution)}</div>`).join("")}
 ${(ia.questions||[]).map((q,i)=>{const k=(ia.answer_key||[]).find(x=>x.question===q.number)||{};
  return`<div class="aiq">${ta("ae_q"+i,`Questão ${q.number}: enunciado`,q.statement)}${q.type==="multipla_escolha"?ta("ae_op"+i,"Alternativas (uma por linha, na ordem A, B, C, D)",(q.options||[]).join("\n")):""}
  <div class="fg"><div><label for="ae_a${i}">Resposta${q.type==="multipla_escolha"?" (letra)":""}</label><input id="ae_a${i}" value="${esc(k.answer||"")}"></div><div><label for="ae_e${i}">Explicação</label><input id="ae_e${i}" value="${esc(k.explanation||"")}"></div></div></div>`}).join("")}
 ${ta("ae_g","Orientação ao professor",ia.teacher_guidance)}
 <div class="err" id="ae_err" style="font-size:14px"></div>
 <p style="text-align:right;margin:16px 0 0"><button class="btn s" data-act="aiBack:${a.id}">Cancelar</button> <button class="btn" data-act="aiSave:${a.id}" id="ae_save">Salvar alterações</button></p>`)}
async function aiSave(id){const a=Svc.get("atividades",id),ia=a.ia||{},v=x=>$(x).value.trim();
 const body={title:v("ae_t"),objective:v("ae_o"),skill:v("ae_h"),instructions:v("ae_i"),teacher_guidance:v("ae_g"),
  worked_examples:(ia.worked_examples||[]).map((w,i)=>({problem:v("ae_wp"+i),solution:v("ae_ws"+i)})),
  questions:(ia.questions||[]).map((q,i)=>({number:q.number,type:q.type,statement:v("ae_q"+i),options:q.type==="multipla_escolha"?v("ae_op"+i).split("\n").map(s=>s.trim()).filter(Boolean):[]})),
  answer_key:(ia.questions||[]).map((q,i)=>({question:q.number,answer:v("ae_a"+i),explanation:v("ae_e"+i)}))};
 $("ae_save").disabled=true;
 try{if(demoAi()){await demoValidate(a,body);
   upsertLocalActivity(rowFromLocal(a,{title:body.title,objective:body.objective,skill:body.skill||a.habilidade,instructions:body.instructions,teacher_guidance:body.teacher_guidance,worked_examples:body.worked_examples,questions:body.questions,answer_key:body.answer_key,status:"draft",approved_at:null}))}
  else{const out=await agentFetch(`/api/activities/${encodeURIComponent(rid("atividades",id))}`,{method:"PATCH",body});upsertLocalActivity(out.activity)}render();aiPreview(id);toast("Alterações salvas. A atividade voltou a ser rascunho.")}
 catch(e){$("ae_save").disabled=false;const iss=e.details?.issues||[];$("ae_err").innerHTML=esc(e.message)+(iss.length?`<ul>${iss.map(i=>`<li>${esc(i.message||i.path+": "+i.message)}</li>`).join("")}</ul>`:"")}}
async function aiApprove(id){
 try{if(demoAi()){const a=Svc.get("atividades",id);await demoValidate(a);upsertLocalActivity(rowFromLocal(a,{status:"Planejada",approved_at:new Date().toISOString()}))}
  else{const out=await agentFetch(`/api/activities/${encodeURIComponent(rid("atividades",id))}/approve`,{method:"POST"});upsertLocalActivity(out.activity)}render();aiPreview(id);toast("Atividade aprovada.")}
 catch(e){const iss=e.details?.issues||[];if($("ai_err"))$("ai_err").innerHTML=esc(e.message)+(iss.length?`<ul>${iss.map(i=>`<li>${esc(i.message)}</li>`).join("")}</ul>`:"")}}
function aiRegen(id){const a=Svc.get("atividades",id);if(!a)return;const ia=a.ia||{},r=(ia.generation_metadata||{}).request||{};
 aiGenM({turmaId:a.turmaId,conteudo:r.content||a.conteudo,componente:r.subject||a.componente,habilidade:r.skill||"",objetivo:r.objective||"",
  publico:r.target_group||ia.target_group||"turma",alunos:(r.student_ids||[]).map(u=>lid("alunos",u)),nivel:r.complexity||ia.complexity||"consolidacao",
  qtd:r.question_count||(ia.questions||[]).length||5,tipo:r.activity_type||a.tipo||"Exercícios",notas:r.teacher_notes||"",analysisId:ia.analysis_id||undefined,regenerateOf:rid("atividades",id)})}
function aiGenFromAnalysis(){const r=AN.result;if(!r||r.status!=="ok")return aiGenM();
 aiGenM({turmaId:AN.turma,conteudo:r.focus_content||"",componente:r.evidence?.by_content.find(c=>c.label===r.focus_content)?.subject||"",
  publico:"menor_aproveitamento",nivel:r.suggested_complexity||"consolidacao",sugerido:r.suggested_complexity,analysisId:r.analysis?.id})}
async function aiHealth(){try{const r=await fetch(AGENT_URL+"/api/health");const j=await r.json();
 toast(!j.supabase_configured?"Serviço de IA no ar, mas sem Supabase configurado.":!j.ai_configured?"Serviço de IA no ar, mas sem chave da API configurada.":`Serviço de IA pronto (${j.model}).`)}
 catch(e){toast(`O serviço de IA não respondeu em ${AGENT_URL}.`)}}

/* ===== navegação, render e eventos ===== */
const NAV=[["dashboard","Dashboard","▦"],["turmas","Turmas","⌂"],["alunos","Alunos","☺"],["avaliacoes","Avaliações","✔"],["analise","Análise pedagógica","◎"],["atividades","Atividades","✎"],["planejamentos","Planejamento pedagógico","☷"],["historico","Histórico","↺"],["configuracoes","Configurações","⚙"]];
let view="dashboard";
function render(){const v=NAV.some(n=>n[0]===view)?view:"dashboard";
 $("nav").innerHTML=NAV.map(([k,l,i])=>`<button class="${k===v?"on":""}" data-act="go:${k}"><span>${i}</span><span>${l}</span></button>`).join("")+`<a class="portal-link" href="portal.html?entrar=professor"><span>⇄</span><span>Sala de aula: chamada e atividades</span></a>`;
 $("nb").textContent=notifs().length||"";$("escola").textContent=DB.turmas[0]?.escola||window.educamenteSync?.state?.schoolName||"Escola";
 const professor=window.educamenteSync?.state?.teacher?.name||"Professor";
 if($("profileName"))$("profileName").textContent=professor;
 if($("avatarInitial"))$("avatarInitial").textContent=(professor.trim()[0]||"P").toUpperCase();
 const cloud=window.educamenteSync?.state?.authenticated,sb=$("sessionBtn");
 if(sb){sb.textContent=cloud?"Sair":"Entrar";sb.title=cloud?"Sair da conta":"Entrar com uma conta"}
 $("main").innerHTML=v==="dashboard"?dash():v==="historico"?histView():v==="configuracoes"?cfgView():v==="analise"?anView():listView(v)}
/* ===== sessão: sair (nuvem) ou voltar ao login (modo sem conta) ===== */
async function logout(force){const sync=window.educamenteSync,client=window.educamenteSupabase?.client;
 if(sync?.state?.authenticated&&client){
  $("sessionBtn").disabled=true;await sync.flush();$("sessionBtn").disabled=false;
  if(sync.state.dirty&&!force)return conf("Algumas alterações ainda não chegaram à nuvem. Se sair agora, elas podem se perder no próximo acesso. Sair mesmo assim?","logout2");
  try{await client.auth.signOut({scope:"local"})}catch(e){console.warn(e)}
  // Remove a cópia local dos dados da conta: em computador compartilhado, o próximo usuário não a vê.
  if(!sync.state.dirty)Repo.write({})}
 try{localStorage.removeItem(LOCAL_FLAG)}catch(e){}
 location.replace("index.html")}
const conf=(msg,act)=>openM(`<h2>Confirmação</h2><p>${msg}</p><p style="text-align:right;margin:16px 0 0"><button class="btn s" data-act="close">Cancelar</button> <button class="btn d" data-act="${act}">Confirmar</button></p>`);
const ACT={
 go:v=>{location.hash=v;document.body.classList.remove("open")},close:closeM,notif(){const n=notifs();openM(`<h2>Notificações</h2>${n.length?"<ul>"+n.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":'<p class="muted">Nenhuma pendência.</p>'}<p style="text-align:right;margin:16px 0 0"><button class="btn" data-act="close">Fechar</button></p>`)},
 logout:()=>logout(false),logout2(){closeM();logout(true)},
 menu(){document.body.classList.toggle(matchMedia("(max-width:900px)").matches?"open":"collapsed")},
 new:m=>formM(m),quick(m){location.hash=m;formM(m)},res:resM,submit,saveres:saveRes,
 // Atividades geradas com IA abrem a revisão própria (questões estruturadas, aprovação).
 view:(m,id)=>m==="atividades"&&Svc.get(m,id)?.origem==="ai"?aiPreview(id):viewM(m,id),
 edit:(m,id)=>m==="atividades"&&Svc.get(m,id)?.origem==="ai"?aiEditM(id):formM(m,id),
 aiPrint:(id,kind)=>{const d=aiDoc(id,kind);d?PR.print(d):toast("Atividade não encontrada.")},
 aiDownload:id=>{const d=aiDoc(id,"completo");if(!d)return toast("Atividade não encontrada.");PR.download(d);toast("Arquivo baixado: folha do aluno e, na página seguinte, o gabarito.")},
 anPrint:()=>{const d=anDoc();d?PR.print(d):toast("Faça uma análise antes de imprimir.")},
 anDownload:()=>{const d=anDoc();if(!d)return toast("Faça uma análise antes de baixar.");PR.download(d,"relatorio-analise-"+nm("turmas",AN.turma));toast("Relatório baixado.")},
 anRun,anHist,aiGenRun,aiHealth,aiRecheck,aiEdit:aiEditM,aiSave,aiApprove,aiRegen,aiBack:id=>aiPreview(id),
 aiGen:src=>src==="analysis"?aiGenFromAnalysis():aiGenM(),
 aiOpen:uuid=>aiPreview(lid("atividades",uuid)),
 del:(m,id)=>conf(`Excluir este registro? ${m==="turmas"?"Alunos, avaliações, atividades e planejamentos da turma também serão excluídos.":m==="alunos"||m==="avaliacoes"?"Os resultados vinculados também serão excluídos.":""}`,`del2:${m}:${id}`),
 del2(m,id){Svc.remove(m,id);closeM();render();toast("Registro excluído.")},
 demo(){if(DB.settings.demo||DB.turmas.some(t=>t.id==="demo_t1"))return toast("Os dados de demonstração já foram carregados.");demoData();render();toast("Dados fictícios carregados.")},
 cdemo:()=>conf("Remover apenas os dados fictícios de demonstração?","cdemo2"),cdemo2(){clearDemo();closeM();render();toast("Dados de demonstração removidos.")},
 call:()=>conf("Apagar TODOS os dados armazenados neste navegador?","call2"),call2(){["turmas","alunos","avaliacoes","resultados","atividades","planejamentos"].forEach(k=>DB[k]=[]);DB.settings={};DB.analisesIA=[];persist();closeM();render();toast("Todos os dados foram apagados.")}};
document.addEventListener("click",e=>{if(e.target.classList.contains("ov")){if(!GEN.busy)closeM();return}const t=e.target.closest("[data-act]");if(!t)return;const[a,...r]=t.dataset.act.split(":");ACT[a]?.(...r)});
document.addEventListener("input",e=>{const t=e.target,d=t.dataset;
 if(d.flt){const[m,k]=d.flt.split("|");(FL[m]??={})[k]=t.value;$("tbl").innerHTML=tableHtml(m)}
 else if(d.h){H[d.h]=t.value;$("htbl").innerHTML=histTbl()}
 else if(d.pt){const n=parseFloat(t.value);$("c_"+d.pt).textContent=t.value!==""&&n>=0&&n<=+d.tot?fmt(n/d.tot*100):t.value===""?"—":"inválido"}});
document.addEventListener("change",e=>{const t=e.target;
 if(t.dataset.an){AN[t.dataset.an]=t.value;if(t.dataset.an==="turma"){AN.avaliacao="";AN.conteudo="";AN.history=null;AN.result=null;AN.error=null}render();return}
 if(t.dataset.gen==="turma"){readGen();Object.assign(GEN,{turmaId:t.value,conteudo:undefined,componente:"",alunos:[],sugerido:undefined,analysisId:undefined});openM(genFormHtml());return}
 if(t.dataset.gen==="publico"){$("g_alb").hidden=t.value!=="estudantes_selecionados";return}
 if(t.dataset.qs){const a=Svc.get("atividades",t.dataset.qs);a.status=t.value;persist();render();toast("Status atualizado.")}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!GEN.busy)closeM()});
function route(){view=location.hash.slice(1)||"dashboard";render()}
addEventListener("hashchange",route);route();

})();
