/* Estúdio HS3D — painel de aprovação. Só lê/registra no Supabase; nunca posta nada. */
(function(){
"use strict";
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ST={aguardando:"Aguardando aprovação",aprovado:"Aprovado",reprovado:"Reprovado",postado:"Postado"};
const CANAL={curioso:"O Curioso",zeca:"Missão Zeca"};
const cfg=window.HS3D_CONFIG||{};
const TZ="America/Sao_Paulo";
const fmtData=d=>d?new Date(d).toLocaleString("pt-BR",{timeZone:TZ,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
const hojeSP=()=>new Date().toLocaleDateString("en-CA",{timeZone:TZ});
const diaSP=d=>d?new Date(d).toLocaleDateString("en-CA",{timeZone:TZ}):"";

function bootErr(msg){const el=$("#boot-error");el.hidden=false;el.textContent=msg;}
if(!window.supabase||!cfg.supabaseUrl){bootErr("Não carreguei a biblioteca do Supabase. Recarregue a página.");return;}
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"hs3d-studio-auth"}});

let videos=[],decisoes=[],canal="curioso",selId={curioso:null,zeca:null},semTabelas=false;
const urlCache={};

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
  $("#btnEntrar").disabled=true; msg.textContent="Entrando…";
  const {error}=await sb.auth.signInWithPassword({email,password:senha});
  $("#btnEntrar").disabled=false;
  if(error){msg.className="aviso erro";msg.textContent=/invalid/i.test(error.message)?"E-mail ou senha incorretos.":"Não consegui entrar: "+error.message;}
  else {msg.textContent="";$("#senha").value="";}
});
$("#btnSair").addEventListener("click",()=>sb.auth.signOut());
sb.auth.onAuthStateChange((_ev,session)=>{ if(session) mostrarApp(session); else mostrarLogin(); });
sb.auth.getSession().then(({data})=>{ if(data.session) mostrarApp(data.session); else mostrarLogin(); })
  .catch(()=>mostrarLogin());

/* ---------- navegação ---------- */
function ir(t){
  $$(".tela").forEach(s=>{ if(s.id!=="tela-login") s.classList.toggle("on",s.id==="tela-"+t); });
  $$(".abas [data-ir]").forEach(b=>b.setAttribute("aria-current",b.dataset.ir===t));
  if(t!=="fila"){const v=$("#video"); if(!v.paused) v.pause();}
  scrollTo(0,0);
  if(t==="metas") renderMetas(); if(t==="diario") carregarDiario(); if(t==="novo") carregarPedidos();
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-ir],[data-canal],[data-vid]"); if(!b) return;
  if(b.dataset.ir) return ir(b.dataset.ir);
  if(b.dataset.canal){canal=b.dataset.canal;}
  else selId[canal]=b.dataset.vid;
  $("#coment").value=""; aviso(""); renderFila();
});

/* ---------- dados ---------- */
let carregando=false;
async function carregarTudo(){
  if(carregando) return; carregando=true;
  try{
    const r=await sb.from("hs3d_videos").select("*").order("produced_at",{ascending:false,nullsFirst:false});
    if(r.error){ semTabelas=/does not exist|schema cache|not find/i.test(r.error.message); videos=[]; 
      $("#vazio").hidden=false;
      $("#vazio").textContent=semTabelas?"As tabelas do painel ainda não foram criadas no Supabase (falta colar o schema.sql no SQL Editor).":"Erro ao carregar a fila: "+r.error.message; }
    else { semTabelas=false; videos=r.data||[]; }
    const d=await sb.from("hs3d_decisions").select("*").order("created_at",{ascending:false}).limit(200);
    decisoes=d.error?[]:(d.data||[]);
  } finally { carregando=false; }
  renderFila();
}
async function urlPrevia(v){
  if(!v.preview_path) return v.preview_url||null;
  const c=urlCache[v.preview_path]; if(c&&c.exp>Date.now()) return c.url;
  const {data,error}=await sb.storage.from(cfg.bucket).createSignedUrl(v.preview_path,3600);
  let url=data?.signedUrl||null;
  if(error||!url) url=(v.preview_url && (!v.preview_url_expires||new Date(v.preview_url_expires)>new Date()))?v.preview_url:null;
  if(url) urlCache[v.preview_path]={url,exp:Date.now()+50*60*1000};
  return url;
}
async function urlPoster(v){
  if(!v.preview_path) return null;
  const p=v.preview_path.replace(/\.mp4$/,".jpg"), c=urlCache[p]; if(c&&c.exp>Date.now()) return c.url;
  const {data}=await sb.storage.from(cfg.bucket).createSignedUrl(p,3600);
  if(data?.signedUrl) urlCache[p]={url:data.signedUrl,exp:Date.now()+50*60*1000};
  return data?.signedUrl||null;
}

