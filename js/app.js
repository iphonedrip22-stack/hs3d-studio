/* Estúdio HS3D — painel de aprovação v2. Só lê/registra no Supabase; NUNCA posta nada nas redes. */
(function(){
"use strict";
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ST={aguardando:"Aguardando aprovação",aprovado:"Aprovado",reprovado:"Reprovado",postado:"Postado"};
const CANAL={curioso:"O Curioso",zeca:"Missão Zeca"};
const PLAT={instagram:"Instagram",tiktok:"TikTok",youtube:"YouTube"};
const ETAPAS=[["roteiro","Roteiro"],["edicao","Edição"],["avaliador","Avaliador"],["aguardando","Você"],["aprovado","Aprovado"],["agendado","Agenda"],["postado","Postado"]];
const ETIQ={roteiro:"Roteiro",edicao:"Edição",avaliador:"No Avaliador",aguardando:"Aguardando você",aprovado:"Aprovado",agendado:"Agendado",postado:"Postado"};
const DEC={aprovado:"Aprovado",reprovado:"Reprovado",ajuste:"Ajuste pedido"};
const FMT_ST=[["novo","Novo"],["em_criacao","Em criação"],["piloto","Piloto"],["aprovado","Aprovado"]];
const cfg=window.HS3D_CONFIG||{};
const TZ="America/Sao_Paulo", OFF="-03:00"; // Brasil sem horário de verão desde 2019
const fmtData=d=>d?new Date(d).toLocaleString("pt-BR",{timeZone:TZ,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
const fmtHora=d=>d?new Date(d).toLocaleTimeString("pt-BR",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}):"";
const hojeSP=()=>new Date().toLocaleDateString("en-CA",{timeZone:TZ});
const diaSP=d=>d?new Date(d).toLocaleDateString("en-CA",{timeZone:TZ}):"";
const paraInput=iso=>{ if(!iso) return ""; const d=new Date(iso); return diaSP(d)+"T"+d.toLocaleTimeString("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}); };
const deInput=v=>v?new Date(v+":00"+OFF).toISOString():null;
const slug=t=>String(t||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40);
const reduz=matchMedia("(prefers-reduced-motion: reduce)");

function bootErr(msg){const el=$("#boot-error");el.hidden=false;el.textContent=msg;}
if(!window.supabase||!cfg.supabaseUrl){bootErr("Não carreguei a biblioteca do Supabase. Recarregue a página.");return;}
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"hs3d-studio-auth"}});

let videos=[],decisoes=[],agenda=[],metas=[],metasKv=null,canal="curioso",selId={curioso:null,zeca:null};
let semTabelas=false, v2=null, carregouUmaVez=false, telaAtual="fila";
const urlCache={};
const faltaTabela=e=>e&&/does not exist|schema cache|not find|PGRST205|42P01/i.test(e.message||"");

/* ---------- feedback ---------- */
let toastT;
function toast(t,erro){const el=$("#toast");el.textContent=t;el.className="toast on"+(erro?" erro":"");clearTimeout(toastT);toastT=setTimeout(()=>el.className="toast"+(erro?" erro":""),3200);}
function pulso(btn){btn.classList.remove("ok-pulso");void btn.offsetWidth;btn.classList.add("ok-pulso");}
function stagger(root){ if(!root) return; Array.from(root.children).forEach((c,i)=>{c.style.setProperty("--i",Math.min(i,12));c.classList.add("entra");}); }

/* ---------- login ---------- */
function mostrarLogin(){ $("#app").hidden=true; $("#tela-login").classList.add("on"); }
function mostrarApp(session){
  $("#tela-login").classList.remove("on"); $("#app").hidden=false;
  $("#quem").textContent=session?.user?.email||"";
  carregarTudo();
}
$("#fLogin").addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("#email").value.trim(), senha=$("#senha").value;
  const msg=$("#loginMsg"); msg.className="aviso";
  if(!email||!senha){msg.textContent="Preencha e-mail e senha.";return;}
  $("#btnEntrar").disabled=true; $("#btnEntrar").classList.add("carregando"); msg.textContent="Entrando…";
  const {error}=await sb.auth.signInWithPassword({email,password:senha});
  $("#btnEntrar").disabled=false; $("#btnEntrar").classList.remove("carregando");
  if(error){msg.className="aviso erro";msg.textContent=/invalid/i.test(error.message)?"E-mail ou senha incorretos.":"Não consegui entrar: "+error.message;}
  else {msg.textContent="";$("#senha").value="";}
});
$("#btnSair").addEventListener("click",()=>sb.auth.signOut());
let sessaoVista=false;
sb.auth.onAuthStateChange((_ev,session)=>{ if(session){ if(!sessaoVista){sessaoVista=true;mostrarApp(session);} } else {sessaoVista=false;mostrarLogin();} });
sb.auth.getSession().then(({data})=>{ if(data.session){ if(!sessaoVista){sessaoVista=true;mostrarApp(data.session);} } else mostrarLogin(); })
  .catch(()=>mostrarLogin());

/* ---------- navegação ---------- */
function ir(t){
  telaAtual=t;
  $$(".tela").forEach(s=>{ if(s.id!=="tela-login") s.classList.toggle("on",s.id==="tela-"+t); });
  $$(".abas [data-ir]").forEach(b=>b.setAttribute("aria-current",b.dataset.ir===t));
  const ab=document.querySelector(`.abas [data-ir="${t}"]`); if(ab&&ab.scrollIntoView) ab.scrollIntoView({block:"nearest",inline:"nearest",behavior:reduz.matches?"auto":"smooth"});
  if(t!=="fila"){const v=$("#video"); if(!v.paused) v.pause();}
  scrollTo({top:0,behavior:reduz.matches?"auto":"smooth"});
  if(t==="metas") renderMetas(); if(t==="diario") carregarDiario(); if(t==="novo") carregarPedidos(); if(t==="hoje") renderHoje(); if(t==="numeros") carregarNumeros();
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-ir],[data-canal],[data-vid]"); if(!b) return;
  if(b.dataset.ir) return ir(b.dataset.ir);
  if(b.dataset.canal){ if(b.dataset.canal===canal) return; canal=b.dataset.canal; $("#fila").classList.remove("troca"); void $("#fila").offsetWidth; $("#fila").classList.add("troca"); }
  else { if(selId[canal]===b.dataset.vid) return; selId[canal]=b.dataset.vid; }
  $("#coment").value=""; aviso(""); renderFila();
});

/* ---------- dados ---------- */
let carregando=false;
async function carregarTudo(){
  if(carregando) return; carregando=true;
  try{
    const r=await sb.from("hs3d_videos").select("*").order("produced_at",{ascending:false,nullsFirst:true});
    if(r.error){ semTabelas=faltaTabela(r.error); videos=[];
      $("#vazio").hidden=false;
      $("#vazio").textContent=semTabelas?"As tabelas do painel ainda não foram criadas no Supabase (falta colar o schema.sql no SQL Editor).":"Erro ao carregar a fila: "+r.error.message; }
    else { semTabelas=false; videos=r.data||[]; }
    const [d,a,m,k]=await Promise.all([
      sb.from("hs3d_decisions").select("*").order("created_at",{ascending:false}).limit(200),
      sb.from("hs3d_schedule").select("*").order("scheduled_at",{ascending:true}).limit(500),
      sb.from("hs3d_metas").select("*").order("ordem",{ascending:true}).order("created_at",{ascending:true}),
      sb.from("hs3d_kv").select("*").eq("key","metas").maybeSingle()]);
    decisoes=d.error?[]:(d.data||[]);
    v2=!(faltaTabela(a.error)||faltaTabela(m.error));
    agenda=a.error?[]:(a.data||[]);
    metas=m.error?[]:(m.data||[]);
    metasKv=k.error?null:k.data;
    $("#faixaV2").hidden=v2||semTabelas;
    $("#faixaV2").textContent="Falta rodar o migration_v2.sql no Supabase (projeto hs3d › SQL Editor). Até lá: metas, agenda e “Criar do zero” ficam só para leitura.";
  } finally { carregando=false; carregouUmaVez=true; $("#skFila").hidden=true; }
  renderFila();
  if(telaAtual==="hoje") renderHoje();
}
async function assinar(path){
  const c=urlCache[path]; if(c&&c.exp>Date.now()) return c.url;
  const {data}=await sb.storage.from(cfg.bucket).createSignedUrl(path,3600);
  if(data?.signedUrl) urlCache[path]={url:data.signedUrl,exp:Date.now()+50*60*1000};
  return data?.signedUrl||null;
}
async function urlPrevia(v){
  if(!v.preview_path) return null;
  const u=await assinar(v.preview_path);
  return u||((v.preview_url&&(!v.preview_url_expires||new Date(v.preview_url_expires)>new Date()))?v.preview_url:null);
}
const urlPoster=v=>v.preview_path?assinar(v.preview_path.replace(/\.mp4$/,".jpg")):Promise.resolve(null);

