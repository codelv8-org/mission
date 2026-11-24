import {createGitHubClient,isFineGrainedPAT,validRepo,MAX_REPOS} from "./github-api.mjs";
import {renderAnalytics,resetAnalytics} from "./analytics-view.mjs";
import {initTheme} from "./theme.mjs";
const $=id=>document.getElementById(id);
initTheme();
let token="",identity=null,data=null,request=null,expiryTimer=null,session=0;
let available=[],selected=[],draft=new Set(),discoveryNote="";
const state={view:"overview"};
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

function clearSession(msg="ออกจากระบบแล้ว"){
  session++;request?.abort();request=null;clearTimeout(expiryTimer);
  token="";identity=null;data=null;available=[];selected=[];draft.clear();discoveryNote="";
  if($("repo-dialog").open)$("repo-dialog").close();
  ["activity-list","priority-list","repo-list","repo-options"].forEach(id=>$(id).replaceChildren());
  ["m-repos","m-commits","m-issues","m-priority"].forEach(id=>$(id).textContent="—");
  $("account-login").textContent="";$("updated").textContent="";$("repo-filter").replaceChildren(new Option("All repositories",""));
  $("repo-count").textContent="";$("repo-dialog-note").textContent="เลือกได้สูงสุด "+MAX_REPOS+" Repository ต่อการเชื่อมต่อ";$("repo-search").value="";$("repo-manual").value="";$("repo-selection-message").textContent="";$("pat-input").value="";
  resetAnalytics();switchView("overview");
  notice("");$("workspace").hidden=true;$("login").hidden=false;$("refresh").disabled=false;$("github-login").disabled=false;$("add-repo").disabled=false;
  message(msg);
}
function errorText(e){
  if(e?.kind==="rate_limited")return "GitHub API Rate limit ถึงขีดจำกัด กรุณารอแล้วลองใหม่";
  if(e?.status===401)return "Token ไม่ถูกต้อง หมดอายุ หรือถูกเพิกถอน";
  if(e?.status===403)return "GitHub ไม่อนุญาต โปรดตรวจสอบสิทธิ์ Token หรือการอนุมัติของ Organization";
  if(e?.status===404)return "ไม่พบ Repository หรือ Token ไม่มีสิทธิ์เข้าถึง";
  return "ไม่สามารถเชื่อมต่อ GitHub ได้ โปรดตรวจสอบเครือข่ายและลองใหม่";
}
async function connect(){
  if($("github-login").disabled)return;
  const value=$("pat-input").value.trim();$("pat-input").value="";
  if(!isFineGrainedPAT(value)){message("กรุณาใช้ Fine-grained Personal Access Token ที่ขึ้นต้นด้วย github_pat_");return;}
  clearSession("กำลังตรวจสอบบัญชี GitHub...");
  token=value;$("github-login").disabled=true;
  const current=session,controller=new AbortController();request=controller;
  try{
    const client=createGitHubClient(token,{signal:controller.signal});
    const user=await client.user();
    if(current!==session)return;
    identity=user;
    try{
      const found=await client.discover();
      if(current!==session)return;
      available=found.repositories;discoveryNote=found.truncated?"รายการที่ค้นพบจำกัด 500 Repository แรก สามารถเพิ่ม Repository ด้วยชื่อ owner/repo ได้":"";
    }catch(e){
      if(current!==session)return;
      if(e.status===401)throw e;
      discoveryNote="ค้นหา Repository ไม่สำเร็จ: "+errorText(e)+" สามารถลองเพิ่มด้วยชื่อ owner/repo";
    }
    if(current!==session)return;
    selected=available.slice(0,Math.min(8,MAX_REPOS)).map(r=>r.name);
    $("account-login").textContent="@"+identity.login;
    $("login").hidden=true;$("workspace").hidden=false;
    expiryTimer=setTimeout(()=>clearSession("เซสชันครบ 1 ชั่วโมง กรุณาเชื่อมต่อใหม่"),3600000);
    if(request===controller)request=null;
    if(selected.length)await load();else{data={repositories:[],activity:[],issues:[],errors:[],user:identity};render();openPicker();}
  }catch(e){if(current===session)clearSession(errorText(e));}
  finally{if(current===session&&request===controller){request=null;$("github-login").disabled=false;}}
}
function openPicker(){
  if(!token)return;
  draft=new Set(selected.map(n=>n.toLowerCase()));
  $("repo-search").value="";$("repo-manual").value="";$("repo-selection-message").textContent="";
  $("repo-dialog-note").textContent="เลือกได้สูงสุด "+MAX_REPOS+" Repository ต่อการเชื่อมต่อ"+(discoveryNote?" · "+discoveryNote:"");
  renderPicker();if(!$("repo-dialog").open)$("repo-dialog").showModal();
}
function renderPicker(){
  const q=$("repo-search").value.trim().toLowerCase(),box=$("repo-options");box.replaceChildren();
  const visible=available.filter(r=>r.name.toLowerCase().includes(q));
  if(!visible.length)empty(box,"ไม่พบ Repository ที่ตรงกับการค้นหา");
  for(const repo of visible){
    const key=repo.name.toLowerCase(),label=el("label","repo-option"),check=document.createElement("input");check.type="checkbox";check.checked=draft.has(key);
    check.addEventListener("change",()=>{if(check.checked&&draft.size>=MAX_REPOS){check.checked=false;$("repo-selection-message").textContent="เลือกได้สูงสุด "+MAX_REPOS+" Repository";return;}if(check.checked)draft.add(key);else draft.delete(key);$("repo-selection-message").textContent="";updateCount();});
    label.append(check,el("span","",repo.name),el("small","",repo.private?"Private":"Public"));box.append(label);
  }
  updateCount();
}
function updateCount(){$("repo-count").textContent=draft.size+" / "+MAX_REPOS+" selected";$("apply-repos").disabled=draft.size===0;}
async function addRepo(){
  if(!token||$("add-repo").disabled)return;
  const name=$("repo-manual").value.trim();
  if(!validRepo(name)){$("repo-selection-message").textContent="ระบุชื่อแบบ owner/repository";return;}
  if(draft.size>=MAX_REPOS){$("repo-selection-message").textContent="เลือกได้สูงสุด "+MAX_REPOS+" Repository";return;}
  const current=session;$("add-repo").disabled=true;
  try{
    const repo=await createGitHubClient(token).findRepo(name);
    if(current!==session||!$("repo-dialog").open)return;
    const key=repo.name.toLowerCase();if(!available.some(r=>r.name.toLowerCase()===key))available.push(repo);
    if(draft.size<MAX_REPOS)draft.add(key);
    $("repo-manual").value="";$("repo-search").value="";$("repo-selection-message").textContent="เพิ่ม Repository แล้ว";renderPicker();
  }catch(e){if(current===session){if(e.status===401)clearSession(errorText(e));else $("repo-selection-message").textContent=errorText(e);}}
  finally{if(current===session)$("add-repo").disabled=false;}
}
async function load(){
  if(!token||!identity)return;
  const current=session;request?.abort();
  const controller=new AbortController();request=controller;
  $("refresh").disabled=true;notice("กำลังอัปเดตข้อมูล...");
  try{
    const result=await createGitHubClient(token,{signal:controller.signal}).dashboard([...selected],identity);
    if(current!==session||controller.signal.aborted)return;
    data=result;
    const previous=$("repo-filter").value;
    $("repo-filter").replaceChildren(new Option("All repositories",""),...selected.map(n=>new Option(n,n)));
    if(selected.includes(previous))$("repo-filter").value=previous;
    $("updated").textContent="อัปเดต "+safeDate(data.fetchedAt);
    const warnings=[discoveryNote,...data.errors.map(e=>e.repo+" · "+e.section+" ("+e.status+")")].filter(Boolean);
    notice(warnings.length?"ข้อมูลบางส่วนไม่พร้อมใช้งาน\n"+warnings.join("\n"):"");
    render();
  }catch(e){
    if(current!==session||controller.signal.aborted)return;
    if(e.status===401){clearSession(errorText(e));return;}
    notice(errorText(e)+(data?" · แสดงข้อมูลล่าสุดของเซสชันนี้":" · ยังไม่มีข้อมูล Dashboard"));
  }finally{if(current===session&&request===controller){request=null;$("refresh").disabled=false;}}
}
// Decorative, locally defined SVG icons; upstream strings never become markup.
const EVENT_PATHS=Object.freeze({
  commit:["M3 12h6m6 0h6","M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  pull:["M6 3v13m12-4v6M6 5h8a4 4 0 0 1 4 4v3m-3-9 3 3 3-3","M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0","M21 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  issue:["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18","M12 7v5m0 4h.01"],
  workflow:["M4 4h6v6H4zM14 14h6v6h-6zM7 10v7h7"],
  fallback:["M5 12h14"]
});
function eventIcon(type){
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("class","ui-icon");svg.setAttribute("aria-hidden","true");svg.setAttribute("focusable","false");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.8");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
  for(const d of Object.hasOwn(EVENT_PATHS,type)?EVENT_PATHS[type]:EVENT_PATHS.fallback){const p=document.createElementNS(ns,"path");p.setAttribute("d",d);svg.append(p);}
  return svg;
}
function item(box, icon, title, href, meta, cls="") {
  const row=el("div","item"),badge=el("span","item-icon "+cls);
  if(cls.startsWith("prio"))badge.textContent=icon;
  else badge.append(eventIcon(icon));
  row.append(badge);const body=el("div");body.append(link(title,href),el("div","meta",meta));row.append(body);box.append(row);
}
function renderDashboard(){
  renderAnalytics(data,{names:selected,filter:$("repo-filter").value,days:Number($("period").value),onProject:name=>{if([...$("repo-filter").options].some(o=>o.value===name)){$("repo-filter").value=name;render();}}});
}
function render(){
  if(state.view==="dashboard")renderDashboard();
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
  for(const e of events) item(act,e.type,e.title,e.url,e.repo+" · "+e.type+(e.status?" · "+e.status:"")+" · "+safeDate(e.at),"event-"+(Object.hasOwn(EVENT_PATHS,e.type)?e.type:"fallback"));
  if(!events.length)empty(act,"ไม่มี Activity ที่โหลดได้ในช่วงเวลานี้");
  for(const i of issues) item(prior,i.priority,i.title,i.url,i.repo+" #"+i.number+(i.blocked?" · Blocked":"")+" · "+safeDate(i.updatedAt),"prio "+i.priority);
  if(!issues.length)empty(prior,"ไม่มี Open Issue ที่โหลดได้");
  for(const r of repos){const card=el("article","repo-card");card.append(link(r.name,r.url),el("p","",r.description||"No description"),el("span","branch",r.branch||"—"),el("p","","Last push · "+safeDate(r.pushedAt)));rl.append(card);}
  if(!repos.length)empty(rl,"ไม่พบ Repository ที่โหลดสำเร็จ");
}
function switchView(view){
  state.view=view;const names={overview:"Overview",dashboard:"Dashboard",activity:"Timeline",priority:"Priority",repositories:"Repositories"};
  $("view-title").textContent=names[view];$("headline").textContent=view==="overview"?"Your work, in focus.":view==="dashboard"?"Project Analytics Dashboard":names[view];
  $("view-description").textContent=view==="dashboard"?"วิเคราะห์กิจกรรมและสัญญาณของโปรเจกต์จากข้อมูล GitHub ที่โหลดได้":"ติดตามโปรเจกต์และวางแผนงานจากข้อมูลจริงบน GitHub";
  $("metrics").hidden=view!=="overview";
  $("analytics").hidden=view!=="dashboard";
  $("panels").hidden=view==="dashboard";
  if(view==="dashboard")renderDashboard();
  ["activity","priority","repositories"].forEach(v=>$(v+"-panel").hidden=view!=="overview"&&view!==v);
  $("panels").classList.toggle("single",view!=="overview");
  document.querySelectorAll("[data-view]").forEach(b=>{const on=b.dataset.view===view;b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
}

document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("analytics-type").addEventListener("change",renderDashboard);
$("period").addEventListener("change",render);$("repo-filter").addEventListener("change",render);
$("refresh").addEventListener("click",load);$("logout").addEventListener("click",()=>clearSession());
$("github-login").addEventListener("click",connect);$("pat-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.isComposing){e.preventDefault();connect();}});
$("manage-repos").addEventListener("click",openPicker);$("close-repos").addEventListener("click",()=>$("repo-dialog").close());
$("repo-search").addEventListener("input",renderPicker);$("add-repo").addEventListener("click",addRepo);
$("apply-repos").addEventListener("click",()=>{
  if(!draft.size||draft.size>MAX_REPOS)return;
  selected=available.filter(r=>draft.has(r.name.toLowerCase())).map(r=>r.name);
  $("repo-dialog").close();
  data=null;resetAnalytics();["activity-list","priority-list","repo-list"].forEach(id=>$(id).replaceChildren());
  ["m-repos","m-commits","m-issues","m-priority"].forEach(id=>$(id).textContent="—");$("repo-filter").replaceChildren(new Option("All repositories",""));$("updated").textContent="";
  load();
});
window.addEventListener("pagehide",()=>clearSession(""));
message("เชื่อมต่อด้วย Token ของคุณเพื่อเริ่มใช้งาน");
