import {ORBIT_TYPES,ORBIT_NAMES,ORBIT_STATUS,orbitWindow,orbitGroups} from "./orbit-model.mjs";
import {calendarDay,WEEKDAYS_TH,weekdayIndex} from "./period.mjs";
const $=id=>document.getElementById(id);
const colors=Object.freeze({milestone:"M",issue:"I",pull:"PR",commit:"C"});
const state={days:14,offset:0,collapsed:new Set(),selected:null,limit:100};
let context={data:null,names:[],filter:"",onRepoChange:()=>{}};
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
function btn(cls,text,fn){const b=node("button",cls,text);b.type="button";b.addEventListener("click",fn);return b;}
function safeLink(title,href){const a=node("a","orbit-link",title);try{const u=new URL(href);if(u.protocol==="https:"&&u.hostname==="github.com"&&!u.port&&!u.username&&!u.password){a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";}}catch{}return a;}
const dayLabel=d=>new Date(d+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
const stamp=v=>v&&Number.isFinite(Date.parse(v))?dayLabel(calendarDay(Date.parse(v))):"—";
const asOf=()=>Number.isFinite(Date.parse(context.data?.fetchedAt))?Date.parse(context.data.fetchedAt):Date.now();
const getWindow=()=>orbitWindow(asOf(),state.days,state.offset);
const types=()=>["all",...ORBIT_TYPES].includes($("orbit-type").value)?$("orbit-type").value:"all";
function avatars(names){const a=node("span","orbit-avatars");a.setAttribute("aria-label",names.length?"Participants: "+names.join(", "):"No participant recorded");for(const name of names.slice(0,3)){const s=node("span","orbit-avatar",name.slice(0,2).toUpperCase());s.title=name;a.append(s);}if(names.length>3)a.append(node("span","orbit-avatar","+"+(names.length-3)));return a;}
function showDetail(item){
 const box=$("orbit-detail");box.replaceChildren();box.hidden=!item;
 if(!item)return;
 const head=node("div","orbit-detail-head");head.append(node("div","",ORBIT_NAMES[item.type]+" · "+item.repo),btn("btn orbit-clear","Close",()=>{state.selected=null;paint();}));
 const title=node("h3","",item.title);const meta=node("div","orbit-detail-grid");
 const pairs=[["Status",ORBIT_STATUS[item.status]||item.status],["Start / observed",stamp(item.startAt)],["End / as of",stamp(item.endAt||new Date(asOf()).toISOString())],["Participants",item.participants.join(", ")||"Not recorded"]];
 if(item.counts)pairs.push(["Milestone issues",item.counts.closed+" closed / "+(item.counts.open+item.counts.closed)+" total"]);
 if(item.dueAt)pairs.push(["Milestone due",stamp(item.dueAt)]);
 if(item.closedAt)pairs.push(["Milestone closed",stamp(item.closedAt)]);
 for(const [k,v] of pairs){const cell=node("div","");cell.append(node("small","",k),node("strong","",v));meta.append(cell);}
 box.append(head,title,meta,node("p","muted",item.basis+" · "+(item.progress==null?"No measured percentage available":item.progress+"% closed issues")+" · ICT"),safeLink("Open on GitHub ↗",item.url));
}
function appendDays(row,dates,from,to,w){
 for(let i=from;i<to;i++){const td=node("td","orbit-day");if(dates[i]===w.today)td.classList.add("orbit-today");if([0,6].includes(weekdayIndex(dates[i])))td.classList.add("orbit-weekend");row.append(td);}
}
function addBar(row,item,w){
 const c=item.clipped;appendDays(row,w.dates,0,c.first,w);
 const td=node("td","orbit-track-cell");td.colSpan=c.span;
 const label=(item.number==null?"":"#"+item.number+" ")+item.title;
 const status=item.progress==null?(ORBIT_STATUS[item.status]||item.status):item.progress+"%";
 const bar=btn("orbit-pill orbit-"+item.type+(c.span===1?" orbit-point":"")+(["completed","merged","commit"].includes(item.status)?" orbit-done":""),"",()=>{state.selected=state.selected===item.id?null:item.id;paint();});
 bar.dataset.key=item.id;bar.setAttribute("aria-pressed",String(state.selected===item.id));
 bar.setAttribute("aria-label",label+" · "+status+" · "+item.repo+" · "+item.basis);
 bar.title=label+" · "+status+" · "+stamp(item.startAt)+" – "+stamp(item.endAt||new Date(asOf()).toISOString());
 if(item.progress!==null){const meter=node("meter","orbit-progress");meter.min=0;meter.max=100;meter.value=item.progress;meter.setAttribute("aria-label","Closed issue percentage");bar.append(meter);}
 const contents=node("span","orbit-pill-content");contents.append(node("span","orbit-pill-dot"),node("span","orbit-pill-label",(c.before?"‹ ":"")+label+(c.after?" ›":"")),node("span","orbit-status",status),node("span","orbit-chevron","›"));
 bar.append(contents);td.append(bar);row.append(td);appendDays(row,w.dates,c.last+1,w.days,w);
}
function repoChips(items){
 const box=$("orbit-repos");box.replaceChildren();
 const names=["",...context.names];for(const name of names){
  const count=items.filter(i=>!name||i.repo===name).length;
  const b=btn("orbit-repo-chip",name||"All repositories",()=>context.onRepoChange(name));
  b.setAttribute("aria-pressed",String(name===context.filter));b.append(node("small","",count+" items"));box.append(b);
 }
}
function summary(items){
 const filtered=items.filter(i=>!context.filter||i.repo===context.filter);
 const gaps=[...(context.data?.errors||[]),...(context.data?.truncated||[])].filter(e=>!context.filter||e.repo===context.filter);
 const metric=(id,value,sections)=>{$(id).textContent=context.data?String(value)+(gaps.some(g=>sections.includes(g.section)||g.section==="repository")?"*":""):"—";};
 metric("orbit-kpi-issues",filtered.filter(i=>i.type==="issue"&&["open","blocked"].includes(i.status)).length,["issues","issue_activity"]);
 metric("orbit-kpi-pulls",filtered.filter(i=>i.type==="pull"&&["open","draft"].includes(i.status)).length,["pulls"]);
 metric("orbit-kpi-milestones",filtered.filter(i=>i.type==="milestone").length,["milestones"]);
 metric("orbit-kpi-commits",filtered.filter(i=>i.type==="commit").length,["commits"]);
}
function paint(){
 const table=$("orbit-grid"),scroller=$("orbit-scroll"),focus=document.activeElement?.dataset?.key,scrollX=scroller.scrollLeft,scrollY=scroller.scrollTop;
 const items=context.data?.timelineItems||[],w=getWindow(),group=$("orbit-group").value;
 const query=$("orbit-search").value,status=$("orbit-status").value,type=types();
 const groups=orbitGroups(items,w,asOf(),{filter:context.filter,type,status,query,group});
 const total=groups.reduce((n,g)=>n+g.rows.length,0);
 const gaps=[...(context.data?.errors||[]),...(context.data?.truncated||[])].filter(e=>!context.filter||e.repo===context.filter);
 const coverage=!!context.data&&(!Number.isFinite(Date.parse(context.data.historySince))||w.startDate<calendarDay(Date.parse(context.data.historySince)));
 $("orbit-window").textContent=dayLabel(w.startDate)+" – "+dayLabel(w.endDate);
 $("orbit-count").textContent=context.data?total+" in view · "+(context.filter||"All repositories"):"Waiting for GitHub";
 $("orbit-coverage").textContent=(context.data?"Observed lifetimes + explicit milestone due dates · bounded sample":"เชื่อมต่อ GitHub เพื่อโหลดข้อมูล")+(coverage?" · earlier history not loaded":"")+(gaps.length?" · "+gaps.length+" incomplete sections (*)":"")+(context.data?" · no record ≠ no activity":"");
 repoChips(items);summary(items);
 table.replaceChildren();table.className="orbit-grid orbit-days-"+w.days;
 const cols=node("colgroup");cols.append(node("col","orbit-name-col"));for(const d of w.dates)cols.append(node("col"));table.append(cols);
 const head=node("thead"),tr=node("tr"),th=node("th","orbit-sticky","GITHUB ITEMS");th.scope="col";tr.append(th);
 for(const d of w.dates){const h=node("th","orbit-date");h.scope="col";if(d===w.today)h.classList.add("orbit-today");if([0,6].includes(weekdayIndex(d)))h.classList.add("orbit-weekend");h.append(node("small","",WEEKDAYS_TH[weekdayIndex(d)]),node("strong","",d.slice(8)),node("small","orbit-month",d.slice(5,7)));h.title=dayLabel(d);tr.append(h);}head.append(tr);table.append(head);
 const body=node("tbody");let displayed=0,remaining=0,selectedItem=null;
 for(const g of groups){
  const key=group+":"+g.key,collapsed=state.collapsed.has(key),r=node("tr","orbit-group-row"),label=node("th","orbit-sticky");label.scope="row";
  const toggle=btn("orbit-group-toggle","",()=>{if(collapsed)state.collapsed.delete(key);else state.collapsed.add(key);paint();});toggle.dataset.key="group:"+key;toggle.setAttribute("aria-expanded",String(!collapsed));
  const name=node("span","orbit-group-copy");name.append(node("strong","",g.title),node("small","",g.rows.length+" items"));
  toggle.append(node("span","orbit-group-mark",collapsed?"+":"−"),name,avatars([...new Set(g.rows.flatMap(i=>i.participants))]));label.append(toggle);r.append(label);
  const first=Math.min(...g.rows.map(i=>i.clipped.first)),last=Math.max(...g.rows.map(i=>i.clipped.last));appendDays(r,w.dates,0,first,w);const span=node("td","orbit-group-span");span.colSpan=last-first+1;span.append(node("span","orbit-span-line"));r.append(span);appendDays(r,w.dates,last+1,w.days,w);body.append(r);
  if(collapsed)continue;
  for(const item of g.rows){
   if(displayed>=state.limit){remaining++;continue;}
   displayed++;const row=node("tr","orbit-task-row"),cell=node("th","orbit-sticky orbit-task-name");cell.scope="row";
   const left=node("div","orbit-task-label"),mark=node("span","orbit-type-mark orbit-"+item.type,colors[item.type]),txt=node("span","orbit-task-text",(item.number==null?"":"#"+item.number+" ")+item.title);txt.title=txt.textContent;
   left.append(mark,txt,avatars(item.participants));cell.append(left);row.append(cell);addBar(row,item,w);body.append(row);
   if(item.id===state.selected)selectedItem=item;
  }
 }
 if(!total){const row=node("tr"),cell=node("td","orbit-empty",context.data?"No loaded items in this date window or filter.":"Waiting for repository data.");cell.colSpan=w.days+1;row.append(cell);body.append(row);}
 table.append(body);$("orbit-more").hidden=remaining===0;$("orbit-more").textContent="Show more ("+remaining+" remaining)";
 if(!selectedItem)state.selected=null;showDetail(selectedItem);
 scroller.scrollLeft=scrollX;scroller.scrollTop=scrollY;
 if(focus){const target=[...table.querySelectorAll("[data-key]")].find(e=>e.dataset.key===focus);target?.focus({preventScroll:true});}
}
export function renderOrbit(data,opts={}){context={data,names:opts.names||[],filter:opts.filter||"",onRepoChange:opts.onRepoChange||(()=>{})};paint();}
export function orbitScope(){return $("orbit-window").textContent+" · "+$("orbit-group").selectedOptions[0].textContent+" · "+$("orbit-type").selectedOptions[0].textContent+" · "+$("orbit-status").selectedOptions[0].textContent+($("orbit-search").value?" · Search: "+$("orbit-search").value:"");}
export function resetOrbit(){
 context={data:null,names:[],filter:"",onRepoChange:()=>{}};
 Object.assign(state,{days:14,offset:0,selected:null,limit:100});state.collapsed.clear();
 $("orbit-range").value="14";$("orbit-group").value="repo";$("orbit-type").value="all";$("orbit-status").value="all";$("orbit-search").value="";
 paint();$("orbit-repos").replaceChildren();
}
export function initOrbit(){
 $("orbit-today").addEventListener("click",()=>{state.offset=0;paint();});
 $("orbit-prev").addEventListener("click",()=>{state.offset=Math.max(-3660,state.offset-state.days);paint();});
 $("orbit-next").addEventListener("click",()=>{state.offset=Math.min(3660,state.offset+state.days);paint();});
 $("orbit-range").addEventListener("change",()=>{state.days=Number($("orbit-range").value);paint();});
 for(const id of ["orbit-group","orbit-type","orbit-status"]){$(id).addEventListener("change",()=>{state.limit=100;state.selected=null;paint();});}
 $("orbit-search").addEventListener("input",()=>{state.limit=100;state.selected=null;paint();});
 $("orbit-more").addEventListener("click",()=>{state.limit+=100;paint();});
}