/* ---------- etapa da esteira ---------- */
const agendaDe=id=>agenda.filter(s=>s.video_id===id);
function etapa(v){
  let e=v.stage;
  if(v.status==="postado") return "postado";
  const ult=decisoes.find(d=>d.video_id===v.id);
  if(ult&&(ult.decision==="ajuste"||ult.decision==="reprovado")&&(!v.produced_at||new Date(ult.created_at)>new Date(v.produced_at))) return "edicao";
  if(!e){
    if(v.status==="aprovado") e="aprovado";
    else if(v.status==="reprovado") e="edicao";
    else if(!v.preview_path) e="edicao";
    else e=(v.avaliador_md||"").trim()?"aguardando":"avaliador";
  }
  if(e==="aprovado"&&agendaDe(v.id).length) e="agendado";
  return e;
}
function stepperHTML(v){
  const e=etapa(v), i=Math.max(0,ETAPAS.findIndex(x=>x[0]===e));
  const volta=v.status==="reprovado";
  return `<li class="trilho" aria-hidden="true"><span style="--p:${i/(ETAPAS.length-1)}"></span></li>`+
    ETAPAS.map(([k,n],j)=>`<li class="${j<i?"feito":j===i?"atual"+(volta?" volta":""):""}"${j===i?' aria-current="step"':""}><i></i><span>${n}</span></li>`).join("");
}
function trilhaHTML(p){
  if(!p) return "<span class='nota'>Caminho ainda não informado</span>";
  const t=p.replace(/^~\/Maestri\/HS3D\/?/,"").replace(/^kit\/(videos\/)?/,"").split("/").filter(x=>x&&x!=="out");
  const arq=/\.\w{2,4}$/.test(t[t.length-1]||"")?t.pop():null;
  return t.map(x=>`<span class="pasta">${esc(x)}</span>`).join('<span class="sep">›</span>')+(arq?`<span class="arq">${esc(arq)}</span>`:"");
}