/* ---------- fila ---------- */
const aviso=(t,erro)=>{const a=$("#aviso");a.textContent=t;a.className="aviso"+(erro?" erro":"");};
const dur=s=>{s=Math.round(+s||0);return s?Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):"";};
let ultimoVideo=null;
async function renderFila(){
  for(const k of ["curioso","zeca"]){
    const n=videos.filter(v=>v.channel===k&&v.status==="aguardando").length;
    $("#n-"+k).textContent=n?n+" aguardando você":(videos.some(v=>v.channel===k)?"nada aguardando":"sem vídeos ainda");
  }
  $$("[data-canal]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.canal===canal));
  const its=videos.filter(v=>v.channel===canal);  // canais nunca se misturam
  $("#fila").hidden=!its.length;
  if(!semTabelas){ $("#vazio").hidden=!!its.length; if(!its.length) $("#vazio").textContent="Nenhum vídeo de "+CANAL[canal]+" saiu da esteira ainda."; }
  if(!its.length) return;
  if(!its.find(v=>v.id===selId[canal])) selId[canal]=(its.find(v=>v.status==="aguardando")||its[0]).id;
  const it=its.find(v=>v.id===selId[canal]);
  $("#lista").innerHTML=its.map(v=>`<li><button class="item" data-vid="${esc(v.id)}" aria-pressed="${v.id===it.id}">
    <span class="mini" data-poster="${esc(v.id)}"></span>
    <span class="t">${esc(v.title)}</span>
    <span class="m">${esc(v.episode||"")} <span>${dur(v.duration_s)}</span> <span class="st ${esc(v.status)}">${ST[v.status]||esc(v.status)}</span></span></button></li>`).join("");
  its.forEach(async v=>{const u=await urlPoster(v); const el=document.querySelector(`[data-poster="${CSS.escape(v.id)}"]`); if(u&&el) el.style.backgroundImage=`url("${u}")`;});
  $("#pTitulo").textContent=it.title; $("#pMeta").textContent=[it.episode,dur(it.duration_s)].filter(Boolean).join(", ");
  $("#dTitulo").textContent=it.title+(it.episode?", "+it.episode:"");
  $("#dStatus").textContent=ST[it.status]||it.status; $("#dStatus").className="st "+it.status;
  const rel=$("#rel");
  if(it.avaliador_md&&it.avaliador_md.trim()){rel.textContent=it.avaliador_md.trim();rel.className="rel";}
  else {rel.textContent="O Avaliador ainda não salvou o parecer deste vídeo em AVALIADOR.md.";rel.className="rel sem";}
  $("#notasBox").hidden=!it.notes_md; $("#notas").textContent=it.notes_md||"";
  $("#caminho").textContent=it.mac_path?"No Mac: "+it.mac_path:"";
  const fim=it.status==="postado";
  $("#aprovar").disabled=$("#reprovar").disabled=fim;
  const hs=decisoes.filter(d=>d.video_id===it.id);
  $("#hist").innerHTML=hs.length?hs.map(d=>`<div><b>${d.decision==="aprovado"?"Aprovado":"Reprovado"}</b> · ${esc(fmtData(d.created_at))} (Brasília)${d.decided_by?" · "+esc(d.decided_by):""}${d.comment?"<br>"+esc(d.comment):""}${d.synced_at?"<br>✓ entregue ao Hermes":"<br>… aguardando o Mac sincronizar"}</div>`).join(""):"";
  // vídeo
  const vEl=$("#video"), pl=$("#player");
  if(ultimoVideo!==it.id){
    ultimoVideo=it.id; pl.classList.remove("tocando"); vEl.removeAttribute("src"); vEl.load();
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

async function decidir(decisao){
  const it=videos.find(v=>v.id===selId[canal]); if(!it) return;
  const c=$("#coment").value.trim();
  if(decisao==="reprovado"&&!c){aviso("Escreva o que precisa mudar antes de reprovar.",true);$("#coment").focus();return;}
  $("#aprovar").disabled=$("#reprovar").disabled=true; aviso("Registrando…");
  const {error}=await sb.from("hs3d_decisions").insert({video_id:it.id,channel:it.channel,decision:decisao,comment:c||null});
  if(error){aviso("Não consegui registrar: "+error.message,true);$("#aprovar").disabled=$("#reprovar").disabled=false;return;}
  $("#coment").value="";
  await carregarTudo();
  aviso(decisao==="aprovado"?"Aprovado. O Hermes recebe no Mac em até 2 minutos. Nada é postado por este painel.":"Reprovado com comentário. O Hermes devolve para ajuste.");
}
$("#aprovar").addEventListener("click",()=>decidir("aprovado"));
$("#reprovar").addEventListener("click",()=>decidir("reprovado"));

/* ---------- metas ---------- */
async function renderMetas(){
  const box=$("#metas"); box.innerHTML="<p class='nota'>Carregando…</p>";
  const {data,error}=await sb.from("hs3d_kv").select("*").eq("key","metas").maybeSingle();
  if(error){box.innerHTML=`<p class="aviso erro">${esc(semTabelas?"Tabelas ainda não criadas no Supabase.":error.message)}</p>`;return;}
  const linhas=data?.value?.rows||[];
  const hoje=hojeSP();
  const porCanal=k=>videos.filter(v=>v.channel===k&&diaSP(v.produced_at)===hoje);
  const html=["curioso","zeca"].map(k=>{
    const ms=linhas.filter(r=>r.canal_id===k);
    const feitos=porCanal(k);
    if(!ms.length) return `<div class="bloco"><div class="num">${feitos.length}<small>produzidos hoje</small></div><div><h2>${CANAL[k]}</h2><p class="nota">Sem meta no METAS.md.</p></div></div>`;
    return ms.map(m=>{
      const meta=parseInt(m.por_dia,10); const temMeta=!isNaN(meta);
      const horarios=(m.horarios||"").match(/\d{1,2}h\d{0,2}/g)||[];
      const slots=(horarios.length?horarios:(temMeta?Array.from({length:meta},(_,i)=>"#"+(i+1)):["Horário"])).map((h,i)=>{
        const f=feitos[feitos.length-1-i];
        return f?`<div class="slot feito"><b>${esc(h)}</b><span>${esc(f.title)} · ${esc(ST[f.status]||f.status)}</span></div>`
               :`<div class="slot vago"><b>${esc(h)}</b><span>${temMeta?"ainda não produzido":"defina a meta no METAS.md"}</span></div>`;
      }).join("");
      return `<div class="bloco"><div class="num">${feitos.length}${temMeta?"/"+meta:""}<small>vídeos produzidos hoje</small></div>
        <div><h2>${CANAL[k]}</h2><dl><dt>Formato</dt><dd>${esc(m.formato)}</dd><dt>Meta</dt><dd>${esc(m.por_dia)}${temMeta?" por dia":""}</dd><dt>Horários</dt><dd>${esc(m.horarios)}</dd></dl>
        ${m.status?`<p class="teste">${esc(m.status)}</p>`:""}</div><div class="slots">${slots}</div></div>`;
    }).join("");
  }).join("");
  box.innerHTML=html;
  $("#metasSync").textContent=data?.updated_at?"METAS.md sincronizado em "+fmtData(data.updated_at)+" (Brasília).":"";
}

/* ---------- diário ---------- */
async function carregarDiario(){
  const ol=$("#diario"); ol.innerHTML="<li class='nota'>Carregando…</li>";
  const {data,error}=await sb.from("hs3d_kv").select("*").eq("key","diario").maybeSingle();
  if(error){ol.innerHTML=`<li class="aviso erro">${esc(semTabelas?"Tabelas ainda não criadas no Supabase.":error.message)}</li>`;return;}
  const ls=(data?.value?.lines||[]).slice().reverse();
  ol.innerHTML=ls.length?ls.map(l=>{const p=l.split(" · ");
    return p.length>=3?`<li><span class="h">${esc(p[0])} · ${esc(p[1])}</span>${esc(p.slice(2).join(" · "))}</li>`:`<li>${esc(l)}</li>`;}).join(""):"<li class='nota'>Nenhuma linha ainda.</li>";
  $("#diarioSync").textContent=data?.updated_at?"Sincronizado do Maestri em "+fmtData(data.updated_at)+" (Brasília). Mais recentes primeiro.":"";
}

/* ---------- novo formato ---------- */
$("#link").addEventListener("input",e=>{const v=e.target.value;
  const p=/youtu\.?be/i.test(v)?"YouTube":/tiktok/i.test(v)?"TikTok":/instagram/i.test(v)?"Instagram":v.trim()?"outro site":"";
  $("#plat").textContent=p?"Link reconhecido: "+p:"";});
$("#fNovo").addEventListener("submit",async e=>{
  e.preventDefault();
  const link=$("#link").value.trim(), msg=$("#novoMsg"); msg.className="aviso";
  if(!/^https?:\/\//i.test(link)){msg.className="aviso erro";msg.textContent="Cole um link começando com https://";return;}
  const ch=document.querySelector("input[name=canalNovo]:checked").value;
  $("#btnNovo").disabled=true; msg.textContent="Enviando…";
  const {error}=await sb.from("hs3d_format_requests").insert({link,channel:ch,name:$("#nomeFmt").value.trim()||null,notes:$("#notasFmt").value.trim()||null,status:"novo"});
  $("#btnNovo").disabled=false;
  if(error){msg.className="aviso erro";msg.textContent="Não consegui enviar: "+error.message;return;}
  msg.textContent="Pedido enviado para "+CANAL[ch]+". O Hermes vê em PEDIDOS_FORMATO.md no Mac. Nada é produzido nem postado automaticamente.";
  $("#fNovo").reset(); $("#plat").textContent=""; carregarPedidos();
});
async function carregarPedidos(){
  const ul=$("#pedidos");
  const {data,error}=await sb.from("hs3d_format_requests").select("*").order("created_at",{ascending:false}).limit(30);
  if(error){ul.innerHTML=`<li class="aviso erro">${esc(semTabelas?"Tabelas ainda não criadas no Supabase.":error.message)}</li>`;return;}
  ul.innerHTML=(data||[]).length?data.map(p=>`<li><b>${esc(p.name||"Formato sem nome")} · ${CANAL[p.channel]||esc(p.channel)}</b><span>${esc(p.link)}</span><br><span>${esc(p.status)} · ${esc(fmtData(p.created_at))} (Brasília)${p.synced_at?" · ✓ no Mac":""}</span></li>`).join(""):"<li class='nota'>Nenhum pedido ainda.</li>";
}

/* atualiza sozinho a cada 60 s enquanto aberto */
setInterval(()=>{ if(!$("#app").hidden && document.visibilityState==="visible" && $("#video").paused) carregarTudo(); },60000);
})();
