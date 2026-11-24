"use strict";
const $ = id => document.getElementById(id);
const config = window.MISSION_CONFIG || {};
let token = "", data = null, request = null, expiryTimer = null, session = 0, api = "";
const state = {view:"overview"};
const safeDate = v => Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString("th-TH", {dateStyle:"medium",timeStyle:"short"}) : "—";
function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function link(title, href) {
  const a=el("a","",title || "Untitled");
  try { const u=new URL(href); if(u.protocol==="https:"&&u.hostname==="github.com"&&!u.username&&!u.password) {a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";} } catch {}
  return a;
}
function empty(box,msg) {box.append(el("div","empty",msg));}
function message(msg){$("auth-message").textContent=msg;}
function notice(msg){$("notice").hidden=!msg;$("notice").textContent=msg||"";}
function clearSession(msg="ออกจากระบบแล้ว") {
  session++; if(request)request.abort();request=null;clearTimeout(expiryTimer); token="";data=null;
  ["activity-list","priority-list","repo-list"].forEach(id=>$(id).replaceChildren());
  ["m-repos","m-commits","m-issues","m-priority"].forEach(id=>$(id).textContent="—");
  $("account-email").textContent="";$("updated").textContent="";$("repo-filter").replaceChildren(new Option("All repositories",""));notice("");
  $("workspace").hidden=true;$("login").hidden=false;$("refresh").disabled=false;
  if(window.google?.accounts?.id)window.google.accounts.id.disableAutoSelect();
  message(msg);
}
function setup() {
  try {
    if(!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId||""))throw Error();
    const u=new URL(config.apiBase);if(u.protocol!=="https:"||u.pathname!=="/"||u.search||u.hash||u.username||u.password)throw Error();
    api=u.origin;
  } catch {message("ยังไม่พร้อมใช้งาน: ผู้ดูแลต้องตั้งค่า Google Client ID และ Protected API ใน config.js");return;}
  const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;
  script.onload=()=>{
    google.accounts.id.initialize({client_id:config.googleClientId,callback:signIn,auto_select:false,ux_mode:"popup"});
    google.accounts.id.renderButton($("google-button"),{theme:"outline",size:"large",shape:"rectangular",text:"signin_with",width:Math.min(350,$("google-button").clientWidth||320)});
    message("กรุณาเลือกบัญชีที่ได้รับอนุญาต");
  };
  script.onerror=()=>message("ไม่สามารถโหลด Google Sign-In ได้");document.head.append(script);
}
async function signIn(response) {
  if(!response?.credential){message("ไม่พบข้อมูลยืนยันตัวตน");return;}
  clearSession("กำลังยืนยันสิทธิ์กับ API...");
  token=response.credential;
  await load(true);
}
async function load(initial=false){
  if(!token)return;
  const current=session;
  if(request)request.abort();
  const controller=new AbortController();request=controller;
  $("refresh").disabled=true;
  if(!initial)notice("กำลังอัปเดตข้อมูล...");
  try {
    const res=await fetch(api+"/api/dashboard",{headers:{Authorization:"Bearer "+token},cache:"no-store",credentials:"omit",signal:controller.signal,redirect:"error"});
    if(current!==session||controller.signal.aborted)return;
    if(res.status===401||res.status===403){clearSession(res.status===403?"บัญชีนี้ไม่ได้รับอนุญาต":"เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");return;}
    if(!res.ok)throw Error("API unavailable ("+res.status+")");
    const result=await res.json();
    if(current!==session||controller.signal.aborted)return;
    if(!result.user?.email||!Number.isFinite(result.user.expiresAt)||result.user.expiresAt*1000<=Date.now()||!Array.isArray(result.repositories)||!Array.isArray(result.activity)||!Array.isArray(result.issues)||!Array.isArray(result.errors))throw Error("Invalid API response");
    data=result;
    $("account-email").textContent=data.user.email;
    clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>clearSession("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"),Math.max(0,data.user.expiresAt*1000-Date.now()));
    const selected=$("repo-filter").value;
    $("repo-filter").replaceChildren(new Option("All repositories",""),...data.repositories.map(r=>new Option(r.name,r.name)));
    if(data.repositories.some(r=>r.name===selected))$("repo-filter").value=selected;
    $("updated").textContent="อัปเดต "+safeDate(data.fetchedAt);
    $("login").hidden=true;$("workspace").hidden=false;
    notice(data.errors.length ? "ข้อมูลบางส่วนไม่พร้อมใช้งาน\n"+data.errors.map(e=>e.repo+" · "+e.section+" ("+e.status+")").join("\n") : "");
    render();
  } catch(e) {
    if(current!==session||controller.signal.aborted)return;
    if(initial){clearSession("ไม่สามารถยืนยันสิทธิ์หรือโหลดข้อมูลได้ โปรดตรวจสอบ API และลองใหม่");}
    else {notice("อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลล่าสุดที่เคยโหลดในเซสชันนี้");}
  } finally {if(current===session&&request===controller){request=null;$("refresh").disabled=false;}}
}
function item(box, icon, title, href, meta, cls="") {
  const row=el("div","item");row.append(el("span","item-icon "+cls,icon));const body=el("div");body.append(link(title,href),el("div","meta",meta));row.append(body);box.append(row);
}
function render(){
  if(!data)return;
  const filter=$("repo-filter").value, days=Number($("period").value);
  const match=name=>!filter||filter===name;
  const cutoff=Date.now()-days*86400000;
  const repos=data.repositories.filter(r=>match(r.name));
  const events=data.activity.filter(e=>match(e.repo)&&Date.parse(e.at)>=cutoff);
  const issues=data.issues.filter(e=>match(e.repo)).sort((a,b)=>(a.blocked?0:a.rank+1)-(b.blocked?0:b.rank+1)||Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  const issuesComplete=!data.errors.some(e=>match(e.repo)&&(e.section==="issues"||e.section==="repository"));
  const commitsComplete=!data.errors.some(e=>match(e.repo)&&(e.section==="commits"||e.section==="repository"));
  $("m-repos").textContent=repos.length;
  $("m-commits").textContent=commitsComplete?events.filter(e=>e.type==="commit").length:events.filter(e=>e.type==="commit").length+"*";
  $("m-issues").textContent=issues.length+(issuesComplete?"":"*");
  $("m-priority").textContent=issues.filter(e=>e.blocked||e.rank<=1).length+(issuesComplete?"":"*");
  const act=$("activity-list"),prior=$("priority-list"),rl=$("repo-list");act.replaceChildren();prior.replaceChildren();rl.replaceChildren();
  const icons={commit:"↳",pull:"⇄",issue:"◉",workflow:"◈"};
  for(const e of events) item(act,icons[e.type]||"·",e.title,e.url,e.repo+" · "+e.type+(e.status?" · "+e.status:"")+" · "+safeDate(e.at));
  if(!events.length)empty(act,"ไม่มี Activity ที่โหลดได้ในช่วงเวลานี้");
  for(const i of issues) item(prior,i.priority,i.title,i.url,i.repo+" #"+i.number+(i.blocked?" · Blocked":"")+" · "+safeDate(i.updatedAt),"prio "+i.priority);
  if(!issues.length)empty(prior,"ไม่มี Open Issue ที่โหลดได้");
  for(const r of repos){const card=el("article","repo-card");card.append(link(r.name,r.url),el("p","",r.description||"No description"),el("span","branch",r.branch||"—"),el("p","","Last push · "+safeDate(r.pushedAt)));rl.append(card);}
  if(!repos.length)empty(rl,"ไม่พบ Repository ที่โหลดสำเร็จ");
}
function switchView(view){
  state.view=view;const names={overview:"Overview",activity:"Timeline",priority:"Priority",repositories:"Repositories"};
  $("view-title").textContent=names[view];$("headline").textContent=view==="overview"?"Your work, in focus.":names[view];
  $("metrics").hidden=view!=="overview";
  ["activity","priority","repositories"].forEach(v=>$(v+"-panel").hidden=view!=="overview"&&view!==v);
  $("panels").classList.toggle("single",view!=="overview");
  document.querySelectorAll("[data-view]").forEach(b=>{const on=b.dataset.view===view;b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("period").addEventListener("change",render);$("repo-filter").addEventListener("change",render);
$("refresh").addEventListener("click",()=>load());$("logout").addEventListener("click",()=>clearSession());
setup();