/* ---------- fila ---------- */
const aviso=(t,erro)=>{const a=$("#aviso");a.textContent=t;a.className="aviso"+(erro?" erro":"");};
const dur=s=>{s=Math.round(+s||0);return s?Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):"";};
let ultimoVideo=null, ultimoAgenda=null;
async function renderFila(){
  for(const k of ["curioso","zeca"]){
    const n=videos.filter(v=>v.channel===k&&v.status==="aguardando"&&v.preview_path&&etapa(v)==="aguardando").length;
    $("#n-"+k).textContent=n?n+" aguardando você":(videos.some(v=>v.channel===k)?"nada aguardando":"sem vídeos ainda");
  }
  $$("[data-canal]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.canal===canal));
  const its=videos.filter(v=>v.channel===canal);  // canais nunca se misturam
  $("#fila").hidden=!its.length;
  if(!semTabelas){ $("#vazio").hidden=!!its.length; if(!its.length) $("#vazio").textContent="Nenhum vídeo de "+CANAL[canal]+" saiu da esteira ainda."; }
  if(!its.length) return;
  if(!its.find(v=>v.id===selId[canal])) selId[canal]=(its.find(v=>v.status==="aguardando"&&v.preview_path)||its.find(v=>v.preview_path)||its[0]).id;
  const it=its.find(v=>v.id===selId[canal]);
  const novaLista=$("#lista").dataset.k!==canal+its.length;
  $("#lista").innerHTML=its.map(v=>{const e=etapa(v), ag=agendaDe(v.id);
    return `<li><button class="item" data-vid="${esc(v.id)}" aria-pressed="${v.id===it.id}">
    <span class="mini" data-poster="${esc(v.id)}"></span>
    <span class="t">${esc(v.title)}</span>
    <span class="m">${esc(v.episode||"")} <span>${dur(v.duration_s)}</span> <span class="et ${e}">${esc(ETIQ[e]||e)}</span>${ag.length?`<span class="qd">⏱ ${esc(fmtData(ag[0].scheduled_at))}</span>`:""}</span></button></li>`;}).join("");
  $("#lista").dataset.k=canal+its.length; if(novaLista) stagger($("#lista"));
  its.forEach(async v=>{const u=await urlPoster(v); const el=document.querySelector(`[data-poster="${CSS.escape(v.id)}"]`); if(u&&el) el.style.backgroundImage=`url("${u}")`;});
  $("#pTitulo").textContent=it.title; $("#pMeta").textContent=[it.episode,dur(it.duration_s)].filter(Boolean).join(", ");
  $("#dTitulo").textContent=it.title+(it.episode?", "+it.episode:"");
  if(it.preview_path&&etapa(it)==="edicao"&&it.status!=="reprovado"){ $("#dStatus").textContent="Em ajuste"; $("#dStatus").className="st aguardando"; }
  else if(it.preview_path){ $("#dStatus").textContent=ST[it.status]||it.status; $("#dStatus").className="st "+it.status; }
  else { $("#dStatus").textContent="Em produção"; $("#dStatus").className="st aguardando"; }
  const stp=$("#stepper"), sh=stepperHTML(it);
  if(stp.dataset.h!==sh){ stp.dataset.h=sh; stp.classList.remove("vivo"); stp.innerHTML=sh; void stp.offsetWidth; requestAnimationFrame(()=>stp.classList.add("vivo")); }
  $("#etapaNota").hidden=!it.stage_note; $("#etapaNota").textContent=it.stage_note||"";
  $("#onde").hidden=false; $("#trilha").innerHTML=trilhaHTML(it.mac_path); $("#copiarCaminho").hidden=!it.mac_path;
  const rel=$("#rel");
  if(it.avaliador_md&&it.avaliador_md.trim()){rel.textContent=it.avaliador_md.trim();rel.className="rel";}
  else {rel.textContent="O Avaliador ainda não salvou o parecer deste vídeo em AVALIADOR.md.";rel.className="rel sem";}
  $("#notasBox").hidden=!it.notes_md; $("#notas").textContent=it.notes_md||"";
  const fim=it.status==="postado"||!it.preview_path;
  $("#aprovar").disabled=$("#reprovar").disabled=$("#pedirAjuste").disabled=fim;
  $("#aprovar").disabled=fim||it.status==="aprovado";
  $("#aprovar").textContent=it.status==="aprovado"?"Aprovado ✓":"Aprovar";
  const hs=decisoes.filter(d=>d.video_id===it.id);
  $("#hist").innerHTML=hs.length?hs.map(d=>`<div class="${d.decision}"><b>${DEC[d.decision]||esc(d.decision)}</b> · ${esc(fmtData(d.created_at))} (Brasília)${d.decided_by?" · "+esc(d.decided_by):""}${d.comment?"<br>"+esc(d.comment):""}${d.synced_at?"<br>✓ entregue ao Hermes":"<br>… aguardando o Mac sincronizar"}</div>`).join(""):"";
  renderAgenda(it);
  abrirAgenda(it.status==="aprovado"||it.status==="postado", ultimoVideo!==it.id);
  if(ultimoVideo!==it.id) fecharComent(true);
  // vídeo
  const vEl=$("#video"), pl=$("#player");
  if(ultimoVideo!==it.id){
    ultimoVideo=it.id; pl.classList.remove("tocando","acende"); void pl.offsetWidth; pl.classList.add("acende");
    vEl.removeAttribute("src"); vEl.load();
    const sem=!it.preview_path; $("#semVideo").hidden=!sem; vEl.hidden=sem;
    if(sem){ const e=etapa(it); $("#semVideoT").textContent=e==="roteiro"?"Em roteiro":"Em edição"; $("#semVideoS").textContent="O vídeo aparece aqui assim que o Editor renderizar."; $("#dica").textContent="Ainda não há prévia."; return; }
    $("#dica").textContent="Carregando prévia…";
    const [u,p]=await Promise.all([urlPrevia(it),urlPoster(it)]);
    if(ultimoVideo!==it.id) return;
    if(p) vEl.poster=p; else vEl.removeAttribute("poster");
    if(u){vEl.src=u;$("#dica").textContent="Prévia 540p de "+CANAL[it.channel]+(it.size_mb?" ("+(+it.size_mb).toFixed(1)+" MB)":"")+". O master fica no Mac.";}
    else $("#dica").textContent="A prévia ainda não subiu. O Mac envia em até 2 minutos.";
  }
}
$("#video").addEventListener("play",()=>$("#player").classList.add("tocando"));
$("#video").addEventListener("pause",()=>$("#player").classList.remove("tocando"));
$("#copiarCaminho").addEventListener("click",async e=>{
  const it=videos.find(v=>v.id===selId[canal]); if(!it?.mac_path) return;
  try{ await navigator.clipboard.writeText(it.mac_path); pulso(e.currentTarget); toast("Caminho copiado: "+it.mac_path); }
  catch{ toast(it.mac_path); }
});

/* ---------- agenda (o painel só registra; quem posta é o Hermes com "pode postar") ---------- */
function metasDoCanal(ch){ return metas.filter(m=>m.ativo!==false&&m.canal===ch); }
function platsDoCanal(ch){ const s=new Set(); metasDoCanal(ch).forEach(m=>(m.plataformas||[]).forEach(p=>s.add(p))); return s.size?[...s]:Object.keys(PLAT); }
function renderAgenda(it){
  const box=$("#agendaBox"), ag=agendaDe(it.id);
  const pode=v2&&it.status==="aprovado";
  const chave=it.id+"|"+JSON.stringify(ag.map(s=>[s.platform,s.scheduled_at,s.synced_at]))+"|"+v2+"|"+it.status;
  if(chave===ultimoAgenda) return; ultimoAgenda=chave;
  const plats=[...new Set([...platsDoCanal(it.channel),...ag.map(s=>s.platform)])];
  $("#plats").innerHTML=plats.map(p=>{const s=ag.find(x=>x.platform===p);
    return `<label class="plat ${s?"marcada":""}"><span class="pn">${PLAT[p]||esc(p)}</span>
      <input type="datetime-local" data-plat="${p}" value="${esc(paraInput(s?.scheduled_at))}" ${pode?"":"disabled"} step="300">
      <span class="ps">${s?(s.synced_at?"✓ no AGENDA.md":"… indo pro Mac"):"sem horário"}</span></label>`;}).join("");
  stagger($("#plats"));
  $("#sugerir").disabled=$("#salvarAgenda").disabled=!pode;
  $("#agendaDica").textContent=!v2?"Agenda liga depois do migration_v2.sql.":it.status==="postado"?"Já postado.":
    it.status!=="aprovado"?"Aprove o vídeo para definir o horário de postagem.":
    "Horário de Brasília. O Hermes lê o AGENDA.md e só posta com o seu “pode postar”.";
  $("#agendaMsg").textContent="";
}
function proximoHorario(ch, videoId){
  const hs=[...new Set(metasDoCanal(ch).flatMap(m=>m.horarios||[]))].sort();
  if(!hs.length) return null;
  const ocupados=new Set(agenda.filter(s=>s.channel===ch&&s.video_id!==videoId).map(s=>paraInput(s.scheduled_at)));
  const agora=Date.now()+10*60*1000;
  for(let d=0;d<14;d++){
    const dia=new Date(Date.now()+d*864e5).toLocaleDateString("en-CA",{timeZone:TZ});
    for(const h of hs){const v=dia+"T"+h; if(new Date(v+":00"+OFF).getTime()>agora&&!ocupados.has(v)) return v;}
  }
  return null;
}
$("#sugerir").addEventListener("click",e=>{
  const it=videos.find(v=>v.id===selId[canal]); if(!it) return;
  const v=proximoHorario(it.channel,it.id);
  if(!v){toast("Defina os horários na aba Metas primeiro.",true);return;}
  $$("#plats input[data-plat]").forEach(i=>{i.value=v;i.closest(".plat").classList.add("brilha");});
  pulso(e.currentTarget); $("#agendaMsg").className="aviso"; $("#agendaMsg").textContent="Sugestão: "+v.replace("T"," às ")+". Toque em Salvar horários para confirmar.";
});
$("#salvarAgenda").addEventListener("click",async e=>{
  const it=videos.find(v=>v.id===selId[canal]); if(!it) return;
  const btn=e.currentTarget, msg=$("#agendaMsg"); msg.className="aviso";
  const ins=$$("#plats input[data-plat]"), ag=agendaDe(it.id);
  const up=ins.filter(i=>i.value).map(i=>({video_id:it.id,channel:it.channel,platform:i.dataset.plat,scheduled_at:deInput(i.value)}));
  const del=ag.filter(s=>!ins.find(i=>i.dataset.plat===s.platform&&i.value)).map(s=>s.id);
  btn.disabled=true; btn.classList.add("carregando");
  let erro=null;
  if(up.length){const r=await sb.from("hs3d_schedule").upsert(up,{onConflict:"video_id,platform"}); erro=r.error;}
  if(!erro&&del.length){const r=await sb.from("hs3d_schedule").delete().in("id",del); erro=r.error;}
  btn.disabled=false; btn.classList.remove("carregando");
  if(erro){msg.className="aviso erro";msg.textContent="Não consegui salvar: "+erro.message;return;}
  pulso(btn); toast(up.length?"Horários salvos. O Mac leva pro AGENDA.md em até 2 min.":"Horários removidos.");
  ultimoAgenda=null; await carregarTudo();
});

/* ---------- decisão: Aprovar | Pedir ajuste | Reprovar ---------- */
function recolhe(el,abrir,instant){
  if(instant){el.classList.add("instant");requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.remove("instant")));}
  el.classList.toggle("aberto",abrir); el.firstElementChild.inert=!abrir;
}
let agendaAberta=null;
function abrirAgenda(abrir,instant){
  const w=$("#agendaWrap"), mudou=agendaAberta!==abrir;
  recolhe(w,abrir,instant||agendaAberta===null); agendaAberta=abrir;
  $("#agendaFechada").hidden=abrir;
  if(abrir&&mudou&&!instant) setTimeout(()=>w.scrollIntoView({behavior:reduz.matches?"auto":"smooth",block:"nearest"}),reduz.matches?0:260);
}
let modoComent=null;
function abrirComent(m){
  if(modoComent===m){fecharComent();return;}
  modoComent=m; const aj=m==="ajuste";
  $("#comentRot").textContent=aj?"O que mudar na edição?":"Por que reprovar? (obrigatório)";
  $("#coment").placeholder=aj?"Ex.: legenda maior no 0:10, trocar a música do final, cortar a pausa no começo":"O que está errado e precisa refazer?";
  $("#enviarComent").textContent=aj?"Enviar ajuste":"Enviar reprovação";
  $("#enviarComent").classList.toggle("nao",!aj);
  $("#comentNota").textContent=aj?"Vai pro Hermes → Editor → Avaliador → volta pra sua fila.":"Volta pro Editor com o seu comentário.";
  $("#pedirAjuste").setAttribute("aria-expanded",aj); $("#reprovar").setAttribute("aria-expanded",!aj);
  $("#pedirAjuste").classList.toggle("ativo",aj); $("#reprovar").classList.toggle("ativo",!aj);
  recolhe($("#ajusteBox"),true);
  setTimeout(()=>$("#coment").focus({preventScroll:true}),reduz.matches?0:200);
}
function fecharComent(instant){
  modoComent=null; recolhe($("#ajusteBox"),false,instant);
  ["#pedirAjuste","#reprovar"].forEach(x=>{$(x).setAttribute("aria-expanded","false");$(x).classList.remove("ativo");});
}
async function decidir(decisao,btn){
  const it=videos.find(v=>v.id===selId[canal]); if(!it) return;
  const c=$("#coment").value.trim();
  if(decisao!=="aprovado"&&!c){aviso(decisao==="ajuste"?"Escreva o que mudar na edição.":"Escreva o que precisa mudar antes de reprovar.",true);$("#coment").focus();$("#coment").classList.remove("treme");void $("#coment").offsetWidth;$("#coment").classList.add("treme");return;}
  const bs=["#aprovar","#reprovar","#pedirAjuste","#enviarComent"].map(x=>$(x));
  bs.forEach(b=>b.disabled=true); btn.classList.add("carregando"); aviso("Registrando…");
  const {error}=await sb.from("hs3d_decisions").insert({video_id:it.id,channel:it.channel,decision:decisao,comment:decisao==="aprovado"?null:c});
  btn.classList.remove("carregando");
  if(error){
    const semV3=decisao==="ajuste"&&/check constraint|violates|decision/i.test(error.message);
    aviso(semV3?"“Pedir ajuste” liga depois do migration_v3.sql no Supabase (projeto hs3d › SQL Editor).":"Não consegui registrar: "+error.message,true);
    bs.forEach(b=>b.disabled=false); return;}
  $("#coment").value=""; pulso(btn); if(decisao!=="aprovado") fecharComent();
  await carregarTudo();
  aviso(decisao==="aprovado"?"Aprovado. Defina abaixo quando posta. O Hermes recebe no Mac em até 2 minutos."
    :decisao==="ajuste"?"Ajuste pedido. O Hermes manda pro Editor, depois o Avaliador confere e o vídeo volta pra sua fila."
    :"Reprovado com comentário. O Hermes devolve para ajuste.");
}
$("#aprovar").addEventListener("click",e=>decidir("aprovado",e.currentTarget));
$("#pedirAjuste").addEventListener("click",()=>abrirComent("ajuste"));
$("#reprovar").addEventListener("click",()=>abrirComent("reprovado"));
$("#cancelarComent").addEventListener("click",()=>{$("#coment").value="";aviso("");fecharComent();});
$("#enviarComent").addEventListener("click",e=>{ if(modoComent) decidir(modoComent,e.currentTarget); });

