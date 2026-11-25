import {analyzeSample,EVENT_TYPES,heatClass,workflowTone} from "./analytics.mjs";
import {CALENDAR_ZONE,weekdayIndex,WEEKDAYS_TH,isWeekend} from "./period.mjs";
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
const TYPES=Object.freeze({commit:"Commit",pull:"Pull request",issue:"Issue update",workflow:"Workflow"});
const shortDate=date=>new Intl.DateTimeFormat("th-TH-u-ca-gregory",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"));
const monthLabel=date=>new Intl.DateTimeFormat("th-TH-u-ca-gregory",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"));
const monthShort=date=>new Intl.DateTimeFormat("th-TH-u-ca-gregory",{month:"short",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"));
const dateTime=at=>Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:CALENDAR_ZONE}).format(new Date(at))+" ICT":"—";
const text=(id,value)=>{$(id).textContent=String(value);};
const boxIds=["active-spark","events-spark","timeline-summary","project-timeline","activity-trend","activity-legend","daily-counts","priority-breakdown","active-projects","focus-next","workflow-signals","timeline-detail-list"];
let detail=null;
function setExpandedCard(id=""){
  for(const button of document.querySelectorAll("[data-expand]")){
    const target=$(button.dataset.expand),active=target.id===id;
    target.classList.toggle("is-expanded",active);
    button.setAttribute("aria-expanded",String(active));
    const title=target.querySelector("h2").textContent;
    button.title=(active?"Collapse ":"Expand ")+title;
    button.setAttribute("aria-label",button.title);
  }
}
for(const button of document.querySelectorAll("[data-expand]"))button.addEventListener("click",()=>{
  const target=$(button.dataset.expand),expanded=button.getAttribute("aria-expanded")==="true";
  setExpandedCard(expanded?"":target.id);
  if(!expanded)target.scrollIntoView({block:"nearest",behavior:"instant"});
});

function safeLink(title,href){
  const a=el("a","analysis-link",title||"Untitled");
  try{const u=new URL(href);if(u.protocol==="https:"&&u.hostname==="github.com"&&!u.username&&!u.password){a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";}}catch{}
  return a;
}
function empty(node,message){node.append(el("p","analysis-empty-note muted",message));}
function mark(value,partial){return String(value)+(partial?"*":"");}
function bar(value,max,cls){
  const meter=el("meter","analysis-meter "+cls);meter.min=0;meter.max=Math.max(1,max);meter.value=value;meter.setAttribute("aria-label",value+" of "+max+" observed records");meter.textContent=value+" / "+max;return meter;
}
function displayDetail(model,repo,date){
  const cell=model.projects.find(p=>p.name===repo)?.cells.find(c=>c.date===date);
  detail=cell?.events.length?{repo,date,unit:model.unit}:null;
  const out=$("timeline-detail-list"),summary=$("timeline-summary");out.replaceChildren();summary.replaceChildren();summary.hidden=!detail;
  $("timeline-clear").hidden=!detail;
  for(const button of $("project-timeline").querySelectorAll("button[data-day]"))button.setAttribute("aria-pressed",String(!!detail&&button.dataset.day===date&&button.dataset.repo===repo));
  if(!detail){text("timeline-detail-title","เลือกช่องกิจกรรม");empty(out,"กดช่องที่มีจำนวนกิจกรรมเพื่อดูรายการ");return;}
  text("timeline-detail-title",repo+" · "+(model.unit==="month"?monthLabel(date):shortDate(date))+" · "+cell.events.length+" events");
  for(const type of EVENT_TYPES){const chip=el("div","summary-chip type-"+type);chip.append(el("span","",TYPES[type]),el("strong","",cell.events.filter(e=>e.type===type).length));summary.append(chip); }
  for(const event of cell.events){
    const row=el("div","analysis-event"),label=el("span","event-type type-"+event.type,TYPES[event.type]);
    const body=el("div","analysis-event-body");body.append(safeLink(event.title,event.url),el("p","muted",dateTime(event.at)+(event.status?" · "+event.status:"")));
    row.append(label,body);out.append(row);
  }
}
function renderTimeline(model){
  const table=$("project-timeline"),monthly=model.unit==="month",grouped=!monthly&&model.monthGroups.length>1;
  table.replaceChildren();table.classList.toggle("timeline-30",!monthly&&model.dates.length>=30);
  table.classList.toggle("timeline-monthly",monthly);table.classList.toggle("timeline-grouped",grouped);
  $("weekend-legend").hidden=monthly;
  text("timeline-granularity","กิจกรรม"+(monthly?"รายเดือน":"รายวัน")+" แยกตาม Repository · เวลาไทย");
  text("timeline-selected-label",monthly?"SELECTED MONTH":"SELECTED DAY");
  const head=el("thead"),hr=el("tr"),repo=el("th","timeline-repo","Repository");repo.scope="col";
  if(grouped){
    const first=el("colgroup");first.span=1;table.append(first);
    const months=el("tr","timeline-month-row");repo.rowSpan=2;months.append(repo);
    for(const group of model.monthGroups){const col=el("colgroup");col.span=group.span;table.append(col);const th=el("th","timeline-month-group",monthLabel(group.date));th.colSpan=group.span;th.scope="colgroup";months.append(th);}
    head.append(months);
  }else hr.append(repo);
  for(const date of model.dates){
    const weekend=!monthly&&isWeekend(date),th=el("th","timeline-date"+(weekend?" timeline-weekend":""));th.scope="col";th.title=monthly?monthLabel(date):shortDate(date)+" · "+WEEKDAYS_TH[weekdayIndex(date)];
    th.append(el("span","timeline-date-number",monthly?monthShort(date):String(Number(date.slice(8)))),el("span","timeline-weekday",monthly?date.slice(0,4):WEEKDAYS_TH[weekdayIndex(date)]));
    if(!monthly&&date.endsWith("-01"))th.classList.add("timeline-month-start");
    hr.append(th);
  }
  head.append(hr);table.append(head);
  const body=el("tbody");
  for(const project of model.projects){
    const row=el("tr"),label=el("th","timeline-repo");label.scope="row";label.append(el("span","timeline-name",project.name),el("small","muted",project.visibleTotal+" observed"+(project.timelinePartial?" · partial":"")));row.append(label);
    for(const cell of project.cells){
      const td=el("td","timeline-cell"+(!monthly&&isWeekend(cell.date)?" timeline-weekend":"")+(!monthly&&cell.date.endsWith("-01")?" timeline-month-start":"")),count=cell.events.length;
      const description=project.name+" · "+(monthly?monthLabel(cell.date):shortDate(cell.date))+" ICT · "+(count?count+" observed events":project.timelinePartial?"data unavailable or partial":"no observed record")+(count&&project.timelinePartial?" · partial":"");
      if(count){
        const button=el("button","heat-cell "+heatClass(count,project.timelinePartial),count+(project.timelinePartial?"*":""));button.type="button";button.dataset.repo=project.name;button.dataset.day=cell.date;button.setAttribute("aria-label",description);button.setAttribute("aria-pressed","false");button.title=description;button.addEventListener("click",()=>displayDetail(model,project.name,cell.date));td.append(button);
      }else{
        const cellLabel=el("span","heat-cell "+heatClass(0,project.timelinePartial),project.timelinePartial?"?":"·");cellLabel.title=description;cellLabel.setAttribute("aria-label",description);td.append(cellLabel);
      }
      row.append(td);
    }body.append(row);
  }table.append(body);
  displayDetail(model,detail?.unit===model.unit?detail.repo:undefined,detail?.unit===model.unit?detail.date:undefined);
  $("timeline-clear").onclick=()=>displayDetail(model);
}
const NS="http://www.w3.org/2000/svg";
function svgNode(tag,attrs={},value){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(value!==undefined)n.textContent=String(value);return n;}
function renderSparkline(id,values,dates,label,partial,unit="day"){
  const node=$(id);node.replaceChildren();
  const max=Math.max(1,...values),w=104,h=36;
  const svg=svgNode("svg",{viewBox:"0 0 "+w+" "+h,role:"img","aria-label":label+" "+(unit==="month"?"monthly":"daily")+" observed counts"+(partial?", partial data":"")+": "+values.join(", ")});
  svg.append(svgNode("title",{},label+" · "+dates.map((date,i)=>date+": "+values[i]).join(" · ")));
  svg.append(svgNode("line",{x1:3,y1:h-4,x2:w-3,y2:h-4,class:"spark-baseline"}));
  const points=values.map((v,i)=>[3+(w-6)*i/Math.max(1,values.length-1),h-4-(h-10)*v/max]);
  svg.append(svgNode("polyline",{points:points.map(p=>p.join(",")).join(" "),class:"spark-path",fill:"none","stroke-linecap":"round","stroke-linejoin":"round"}));
  if(points.length){const last=points.at(-1);svg.append(svgNode("circle",{cx:last[0],cy:last[1],r:2.4,class:"spark-point"}));}
  node.append(svg,el("span","spark-caption",(unit==="month"?"Monthly sample":"Daily sample")+(partial?"*":"")));
}
function renderTrend(model){
  const root=$("activity-trend"),legend=$("activity-legend"),daily=$("daily-counts");root.replaceChildren();legend.replaceChildren();daily.replaceChildren();
  const monthly=model.unit==="month";text("activity-chart-title",monthly?"Monthly Activity":"Daily Activity");text("activity-count-label",monthly?"Monthly counts":"Daily counts");
  const types=model.type==="all"?EVENT_TYPES:[model.type],max=Math.max(1,...model.daily.map(d=>d.total));
  if(!model.filteredTotal){empty(root,model.timelinePartial?"ยังไม่มีรายการที่โหลดได้ (ข้อมูลบางส่วนไม่พร้อมใช้งาน)":"ไม่พบกิจกรรมที่โหลดได้ในช่วงเวลานี้");}
  else{
    const w=model.days===7?460:Math.max(620,model.days*12),h=248,x0=32,y0=199,plotW=w-46,plotH=165,step=plotW/model.days,bw=Math.min(44,step*.68);
    const svg=svgNode("svg",{viewBox:"0 0 "+w+" "+h,class:"trend-svg",role:"img","aria-label":(monthly?"Monthly":"Daily")+" observed activity, "+model.days+" "+(monthly?"months":"days")+", ICT, peak "+max+" events. Counts available below."});
    for(const n of [...new Set([0,Math.ceil(max/2),max])].sort((a,b)=>a-b)){const y=y0-n/max*plotH;svg.append(svgNode("line",{x1:x0,y1:y,x2:w-14,y2:y,class:"trend-gridline"}),svgNode("text",{x:x0-7,y:y+4,"text-anchor":"end",class:"trend-label"},n));}
    model.daily.forEach((day,i)=>{
      let bottom=y0;const x=x0+i*step+(step-bw)/2;
      for(const t of types){const count=day.counts[t];if(!count)continue;const height=count/max*plotH;bottom-=height;const r=svgNode("rect",{x,y:bottom,width:bw,height,class:"trend-bar-"+t});r.append(svgNode("title",{},day.date+" · "+TYPES[t]+" · "+count));svg.append(r);}
      if(day.total&&model.days===7)svg.append(svgNode("text",{x:x+bw/2,y:bottom-6,"text-anchor":"middle",class:"trend-total"},day.total));
      if(model.days===7||i===0||i===model.days-1||i%(monthly?Math.max(1,Math.ceil(model.days/8)):7)===0)svg.append(svgNode("text",{x:x0+(i+.5)*step,y:y0+19,"text-anchor":"middle",class:"trend-label"},monthly?day.date.slice(5,7)+"/"+day.date.slice(2,4):day.date.slice(8)));
    });
    svg.append(svgNode("text",{x:w-14,y:239,"text-anchor":"end",class:"trend-label"},monthly?"Month (ICT)":"Day (ICT)"));root.append(svg);
  }
  for(const type of types){const entry=el("span","trend-legend-item");entry.append(el("span","trend-key trend-bar-"+type),el("span","",TYPES[type]));legend.append(entry);}
  const table=el("table","daily-table"),head=el("thead"),hr=el("tr");
  for(const title of [monthly?"Month (ICT)":"Date (ICT)",...types.map(t=>TYPES[t]),"Total"]){const th=el("th","",title);th.scope="col";hr.append(th);}head.append(hr);table.append(head);
  const tb=el("tbody");for(const day of model.daily){const tr=el("tr");for(const value of [monthly?monthLabel(day.date):day.date,...types.map(t=>t in day.counts?day.counts[t]:0),day.total])tr.append(el("td","",value));tb.append(tr);}table.append(tb);daily.append(table);
}
function renderPriority(model){
  const root=$("priority-breakdown");root.replaceChildren();
  const top=el("div","breakdown-total");top.append(el("strong","analysis-number",mark(model.issueTotal,model.issuePartial)),el("span","muted","Open issues in sample"));root.append(top);
  for(const item of model.breakdown){const row=el("div","analysis-bar-row"),label=el("div","analysis-bar-label");label.append(el("span","",item.label),el("strong","",item.count+(model.issueTotal?" ("+Math.round(item.count/model.issueTotal*100)+"%)":"")));row.append(label,bar(item.count,model.issueTotal,"meter-"+item.label.toLowerCase()));root.append(row);}
  root.append(el("div","blocked-line","Blocked: "+mark(model.blocked,model.issuePartial)+" · may overlap priority labels"));
  text("priority-coverage",(model.issuePartial?"* บาง Repository โหลด Open Issue ไม่สำเร็จ · ":"")+"Open Issue snapshot ปัจจุบัน ไม่เปลี่ยนตามตัวกรองช่วงเวลา");
}
function renderProjects(model,onProject){
  const root=$("active-projects");root.replaceChildren();
  const active=[...model.projects].filter(p=>p.total>0).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)).slice(0,8);
  if(!active.length){empty(root,"ไม่พบกิจกรรมที่โหลดได้ในช่วงเวลานี้");return;}
  for(const [index,p] of active.entries()){
    const row=el("div","analysis-bar-row"),label=el("div","analysis-bar-label"),button=el("button","analysis-project-link",p.name);button.type="button";button.setAttribute("aria-label","Filter dashboard to "+p.name);button.addEventListener("click",()=>onProject(p.name));const rank=el("span","project-rank",index+1);label.append(rank,button,el("strong","",mark(p.total,p.activityPartial)));row.append(label,bar(p.total,active[0].total,"meter-project"),el("small","muted","Latest observed · "+dateTime(p.latest?.at)));root.append(row);
  }
}
function renderFocus(model){
  const root=$("focus-next");root.replaceChildren();
  if(!model.focus.length){empty(root,model.issuePartial?"ไม่พบรายการที่โหลดได้ · ข้อมูลบางส่วนไม่พร้อมใช้งาน":"ไม่พบ Issue ที่ติดป้าย Blocked / P0 / P1 ในข้อมูลที่โหลดได้");return;}
  for(const issue of model.focus.slice(0,8)){
    const row=el("div","focus-row"),badge=el("span","focus-badge "+(issue.blocked?"focus-blocked":issue.rank===0?"focus-p0":"focus-p1"),issue.blocked?"Blocked":issue.rank===0?"P0":"P1"),body=el("div","analysis-event-body");
    body.append(safeLink(issue.title,issue.url),el("p","muted",issue.repo+" #"+issue.number+(issue.blocked&&issue.rank<=1?" · P"+issue.rank:"")));row.append(badge,body);root.append(row);
  }
  if(model.focus.length>8)root.append(el("p","analysis-foot","Showing 8 of "+model.focus.length+" observed focus issues. See Priority for all loaded issues."));
}
function renderWorkflows(model){
  const root=$("workflow-signals");root.replaceChildren();
  for(const project of model.projects){
    const w=project.latestWorkflow,status=w?.status||"unknown",card=el("article","workflow-tile"),head=el("div","workflow-head");
    head.append(el("strong","",project.name),el("span","workflow-state "+(w?workflowTone(status):"signal-neutral"),w?status.replaceAll("_"," ")+(project.workflowPartial?"*":""):project.workflowPartial?"Unavailable":"No record"));
    card.append(head);
    if(w)card.append(safeLink(w.title,w.url),el("p","muted",dateTime(w.at)));else card.append(el("p","muted",project.workflowPartial?"Workflow data unavailable":"No workflow update in loaded window"));
    root.append(card);
  }
}
export function resetAnalytics(){
  detail=null;setExpandedCard();
  for(const id of boxIds)$(id).replaceChildren();
  $("analytics-type").value="all";$("dashboard-type").value="all";
  $("timeline-card").hidden=true;$("matrix-empty").hidden=false;
  $("timeline-clear").hidden=true;
  $("timeline-summary").hidden=true;
  $("timeline-clear").onclick=null;
  $("analytics-cards").hidden=true;$("analytics-empty").hidden=false;
  $("analytics-empty").textContent="เชื่อมต่อและโหลด Repository เพื่อดูผลการวิเคราะห์";
  for(const id of ["analytics-active","analytics-total","analytics-focus-total"])text(id,"—");
  text("analytics-active-note","");text("analytics-coverage","กำลังรอข้อมูล Repository");text("analytics-period","Project activity · ICT (UTC+7)");text("priority-coverage","");text("timeline-detail-title","เลือกช่องกิจกรรม");
}
export function renderAnalytics(data,{names=[],filter="",days=7,period=days,onProject=()=>{}}={}){
  if(!data){$("analytics-cards").hidden=true;$("analytics-empty").hidden=false;return;}
  const model=analyzeSample(data,{names,filter,period,type:$("dashboard-type").value});
  text("analytics-period",shortDate(model.startDate)+" – "+shortDate(model.endDate)+" · ICT (UTC+7) · "+(filter||"All monitored projects"));
  text("analytics-coverage",model.loadedCount+" / "+model.projects.length+" repositories loaded"+(model.errors.length?" · "+model.errors.length+" unavailable sections":"")+(model.limited.length?" · "+model.limited.length+" capped sections":"")+(model.coverageGap?" · ยังโหลดประวัติไม่ครบช่วงเวลา":"")+" · bounded sample");
  $("analytics-empty").hidden=model.projects.length>0;$("analytics-cards").hidden=!model.projects.length;
  if(!model.projects.length){$("analytics-empty").textContent="ยังไม่มี Repository ในขอบเขตที่เลือก · ใช้ Manage repositories";return;}
  text("analytics-active",mark(model.active,model.activityPartial));text("analytics-active-note","of "+model.projects.length+" monitored projects · observed activity");
  text("analytics-total",mark(model.observedTotal,model.activityPartial));text("analytics-focus-total",mark(model.focus.length,model.issuePartial));
  const all=model.type==="all"?model:analyzeSample(data,{names,filter,period,type:"all"});
  renderSparkline("active-spark",all.dates.map((_,i)=>all.projects.filter(p=>p.cells[i].events.length>0).length),all.dates,"Active repositories",all.activityPartial,all.unit);
  renderSparkline("events-spark",all.daily.map(d=>d.total),all.dates,"Observed events",all.activityPartial,all.unit);
  renderTrend(model);renderPriority(model);renderProjects(model,onProject);renderFocus(model);renderWorkflows(model);
}

// The matrix belongs only to Timeline; the dashboard trend has an independent type filter.
export function renderActivityMatrix(data,{names=[],filter="",period="7"}={}){
  if(!data){$("timeline-card").hidden=true;$("matrix-empty").hidden=false;return;}
  const model=analyzeSample(data,{names,filter,period,type:$("analytics-type").value});
  $("timeline-card").hidden=!model.projects.length;$("matrix-empty").hidden=!!model.projects.length;
  if(!model.projects.length){detail=null;$("project-timeline").replaceChildren();$("timeline-summary").replaceChildren();$("timeline-detail-list").replaceChildren();$("timeline-summary").hidden=true;return;}
  renderTimeline(model);
}