/* ---------- hoje ---------- */
function canaisComMeta(){
  const m=new Map();
  metas.filter(x=>x.ativo!==false).forEach(x=>{ if(!m.has(x.canal)) m.set(x.canal,{nome:x.canal_nome||CANAL[x.canal]||x.canal,metas:[]}); m.get(x.canal).metas.push(x); });
  ["curioso","zeca"].forEach(k=>{ if(!m.has(k)) m.set(k,{nome:CANAL[k],metas:[]}); });
  return m;
}
function minutos(h){const [a,b]=h.split(":").map(Number);return a*60+(b||0);}
function renderHoje(){
  const box=$("#hoje"), hoje=hojeSP();
  const agoraSP=new Date().toLocaleTimeString("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}), agoraMin=minutos(agoraSP);
  $("#hojeTitulo").textContent="Hoje, "+new Date().toLocaleDateString("pt-BR",{timeZone:TZ,weekday:"long",day:"2-digit",month:"2-digit"});
  if(!carregouUmaVez){box.innerHTML=skel(3);return;}
  if(!v2){
    const rows=metasKv?.value?.rows||[];
    box.innerHTML=`<p class="faixa local">A linha do tempo usa a agenda, que liga depois do migration_v2.sql. Metas atuais (do METAS.md):</p>`+
      rows.map(r=>`<div class="dia-canal"><h2>${esc(r.canal)}</h2><p class="nota">${esc(r.formato)} · ${esc(r.por_dia)} por dia · ${esc(r.horarios)}</p></div>`).join("");
    stagger(box); return;
  }
  const html=[...canaisComMeta()].map(([k,c])=>{
    const ehCanalVideo=k in CANAL;
    const hs=[...new Set(c.metas.flatMap(m=>m.horarios||[]))].sort();
    const meta=c.metas.reduce((s,m)=>s+(+m.por_dia||0),0);
    const ag=agenda.filter(s=>s.channel===k&&diaSP(s.scheduled_at)===hoje);
    const porHora={}; ag.forEach(s=>{const h=fmtHora(s.scheduled_at);(porHora[h]=porHora[h]||[]).push(s);});
    const usados=new Set();
    const slots=hs.map(h=>{ // casa agendamento com o horário da meta (até 90 min de diferença)
      const prox=Object.keys(porHora).filter(x=>!usados.has(x)&&Math.abs(minutos(x)-minutos(h))<=90).sort((a,b)=>Math.abs(minutos(a)-minutos(h))-Math.abs(minutos(b)-minutos(h)))[0];
      if(prox) usados.add(prox);
      return {h,its:prox?porHora[prox]:[],meta:true};
    });
    Object.keys(porHora).filter(x=>!usados.has(x)).forEach(h=>slots.push({h,its:porHora[h],meta:false}));
    slots.sort((a,b)=>minutos(a.h)-minutos(b.h));
    const vids=new Set(ag.map(s=>s.video_id));
    const produzidos=videos.filter(v=>v.channel===k&&diaSP(v.produced_at)===hoje).length;
    const marcas=slots.map(s=>`<i class="${s.its.length?"cheio":"vago"}" style="--x:${minutos(s.h)/1440}" title="${esc(s.h)}"></i>`).join("");
    const linhas=slots.map(s=>{
      const passou=minutos(s.h)<agoraMin;
      const v=s.its.length?videos.find(x=>x.id===s.its[0].video_id):null;
      const pl=s.its.map(x=>PLAT[x.platform]||x.platform).join(" · ");
      return `<li class="slot2 ${s.its.length?"cheio":"vago"} ${passou?"passou":""}">
        <b class="hh">${esc(s.h)}</b><span class="pt"></span>
        <span class="tx">${v?`<strong>${esc(v.title)}</strong><small>${esc(pl)}${s.meta?"":" · fora dos horários da meta"}${v.status==="postado"?" · postado":""}</small>`
          :`<strong>Vago</strong><small>${passou?"horário já passou sem vídeo agendado":"nenhum vídeo agendado ainda"}</small>`}</span></li>`;}).join("");
    return `<div class="dia-canal ${k}">
      <div class="dc-topo"><h2>${esc(c.nome)}</h2>
        <span class="placar"><b>${vids.size}</b>/${meta||"–"} <small>agendados hoje</small></span>
        ${ehCanalVideo?`<span class="placar"><b>${produzidos}</b> <small>produzidos hoje</small></span>`:""}</div>
      <div class="regua" aria-hidden="true"><span class="agora" style="--x:${agoraMin/1440}"></span>${marcas}<em style="--x:0">0h</em><em style="--x:.25">6h</em><em style="--x:.5">12h</em><em style="--x:.75">18h</em></div>
      ${slots.length?`<ol class="slots2">${linhas}</ol>`:`<p class="nota">Sem horários na meta. <button class="link" data-ir="metas">Definir na aba Metas</button></p>`}
      ${(meta&&vids.size<meta)?`<p class="falta">Faltam ${meta-vids.size} vídeo(s) agendado(s) para bater a meta de hoje.</p>`:""}
    </div>`;
  }).join("");
  box.innerHTML=html; stagger(box);
  $$("#hoje .regua").forEach(r=>requestAnimationFrame(()=>r.classList.add("vivo")));
}
const skel=n=>Array.from({length:n},()=>`<div class="sk sk-bloco"></div>`).join("");

/* ---------- metas (editáveis) ---------- */
let metasRascunho=null;
function renderMetas(){
  const box=$("#metas");
  if(!carregouUmaVez){box.innerHTML=skel(2);setTimeout(renderMetas,600);return;}
  $("#novaMeta").hidden=!v2;
  if(!v2){
    const rows=metasKv?.value?.rows||[];
    box.innerHTML=`<p class="faixa local">Edição liga depois do migration_v2.sql. Lendo o METAS.md do Mac:</p>`+(rows.length?rows.map(r=>
      `<div class="meta-card ro"><h2>${esc(r.formato)}</h2><dl><dt>Canal</dt><dd>${esc(r.canal)}</dd><dt>Por dia</dt><dd>${esc(r.por_dia)}</dd><dt>Horários</dt><dd>${esc(r.horarios)}</dd><dt>Status</dt><dd>${esc(r.status)}</dd></dl></div>`).join(""):"<p class='nota'>Sem metas ainda.</p>");
    $("#metasSync").textContent=metasKv?.updated_at?"METAS.md sincronizado em "+fmtData(metasKv.updated_at)+" (Brasília).":"";
    stagger(box); return;
  }
  metasRascunho=metas.map(m=>({...m,horarios:[...(m.horarios||[])],plataformas:[...(m.plataformas||[])]}));
  if(!metasRascunho.length) metasRascunho.push(metaVazia());
  desenharMetas();
  const ult=metas.map(m=>m.updated_at).sort().pop();
  $("#metasSync").textContent=ult?"Última mudança em "+fmtData(ult)+" (Brasília). O Mac reescreve o METAS.md em até 2 min.":"";
}
const metaVazia=()=>({_novo:true,id:"",formato:"",canal:"curioso",canal_nome:"O Curioso",por_dia:1,horarios:["12:00"],plataformas:["instagram","tiktok","youtube"],status:"",ativo:true,ordem:(metas.length||0)});
function desenharMetas(foco){
  const box=$("#metas"), hoje=hojeSP();
  box.innerHTML=metasRascunho.map((m,i)=>{
    const outro=!(m.canal in CANAL);
    const feitos=new Set(agenda.filter(s=>s.channel===m.canal&&diaSP(s.scheduled_at)===hoje).map(s=>s.video_id)).size;
    const falta=(+m.por_dia||0)-m.horarios.length;
    return `<form class="meta-card ${m.ativo===false?"pausada":""}" data-i="${i}">
      <div class="mc-topo">
        <input class="mc-nome" data-f="formato" value="${esc(m.formato)}" placeholder="nome_do_formato" aria-label="Nome do formato" ${m._novo?"":"readonly"}>
        <label class="chave"><input type="checkbox" data-f="ativo" ${m.ativo!==false?"checked":""}><span></span><em>${m.ativo!==false?"Ativa":"Pausada"}</em></label>
      </div>
      <div class="campo"><span>Canal</span>
        <select data-f="canal"><option value="curioso" ${m.canal==="curioso"?"selected":""}>O Curioso</option><option value="zeca" ${m.canal==="zeca"?"selected":""}>Missão Zeca</option><option value="_outro" ${outro?"selected":""}>Outro canal / série</option></select>
        <input class="extra" data-f="canal_nome" value="${esc(outro?m.canal_nome:"")}" placeholder="Nome do canal novo" ${outro?"":"hidden"}></div>
      <div class="mc-linha">
        <div class="campo"><span>Vídeos por dia</span>
          <div class="contador"><button type="button" data-acao="menos" aria-label="Menos">−</button><output>${m.por_dia??"–"}</output><button type="button" data-acao="mais" aria-label="Mais">+</button></div></div>
        <div class="campo progresso-mini"><span>Hoje</span><b>${feitos}/${m.por_dia||"–"}</b><small>agendados</small></div>
      </div>
      <div class="campo"><span>Horários de postagem (Brasília)</span>
        <div class="horarios">${m.horarios.map((h,j)=>`<span class="hchip"><input type="time" data-h="${j}" value="${esc(h)}" step="300" aria-label="Horário ${j+1}"><button type="button" data-acao="tirar" data-h="${j}" aria-label="Remover horário">×</button></span>`).join("")}
          <button type="button" class="hmais" data-acao="addh">+ horário</button></div>
        ${falta>0?`<small class="dica-m">Faltam ${falta} horário(s) para ${m.por_dia} vídeos por dia.</small>`:""}</div>
      <div class="campo"><span>Plataformas</span><div class="pchips">${Object.entries(PLAT).map(([k,n])=>`<label><input type="checkbox" data-p="${k}" ${m.plataformas.includes(k)?"checked":""}><span>${n}</span></label>`).join("")}</div></div>
      <label class="campo"><span>Status / observação</span><input data-f="status" value="${esc(m.status||"")}" placeholder="Ex.: em teste (não postar sem aprovação)"></label>
      <div class="mc-acoes"><button class="btn sm" type="submit">${m._novo?"Criar meta":"Salvar"}</button><span class="aviso" role="status"></span></div>
    </form>`;}).join("");
  if(!foco) stagger(box);
  else { const fs=box.querySelectorAll(`form[data-i="${foco.i}"] ${foco.sel}`); const f=fs[fs.length-1]; if(f) f.focus({preventScroll:true}); }
}
function lerCard(f){
  const m=metasRascunho[+f.dataset.i];
  m.formato=f.querySelector('[data-f=formato]').value.trim();
  const c=f.querySelector('[data-f=canal]').value;
  if(c==="_outro"){ m.canal_nome=f.querySelector('[data-f=canal_nome]').value.trim(); m.canal=slug(m.canal_nome)||"novo"; }
  else { m.canal=c; m.canal_nome=CANAL[c]; }
  m.ativo=f.querySelector('[data-f=ativo]').checked;
  m.status=f.querySelector('[data-f=status]').value.trim();
  m.horarios=$$.call(null,`form[data-i="${f.dataset.i}"] input[type=time]`).map(i=>i.value).filter(Boolean);
  m.plataformas=Object.keys(PLAT).filter(k=>f.querySelector(`[data-p=${k}]`).checked);
  return m;
}
$("#metas").addEventListener("click",e=>{
  const b=e.target.closest("[data-acao]"); if(!b) return;
  const f=b.closest("form"), m=lerCard(f), i=+f.dataset.i;
  if(b.dataset.acao==="mais") m.por_dia=Math.min(24,(+m.por_dia||0)+1);
  if(b.dataset.acao==="menos") m.por_dia=Math.max(0,(+m.por_dia||0)-1);
  if(b.dataset.acao==="addh"){ const ult=m.horarios[m.horarios.length-1]; m.horarios.push(ult?String(Math.min(23,minutos(ult)/60+3|0)).padStart(2,"0")+":00":"12:00"); }
  if(b.dataset.acao==="tirar") m.horarios.splice(+b.dataset.h,1);
  desenharMetas({i,sel:b.dataset.acao==="addh"?"input[type=time]":b.dataset.acao==="tirar"?".hmais":`[data-acao="${b.dataset.acao}"]`});
  const card=$("#metas").querySelector(`form[data-i="${i}"]`); card.classList.add("mexeu");
  if(b.dataset.acao==="addh"){const hs=card.querySelectorAll(".hchip");hs[hs.length-1]?.classList.add("nasce");}
});
$("#metas").addEventListener("change",e=>{
  const f=e.target.closest("form"); if(!f) return;
  if(e.target.matches("[data-f=canal]")){ const x=f.querySelector("[data-f=canal_nome]"); x.hidden=e.target.value!=="_outro"; if(!x.hidden) x.focus(); }
  if(e.target.matches("[data-f=ativo]")){ f.classList.toggle("pausada",!e.target.checked); f.querySelector(".chave em").textContent=e.target.checked?"Ativa":"Pausada"; }
  f.classList.add("mexeu");
});
$("#metas").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=e.target, m=lerCard(f), msg=f.querySelector(".mc-acoes .aviso"), btn=f.querySelector("button[type=submit]");
  msg.className="aviso";
  if(!m.formato){msg.className="aviso erro";msg.textContent="Dê um nome ao formato.";return;}
  if(!m.canal_nome){msg.className="aviso erro";msg.textContent="Escreva o nome do canal novo.";return;}
  const row={id:m.id||slug(m.formato),formato:m.formato,canal:m.canal,canal_nome:m.canal_nome,por_dia:m.por_dia===""||m.por_dia==null?null:+m.por_dia,
    horarios:[...new Set(m.horarios)].sort(),plataformas:m.plataformas,status:m.status||null,ativo:m.ativo,ordem:m.ordem??+f.dataset.i};
  if(m._novo&&metas.some(x=>x.id===row.id)){msg.className="aviso erro";msg.textContent="Já existe uma meta com esse nome.";return;}
  btn.disabled=true; btn.classList.add("carregando");
  const {error}=await sb.from("hs3d_metas").upsert(row,{onConflict:"id"});
  btn.disabled=false; btn.classList.remove("carregando");
  if(error){msg.className="aviso erro";msg.textContent="Não consegui salvar: "+error.message;return;}
  pulso(btn); toast("Meta salva. O METAS.md do Mac atualiza em até 2 min.");
  await carregarTudo(); renderMetas();
});
$("#novaMeta").addEventListener("click",()=>{
  if(!metasRascunho) return;
  metasRascunho.push(metaVazia()); desenharMetas({i:metasRascunho.length-1,sel:"[data-f=formato]"});
  const c=$("#metas").lastElementChild; c.classList.add("entra"); c.scrollIntoView({behavior:reduz.matches?"auto":"smooth",block:"center"});
});

/* ---------- diário ---------- */
async function carregarDiario(){
  const ol=$("#diario"); ol.innerHTML=Array.from({length:5},()=>"<li class='sk sk-l'></li>").join("");
  const {data,error}=await sb.from("hs3d_kv").select("*").eq("key","diario").maybeSingle();
  if(error){ol.innerHTML=`<li class="aviso erro">${esc(semTabelas?"Tabelas ainda não criadas no Supabase.":error.message)}</li>`;return;}
  const ls=(data?.value?.lines||[]).slice().reverse();
  ol.innerHTML=ls.length?ls.map(l=>{const p=l.split(" · ");
    return p.length>=3?`<li><span class="h">${esc(p[0])} · ${esc(p[1])}</span>${esc(p.slice(2).join(" · "))}</li>`:`<li>${esc(l)}</li>`;}).join(""):"<li class='nota'>Nenhuma linha ainda.</li>";
  stagger(ol);
  $("#diarioSync").textContent=data?.updated_at?"Sincronizado do Maestri em "+fmtData(data.updated_at)+" (Brasília). Mais recentes primeiro.":"";
}

/* ---------- novo formato: copiar de link | criar do zero ---------- */
function modo(m){
  $$(".modo [data-modo]").forEach(b=>b.setAttribute("aria-selected",b.dataset.modo===m));
  $(".modo").dataset.ativo=m;
  $("#fLink").classList.toggle("on",m==="link"); $("#fNova").classList.toggle("on",m==="nova");
}
$$(".modo [data-modo]").forEach(b=>b.addEventListener("click",()=>modo(b.dataset.modo)));
$("#link").addEventListener("input",e=>{const v=e.target.value;
  const p=/youtu\.?be/i.test(v)?"YouTube":/tiktok/i.test(v)?"TikTok":/instagram/i.test(v)?"Instagram":v.trim()?"outro site":"";
  $("#plat").textContent=p?"Link reconhecido: "+p:"";});
document.addEventListener("change",e=>{
  if(e.target.name==="canalL") $("#canalNovoL").hidden=e.target.value!=="novo";
  if(e.target.name==="canalN") $("#canalNovoN").hidden=e.target.value!=="novo";
  if(e.target.name==="estiloN") $("#estiloOutro").hidden=e.target.value!=="outro";
});
function canalEscolhido(nome,extra){
  const v=document.querySelector(`input[name=${nome}]:checked`).value;
  if(v!=="novo") return {channel:v,channel_name:CANAL[v]};
  const n=$(extra).value.trim(); return n?{channel:slug(n)||"novo",channel_name:n}:null;
}
async function enviarPedido(row,btn,msg,form,ok){
  msg.className="aviso";
  btn.disabled=true; btn.classList.add("carregando"); msg.textContent="Enviando…";
  const {error}=await sb.from("hs3d_format_requests").insert(row);
  btn.disabled=false; btn.classList.remove("carregando");
  if(error){msg.className="aviso erro";msg.textContent="Não consegui enviar: "+error.message;return;}
  pulso(btn); msg.textContent=ok; form.reset(); $("#plat").textContent="";
  $("#canalNovoL").hidden=true; $("#estiloOutro").hidden=true; $("#canalNovoN").hidden=false;
  carregarPedidos();
}
$("#fLink").addEventListener("submit",e=>{
  e.preventDefault();
  const link=$("#link").value.trim(), msg=$("#linkMsg");
  if(!/^https?:\/\//i.test(link)){msg.className="aviso erro";msg.textContent="Cole um link começando com https://";return;}
  const c=canalEscolhido("canalL","#canalNovoL");
  if(!c){msg.className="aviso erro";msg.textContent="Escreva o nome do canal novo.";return;}
  if(!v2&&!(c.channel in CANAL)){msg.className="aviso erro";msg.textContent="Canal novo liga depois do migration_v2.sql. Por enquanto escolha O Curioso ou Missão Zeca.";return;}
  const row={link,channel:c.channel,name:$("#nomeFmt").value.trim()||null,notes:$("#notasFmt").value.trim()||null,status:"novo"};
  if(v2) Object.assign(row,{mode:"link",channel_name:c.channel_name});
  enviarPedido(row,$("#btnLink"),msg,e.target,"Pedido enviado para "+c.channel_name+". O Hermes vê em PEDIDOS_FORMATO.md no Mac. Nada é produzido nem postado automaticamente.");
});
$("#fNova").addEventListener("submit",e=>{
  e.preventDefault();
  const msg=$("#novaMsg");
  if(!v2){msg.className="aviso erro";msg.textContent="“Criar do zero” liga depois do migration_v2.sql no Supabase.";return;}
  const nome=$("#nNome").value.trim(), prem=$("#nPremissa").value.trim();
  if(!nome||!prem){msg.className="aviso erro";msg.textContent="Preencha pelo menos o nome e a premissa.";return;}
  const c=canalEscolhido("canalN","#canalNovoN");
  if(!c){msg.className="aviso erro";msg.textContent="Escreva o nome do canal ou série nova.";return;}
  const est=document.querySelector("input[name=estiloN]:checked").value;
  const refs=$("#nRefs").value.trim();
  const row={mode:"nova",name:nome,channel:c.channel,channel_name:c.channel_name,
    style:est==="outro"?($("#estiloOutro").value.trim()||"outro"):est,premise:prem,characters:$("#nPers").value.trim()||null,
    duration:$("#nDur").value.trim()||null,tone:$("#nTom").value.trim()||null,frequency:$("#nFreq").value.trim()||null,
    reference_links:refs||null,link:(refs.match(/https?:\/\/\S+/)||[null])[0],status:"novo"};
  enviarPedido(row,$("#btnNova"),msg,e.target,"História enviada para "+c.channel_name+". O Mac cria formatos/pedidos/… e o Roteirista monta a receita fora da esteira.");
});
async function carregarPedidos(){
  const ul=$("#pedidos"); if(!ul.children.length) ul.innerHTML=Array.from({length:3},()=>"<li class='sk sk-l'></li>").join("");
  const {data,error}=await sb.from("hs3d_format_requests").select("*").order("created_at",{ascending:false}).limit(30);
  if(error){ul.innerHTML=`<li class="aviso erro">${esc(semTabelas?"Tabelas ainda não criadas no Supabase.":error.message)}</li>`;return;}
  ul.innerHTML=(data||[]).length?data.map(p=>{
    const i=Math.max(0,FMT_ST.findIndex(x=>x[0]===p.status));
    const canalN=p.channel_name||CANAL[p.channel]||p.channel;
    return `<li class="ped"><div class="ped-topo"><b>${esc(p.name||"Formato sem nome")}</b><span class="tag">${p.mode==="nova"?"do zero":"de link"}</span></div>
      <span class="ped-sub">${esc(canalN)}${p.style?" · "+esc(p.style):""}${p.duration?" · "+esc(p.duration):""}${p.frequency?" · "+esc(p.frequency):""}</span>
      ${p.premise?`<p class="ped-prem">${esc(p.premise.slice(0,220))}${p.premise.length>220?"…":""}</p>`:""}
      ${p.link?`<span class="ped-link">${esc(p.link)}</span>`:""}
      <ol class="mini-steps" aria-label="Status do pedido">${FMT_ST.map(([k,n],j)=>`<li class="${j<i?"feito":j===i?"atual":""}">${n}</li>`).join("")}</ol>
      <div class="ped-rodape"><span>${esc(fmtData(p.created_at))} (Brasília)${p.synced_at?" · ✓ no Mac"+(p.slug?` (formatos/pedidos/${esc(p.slug)}.md)`:""):" · indo pro Mac"}</span>
      ${v2?`<label class="ped-st"><span class="sr">Mudar status</span><select data-ped="${esc(p.id)}">${FMT_ST.map(([k,n])=>`<option value="${k}" ${k===p.status?"selected":""}>${n}</option>`).join("")}</select></label>`:""}</div></li>`;}).join(""):"<li class='nota'>Nenhum pedido ainda.</li>";
  stagger(ul);
}
$("#pedidos").addEventListener("change",async e=>{
  const s=e.target.closest("select[data-ped]"); if(!s) return;
  s.disabled=true;
  const {error}=await sb.from("hs3d_format_requests").update({status:s.value,status_updated_at:new Date().toISOString()}).eq("id",s.dataset.ped);
  s.disabled=false;
  if(error){toast("Não consegui mudar: "+error.message,true);return;}
  toast("Status atualizado. O arquivo do pedido no Mac acompanha em até 2 min."); carregarPedidos();
});


/* ---------- números (cada canal só vê as contas dele) ---------- */
const CONTAS_PADRAO=[
  {id:"curioso:youtube",channel:"curioso",channel_name:"O Curioso",platform:"youtube",handle:"O Curioso 3D",url:"https://www.youtube.com/channel/UCXkf6fbirGpyb834eWgt3TA",auto:true,ordem:0},
  {id:"curioso:instagram",channel:"curioso",channel_name:"O Curioso",platform:"instagram",handle:"@ocurioso.3d",url:"https://www.instagram.com/ocurioso.3d/",auto:true,ordem:1},
  {id:"curioso:tiktok",channel:"curioso",channel_name:"O Curioso",platform:"tiktok",handle:"@ocurioso.3d",url:"https://www.tiktok.com/@ocurioso.3d",auto:true,ordem:2},
  {id:"zeca:youtube",channel:"zeca",channel_name:"Missão Zeca",platform:"youtube",handle:"@missaodozeca",url:"https://www.youtube.com/@missaodozeca",auto:true,ordem:10},
  {id:"zeca:instagram",channel:"zeca",channel_name:"Missão Zeca",platform:"instagram",handle:"@missaodozeca",url:"https://www.instagram.com/missaodozeca/",auto:true,ordem:11},
  {id:"zeca:tiktok",channel:"zeca",channel_name:"Missão Zeca",platform:"tiktok",handle:"@missaodozeca",url:"https://www.tiktok.com/@missaodozeca",auto:true,ordem:12}];
const SEGUIDOR={youtube:"inscritos",instagram:"seguidores",tiktok:"seguidores"};
const PERIODO={total:"total",recentes:"vídeos recentes","28d":"últimos 28 dias","7d":"últimos 7 dias"};
const CONECTAR={
  youtube:["Em breve","Para conectar de verdade (views por período, retenção) precisa criar um cliente OAuth no Google Cloud com a conta do canal (YouTube Data/Analytics API). Até lá, inscritos e views dos vídeos vêm da página pública, sozinhos."],
  instagram:["Em breve","Precisa a conta ser profissional (Criador ou Empresa), ligada a uma Página do Facebook, e um app na Meta. Até lá, seguidores e posts vêm do perfil público."],
  tiktok:["Manual por enquanto","A API do TikTok exige um app aprovado por eles. Seguidores, curtidas e vídeos vêm do perfil público quando ele responde; views de cada vídeo você informa à mão."]};
let contas=[],nums=[],numStatus={},v4=null,numCanal="curioso";
const fmtN=n=>n==null?"–":Number(n).toLocaleString("pt-BR");
async function carregarNumeros(){
  if(!$("#numCards").children.length) $("#numCards").innerHTML=skel(3);
  const [a,s,k]=await Promise.all([
    sb.from("hs3d_accounts").select("*").order("ordem",{ascending:true}),
    sb.from("hs3d_stats").select("*").order("captured_at",{ascending:false}).limit(2000),
    sb.from("hs3d_kv").select("*").eq("key","stats_status").maybeSingle()]);
  v4=!(faltaTabela(a.error)||faltaTabela(s.error));
  contas=(v4&&!a.error&&a.data?.length)?a.data:CONTAS_PADRAO;
  nums=v4&&!s.error?(s.data||[]):[];
  numStatus=k.data?.value||{};
  renderNumeros(true);
}
function canaisNumeros(){
  const m=new Map(); contas.forEach(c=>{ if(!m.has(c.channel)) m.set(c.channel,c.channel_name||CANAL[c.channel]||c.channel); });
  metas.forEach(x=>{ if(!m.has(x.canal)) m.set(x.canal,x.canal_nome||x.canal); });
  return m;
}
function ultimo(ch,pl,campo){ return nums.find(n=>n.channel===ch&&n.platform===pl&&n.scope==="conta"&&n[campo]!=null); }
function serie(ch,pl){
  const pts=nums.filter(n=>n.channel===ch&&n.platform===pl&&n.scope==="conta"&&n.followers!=null).slice().reverse();
  const porDia=new Map(); pts.forEach(n=>porDia.set(diaSP(n.captured_at),n)); return [...porDia.values()].slice(-30);
}
function spark(pts){
  if(pts.length<2) return `<div class="spark vazio">histórico aparece com o tempo</div>`;
  const vs=pts.map(p=>+p.followers), mn=Math.min(...vs), mx=Math.max(...vs), r=(mx-mn)||1;
  const xy=vs.map((v,i)=>[(i/(vs.length-1))*120,30-((v-mn)/r)*26]);
  const l=xy.map(p=>p.map(x=>x.toFixed(1)).join(",")).join(" ");
  return `<svg class="spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true"><polygon class="area" points="0,32 ${l} 120,32"/><polyline pathLength="1" points="${l}"/><circle cx="${xy[xy.length-1][0]}" cy="${xy[xy.length-1][1]}" r="2.4"/></svg>`;
}
function delta(pts){
  if(pts.length<2) return "";
  const fim=pts[pts.length-1], lim=Date.now()-7*864e5;
  const ini=pts.find(p=>new Date(p.captured_at).getTime()>=lim&&p!==fim)||pts[pts.length-2];
  const d=fim.followers-ini.followers; if(!d) return `<span class="delta">= sem mudança</span>`;
  return `<span class="delta ${d>0?"up":"down"}">${d>0?"▲ +":"▼ "}${fmtN(d)}</span>`;
}
function fonte(n){ return n?`<span class="fonte ${n.source}">${n.source==="auto"?"automático":"manual"} · ${esc(fmtData(n.captured_at))}</span>`:""; }
function renderNumeros(animar){
  const cs=canaisNumeros(); if(!cs.has(numCanal)) numCanal=cs.keys().next().value;
  $("#numCanais").innerHTML=[...cs].map(([k,n])=>`<button type="button" data-ncanal="${esc(k)}" aria-pressed="${k===numCanal}">${esc(n)}</button>`).join("");
  $("#numAviso").hidden=!!v4; $("#numAviso").textContent="Falta rodar o migration_v4.sql no Supabase (projeto hs3d › SQL Editor). Até lá, os números ficam vazios e não dá pra salvar.";
  const cards=contas.filter(c=>c.channel===numCanal);  // canais nunca se misturam
  $("#numCards").innerHTML=cards.length?cards.map(c=>{
    const pl=c.platform, f=ultimo(c.channel,pl,"followers"), v=ultimo(c.channel,pl,"views"), lk=ultimo(c.channel,pl,"likes"), ps=ultimo(c.channel,pl,"posts");
    const pts=serie(c.channel,pl), st=numStatus[c.id], cn=CONECTAR[pl];
    const novo=[f,v,lk,ps].filter(Boolean).sort((a,b)=>new Date(b.captured_at)-new Date(a.captured_at))[0];
    return `<article class="num-card ${pl}" data-acc="${esc(c.id)}">
      <header><span class="ico ${pl}" aria-hidden="true"></span><b>${PLAT[pl]}</b>${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.handle||"abrir")}</a>`:`<span>${esc(c.handle||"")}</span>`}</header>
      <div class="big"><b data-conta="${f?.followers??""}">${fmtN(f?.followers)}</b><small>${SEGUIDOR[pl]}</small>${delta(pts)}</div>
      ${spark(pts)}
      <dl class="mets">
        <div><dt>Views</dt><dd>${fmtN(v?.views)}${v?.views_period?`<small>${esc(PERIODO[v.views_period]||v.views_period)}</small>`:""}</dd></div>
        <div><dt>Curtidas</dt><dd>${fmtN(lk?.likes)}</dd></div>
        <div><dt>Posts</dt><dd>${fmtN(ps?.posts)}</dd></div>
      </dl>
      <p class="fonte-linha">${novo?fonte(novo):"<span class='fonte'>sem números ainda</span>"}${st&&!st.ok?`<span class="falhou">busca automática falhou: informe à mão</span>`:""}</p>
      <div class="num-acoes">
        <button class="mini-btn" type="button" data-nacao="informar" ${v4?"":"disabled"}>Informar números</button>
        ${c.auto!==false?`<button class="mini-btn" type="button" data-nacao="atualizar" ${v4?"":"disabled"}>Atualizar agora</button>`:""}
        <button class="mini-btn conectar" type="button" data-nacao="conectar">Conectar conta</button>
      </div>
      <div class="recolhe" data-painel="informar"><div class="recolhe-in" inert><form class="num-form" data-form="${esc(c.id)}">
        <div class="duas"><label class="campo"><span>${SEGUIDOR[pl][0].toUpperCase()+SEGUIDOR[pl].slice(1)}</span><input name="followers" type="number" inputmode="numeric" min="0"></label>
          <label class="campo"><span>Curtidas</span><input name="likes" type="number" inputmode="numeric" min="0"></label></div>
        <div class="duas"><label class="campo"><span>Views</span><input name="views" type="number" inputmode="numeric" min="0"></label>
          <label class="campo"><span>Período das views</span><select name="views_period"><option value="total">Total</option><option value="28d">Últimos 28 dias</option><option value="7d">Últimos 7 dias</option></select></label></div>
        <div class="duas"><label class="campo"><span>Posts</span><input name="posts" type="number" inputmode="numeric" min="0"></label>
          <label class="campo"><span>Observação</span><input name="note" type="text" placeholder="opcional"></label></div>
        <div class="ajuste-acoes"><span class="aviso" role="status"></span><button class="btn sm" type="submit">Salvar</button></div>
      </form></div></div>
      <div class="recolhe" data-painel="conectar"><div class="recolhe-in" inert><p class="conectar-nota"><b>${cn[0]}</b> ${cn[1]}</p></div></div>
    </article>`;}).join(""):`<p class="nota">Nenhuma conta cadastrada para este canal. Use “Adicionar conta” abaixo.</p>`;
  if(animar){ stagger($("#numCards")); requestAnimationFrame(()=>$$("#numCards .spark").forEach(s=>s.classList.add("vivo"))); contar(); }
  else $$("#numCards .spark").forEach(s=>s.classList.add("vivo","instant"));
  // vídeos do canal
  const vistos=new Map();
  nums.filter(n=>n.channel===numCanal&&n.scope==="video").forEach(n=>{const k=n.platform+"|"+(n.video_ref||n.video_title); if(!vistos.has(k)) vistos.set(k,n);});
  const vids=[...vistos.values()].sort((a,b)=>(b.views||0)-(a.views||0));
  $("#numVideos").innerHTML=vids.length?vids.map(n=>{const mx=vids[0].views||1;
    const link=n.platform==="youtube"&&n.video_ref&&!/^https?:/.test(n.video_ref)?"https://youtube.com/shorts/"+n.video_ref:(/^https?:/.test(n.video_ref||"")?n.video_ref:null);
    return `<li><span class="pl-chip ${n.platform}">${PLAT[n.platform]}</span>
      <span class="vt">${link?`<a href="${esc(link)}" target="_blank" rel="noopener">${esc(n.video_title||n.video_ref)}</a>`:esc(n.video_title||n.video_ref)}</span>
      <span class="vv"><b>${fmtN(n.views)}</b> views${n.likes!=null?` · ${fmtN(n.likes)} curt.`:""}</span>
      <span class="barra"><i style="--p:${((n.views||0)/mx).toFixed(3)}"></i></span>
      <small>${n.source==="auto"?"automático":"manual"} · ${esc(fmtData(n.captured_at))}</small></li>`;}).join(""):"<li class='nota'>Sem números de vídeos ainda.</li>";
  if(animar){ stagger($("#numVideos")); requestAnimationFrame(()=>$("#numVideos").classList.add("vivo")); }
  $("#numVidNota").textContent="Views mais recentes de cada vídeo deste canal. YouTube vem sozinho; Instagram e TikTok por vídeo você informa à mão.";
  // formulários de baixo
  $("#nvPlat").innerHTML=[...new Set(cards.map(c=>c.platform))].map(p=>`<option value="${p}">${PLAT[p]}</option>`).join("")||Object.entries(PLAT).map(([k,n])=>`<option value="${k}">${n}</option>`).join("");
  $("#ncCanal").innerHTML=[...cs].map(([k,n])=>`<option value="${esc(k)}" ${k===numCanal?"selected":""}>${esc(n)}</option>`).join("")+`<option value="_novo">+ Canal novo</option>`;
  $("#fNumVid").querySelector("button").disabled=$("#fNumConta").querySelector("button").disabled=!v4;
}
function contar(){
  if(reduz.matches) return;
  $$("#numCards .big b[data-conta]").forEach(el=>{const alvo=+el.dataset.conta; if(!alvo||alvo<10) return; const t0=performance.now();
    const passo=t=>{const k=Math.min(1,(t-t0)/700), e=1-Math.pow(1-k,3); el.textContent=fmtN(Math.round(alvo*e)); if(k<1) requestAnimationFrame(passo);}; requestAnimationFrame(passo);});
}
document.addEventListener("click",async e=>{
  const c=e.target.closest("[data-ncanal]");
  if(c){ if(c.dataset.ncanal!==numCanal){numCanal=c.dataset.ncanal; renderNumeros(true);} return; }
  const b=e.target.closest("[data-nacao]"); if(!b) return;
  const card=b.closest(".num-card"), id=card.dataset.acc, ac=b.dataset.nacao;
  if(ac==="atualizar"){
    b.disabled=true; b.classList.add("carregando");
    const {error}=await sb.from("hs3d_accounts").update({refresh_requested_at:new Date().toISOString()}).eq("id",id);
    b.disabled=false; b.classList.remove("carregando");
    if(error){toast("Não consegui pedir: "+error.message,true);return;}
    pulso(b); toast("Pedido enviado. O Mac busca os números públicos em até 2 min."); return;
  }
  const painel=card.querySelector(`[data-painel="${ac}"]`), outro=card.querySelector(`[data-painel]:not([data-painel="${ac}"])`);
  recolhe(outro,false); const abrir=!painel.classList.contains("aberto"); recolhe(painel,abrir);
  b.classList.toggle("ativo",abrir); card.querySelectorAll("[data-nacao]").forEach(x=>{if(x!==b) x.classList.remove("ativo");});
  if(abrir&&ac==="informar") setTimeout(()=>painel.querySelector("input")?.focus({preventScroll:true}),reduz.matches?0:220);
});
document.addEventListener("submit",async e=>{
  const f=e.target.closest("form[data-form]"); if(!f) return; e.preventDefault();
  const acc=contas.find(c=>c.id===f.dataset.form), msg=f.querySelector(".aviso"), btn=f.querySelector("button[type=submit]");
  const n=k=>{const v=f.elements[k].value.trim(); return v===""?null:Math.max(0,parseInt(v,10));};
  const row={channel:acc.channel,platform:acc.platform,scope:"conta",source:"manual",followers:n("followers"),views:n("views"),likes:n("likes"),posts:n("posts"),
    views_period:f.elements.views.value.trim()?f.elements.views_period.value:null,note:f.elements.note.value.trim()||null};
  if([row.followers,row.views,row.likes,row.posts].every(x=>x==null)){msg.className="aviso erro";msg.textContent="Preencha pelo menos um número.";return;}
  btn.disabled=true; btn.classList.add("carregando");
  const {error}=await sb.from("hs3d_stats").insert(row);
  btn.disabled=false; btn.classList.remove("carregando");
  if(error){msg.className="aviso erro";msg.textContent="Não consegui salvar: "+error.message;return;}
  toast("Números de "+PLAT[acc.platform]+" ("+(acc.channel_name||acc.channel)+") salvos."); await carregarNumeros();
});
$("#fNumVid").addEventListener("submit",async e=>{
  e.preventDefault(); const msg=$("#nvMsg"), ref=$("#nvRef").value.trim(), views=$("#nvViews").value.trim();
  if(!ref||views===""){msg.className="aviso erro";msg.textContent="Informe o vídeo e as views.";return;}
  const row={channel:numCanal,platform:$("#nvPlat").value,scope:"video",source:"manual",video_ref:ref,video_title:/^https?:/.test(ref)?null:ref,
    views:Math.max(0,parseInt(views,10)),likes:$("#nvLikes").value.trim()===""?null:Math.max(0,parseInt($("#nvLikes").value,10))};
  const {error}=await sb.from("hs3d_stats").insert(row);
  if(error){msg.className="aviso erro";msg.textContent="Não consegui salvar: "+error.message;return;}
  e.target.reset(); msg.className="aviso"; msg.textContent=""; toast("Números do vídeo salvos."); await carregarNumeros();
});
$("#ncCanal").addEventListener("change",e=>{$("#ncCanalNovo").hidden=e.target.value!=="_novo";});
$("#fNumConta").addEventListener("submit",async e=>{
  e.preventDefault(); const msg=$("#ncMsg");
  let ch=$("#ncCanal").value, nome=canaisNumeros().get(ch);
  if(ch==="_novo"){nome=$("#ncCanalNovo").value.trim(); ch=slug(nome); if(!ch){msg.className="aviso erro";msg.textContent="Escreva o nome do canal.";return;}}
  const pl=$("#ncPlat").value, h=$("#ncHandle").value.trim(); if(!h) return;
  const u=/^https?:/.test(h)?h:null, handle=u?null:(h.startsWith("@")?h:"@"+h);
  const url=u||(pl==="youtube"?"https://www.youtube.com/"+handle:pl==="instagram"?"https://www.instagram.com/"+handle.slice(1)+"/":"https://www.tiktok.com/"+handle);
  const {error}=await sb.from("hs3d_accounts").insert({id:ch+":"+pl,channel:ch,channel_name:nome,platform:pl,handle:handle||u,url,auto:true,ordem:100});
  if(error){msg.className="aviso erro";msg.textContent=/duplicate|unique/i.test(error.message)?"Esse canal já tem conta nessa plataforma.":"Não consegui adicionar: "+error.message;return;}
  e.target.reset(); $("#ncCanalNovo").hidden=true; msg.textContent=""; numCanal=ch; toast("Conta adicionada. O Mac busca os números públicos em até 2 min."); await carregarNumeros();
});

/* atualiza sozinho a cada 60 s enquanto aberto (sem atrapalhar quem está editando) */
setInterval(()=>{
  if($("#app").hidden||document.visibilityState!=="visible"||!$("#video").paused) return;
  if(telaAtual==="metas"&&$("#metas .mexeu")) return;
  if(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  carregarTudo();
},60000);
})();
