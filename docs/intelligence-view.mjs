import {analyzeIntelligence,compareIntelligence} from "./intelligence-model.mjs";
import {analyzeContributions} from "./contribution-model.mjs";
import {buildInsights,INSIGHT_CATEGORIES} from "./insight-model.mjs";
const $=id=>document.getElementById(id);
const n=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;};
const text=(id,v)=>{$(id).textContent=v;};
const num=v=>new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(v);
const value=(v,cov,suffix="")=>v===null||!cov.loaded?"—":num(v)+suffix+(cov.partial?"*":"");
const coverage=c=>c.loaded+"/"+c.selected+" repos · "+(c.partial?"partial sample":"loaded sample");
const empty=(root,s)=>root.append(n("p","muted intel-empty-note",s));
const NS="http://www.w3.org/2000/svg";
function svg(tag,attrs={},txt){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(txt!==undefined)e.textContent=txt;return e;}
function table(root,headers,rows){
 const t=n("table","intel-table"),thead=n("thead"),tr=n("tr");
 for(const h of headers){const th=n("th","",h);th.scope="col";tr.append(th);}thead.append(tr);t.append(thead);
 const body=n("tbody");for(const row of rows){const r=n("tr");row.forEach((v,i)=>{const cell=n(i===0?"th":"td");if(i===0)cell.scope="row";if(v instanceof Node)cell.append(v);else cell.textContent=String(v);r.append(cell);});body.append(r);}t.append(body);root.append(t);
}
function repoLink(repo){const a=n("a","intel-repo-link",repo);if(/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repo)&&!repo.split("/").some(x=>x==="."||x==="..")){a.href="https://github.com/"+repo.split("/").map(encodeURIComponent).join("/");a.target="_blank";a.rel="noopener noreferrer";}return a;}
function meter(value,max,cls,label){const m=n("meter","intel-meter "+cls);m.min=0;m.max=max||1;m.value=value;m.setAttribute("aria-label",label);m.textContent=label;return m;}
function drawTrend(m){
 const root=$("intel-trend"),data=m.series,monthly=m.range.unit==="month";
 text("intel-trend-unit",monthly?"Monthly":"Daily");
 if(!m.cov.pulls.loaded&&!m.cov.issues.loaded){empty(root,"ข้อมูล PR และ Issue ยังไม่พร้อมใช้งาน");return;}
 const width=720,height=210,left=34,right=12,top=12,bottom=29,plotW=width-left-right,plotH=height-top-bottom,step=plotW/Math.max(1,data.length);
 const max=Math.max(1,...data.map(d=>Math.max(d.merged,d.closed)));
 const s=svg("svg",{viewBox:"0 0 "+width+" "+height,role:"img","aria-label":"Observed merged PRs and completed issues, "+(monthly?"monthly":"daily"),class:"intel-trend-svg"});
 for(let i=0;i<=4;i++){const y=top+plotH*i/4;s.append(svg("line",{x1:left,y1:y,x2:width-right,y2:y,class:"intel-gridline"}),svg("text",{x:left-6,y:y+4,"text-anchor":"end",class:"intel-axis"},num(max*(4-i)/4)));}
 for(const [i,d] of data.entries()){
  const x=left+step*(i+.5),barW=Math.min(14,step*.37);
  for(const [j,key] of ["merged","closed"].entries()){const v=d[key];if(!v||!(key==="merged"?m.cov.pulls.loaded:m.cov.issues.loaded))continue;
   const rect=svg("rect",{x:x+(j-1)*barW,y:top+plotH-v/max*plotH,width:Math.max(1,barW-1),height:v/max*plotH,rx:1.5,class:key==="merged"?"intel-bar-pr":"intel-bar-issue"});rect.append(svg("title",{},d.date+" · "+key+" "+v));s.append(rect);
  }
  if(i===0||i===data.length-1||i%Math.max(1,Math.ceil(data.length/8))===0)s.append(svg("text",{x,y:height-9,"text-anchor":"middle",class:"intel-axis"},monthly?d.date.slice(5,7)+"/"+d.date.slice(2,4):d.date.slice(5)));
 }
 root.append(s);
 table($("intel-trend-table"),[monthly?"Month":"Day","Merged PRs","Completed issues"],data.map(d=>[monthly?d.date.slice(0,7):d.date,value(d.merged,m.cov.pulls),value(d.closed,m.cov.issues)]));
}
function drawHeat(m){
 const root=$("intel-heat"),monthly=m.range.unit==="month";
 text("intel-heat-unit",monthly?"Monthly":"Daily");
 if(!m.cov.commits.loaded){empty(root,"ข้อมูล Commit ยังไม่พร้อมใช้งาน");return;}
 const grid=n("div","intel-heat-grid");
 for(const d of m.series){const count=d.commits,level=count>=4?3:count>=2?2:count===1?1:0;
  const cell=n("div","intel-heat-cell "+(count===0&&m.cov.commits.partial?"heat-unknown":"heat-"+level));
  cell.title=d.date+" · "+count+" observed commits"+(m.cov.commits.partial?" · partial":"");
  cell.setAttribute("aria-label",cell.title);cell.append(n("small","",monthly?d.date.slice(0,7):d.date.slice(5)),n("strong","",count===0&&m.cov.commits.partial?"?":count));grid.append(cell);
 }root.append(grid);
}
function drawRadar(m){
 const root=$("intel-radar"),axes=m.domains.filter(d=>d.key!=="docs");
 if(!m.rootLoaded){empty(root,"ยังไม่พบข้อมูล root metadata ที่อ่านได้");return;}
 const cx=160,cy=126,r=80,pt=(i,v=1)=>[cx+Math.sin(i*Math.PI/3)*r*v,cy-Math.cos(i*Math.PI/3)*r*v],coords=scale=>axes.map((_,i)=>pt(i,scale).join(",")).join(" ");
 const s=svg("svg",{viewBox:"0 0 320 250",class:"intel-radar-svg",role:"img","aria-label":"Repository evidence coverage by engineering domain, not personal proficiency"});
 for(const scale of [.25,.5,.75,1])s.append(svg("polygon",{points:coords(scale),class:"intel-radar-grid",fill:"none"}));
 axes.forEach((d,i)=>{const [x,y]=pt(i),[lx,ly]=pt(i,1.34);s.append(svg("line",{x1:cx,y1:cy,x2:x,y2:y,class:"intel-radar-grid"}),svg("text",{x:lx,y:ly+3,"text-anchor":"middle",class:"intel-axis"},d.label));});
 s.append(svg("polygon",{points:axes.map((d,i)=>pt(i,d.count/m.rootLoaded).join(",")).join(" "),class:"intel-radar-area"}));
 axes.forEach((d,i)=>{const [x,y]=pt(i,d.count/m.rootLoaded);s.append(svg("circle",{cx:x,cy:y,r:3.2,class:"intel-radar-point"}));});root.append(s);
 const list=$("intel-domains");
 for(const d of m.domains){const row=n("div","intel-domain-row"),label=n("div","intel-bar-label");label.append(n("strong","",d.label),n("small","",d.count+"/"+d.total+" repos"));row.append(label,meter(d.count,d.total,"intel-evidence-meter",d.label+": "+d.count+" of "+d.total+" scanned repositories"),n("p","muted intel-markers",d.markers.join(" · ")||"No matching root marker observed"));list.append(row);}
}
function drawLanguages(m){
 const root=$("intel-languages");text("intel-language-note",m.langLoaded+"/"+m.scope.length+" repositories loaded · Current repository bytes");
 if(!m.languages.length){empty(root,m.langLoaded?"ไม่มี language bytes ในข้อมูลที่โหลดได้":"ข้อมูล Languages API ยังไม่พร้อมใช้งาน");return;}
 const rows=m.languages.slice(0,12);
 if(m.languages.length>12){const tail=m.languages.slice(12).reduce((sum,d)=>sum+d.bytes,0);rows.push({name:"Other languages",bytes:tail,share:100*tail/m.totalBytes});}
 for(const [i,d] of rows.entries()){
  const row=n("div","intel-lang-row"),label=n("div","intel-bar-label");label.append(n("strong","",d.name),n("small","",num(d.share)+"% · "+num(d.bytes/1024)+" KiB"));row.append(label,meter(d.bytes,m.totalBytes,"intel-language-meter tone-"+i%4,d.name+": "+num(d.share)+"%"));root.append(row);
 }
}


let insightContext=null,insightLimit=8;
const insightLabels={act:"Action signals",review:"Review prompts",verify:"Evidence checks",observed:"Observed delivery"};
const insightIcons={act:"!",review:"↗",verify:"?",observed:"✓"};
function insightLink(item){
 if(!item.source)return null;
 const a=n("a","intel-repo-link","Open evidence on GitHub ↗");
 a.href=item.source;a.target="_blank";a.rel="noopener noreferrer";return a;
}
function drawInsightList(){
 const root=$("intel-insight-list"),filter=$("intel-insight-filter").value;
 root.replaceChildren();if(!insightContext)return;
 const rows=insightContext.findings.filter(row=>filter==="all"||filter===row.category),visible=rows.slice(0,insightLimit);
 for(const item of visible){
  const card=n("article","intel-insight-item insight-"+item.category),head=n("div","intel-insight-head"),left=n("div","intel-insight-title");
  left.append(n("span","intel-insight-badge",INSIGHT_CATEGORIES[item.category]),n("h3","",item.title));
  head.append(left,n("span","intel-insight-repo",item.repo||"Portfolio"));
  card.append(head,n("p","intel-insight-evidence",item.evidence),n("p","intel-insight-action",item.action),n("p","muted intel-foot",item.limitation));
  const source=insightLink(item);if(source)card.append(source);root.append(card);
 }
 if(!visible.length)empty(root,"ไม่พบสัญญาณที่ตรงกับตัวกรองในข้อมูลที่โหลดได้ · ไม่ใช่การรับรองว่าไม่มีปัญหา");
 text("intel-insight-count","Showing "+visible.length+" / "+rows.length+" findings · "+(filter==="all"?"All types":INSIGHT_CATEGORIES[filter]));
 $("intel-insight-more").hidden=rows.length<=visible.length;
}
function drawInsights(data,m,comparison){
 insightContext=buildInsights(data,m,comparison);
 const summary=$("intel-insight-summary");summary.replaceChildren();
 for(const key of ["act","review","verify","observed"]){
  const tile=n("article","card intel-insight-kpi insight-"+key),icon=n("span","intel-insight-icon",insightIcons[key]),copy=n("div","");
  copy.append(n("small","",insightLabels[key]),n("strong","",insightContext.counts[key]),n("span","muted","Rule matches"));
  tile.append(icon,copy);summary.append(tile);
 }
 text("intel-insight-scope",m.scope.length+" repositories · "+m.range.startDate+" – "+m.range.endDate+" ICT · current queue / root snapshot");
 drawInsightList();
 table($("intel-practice-review"),["Practice","Root marker observed","Repositories to verify","Suggested check"],insightContext.practices.map(p=>[p.label,p.present.length+"/"+p.scanned+" scanned · "+(p.selected-p.scanned)+" not assessed",p.review.length?p.review.join(", "):p.scanned?"No root-marker review prompts":"Not assessed",p.action]));
}
$("intel-insight-filter").addEventListener("change",()=>{insightLimit=8;drawInsightList();});
$("intel-insight-more").addEventListener("click",()=>{insightLimit+=12;drawInsightList();});

let contributionContext=null;
function sourceLink(row){
 if(!row.source)return "—";
 const a=n("a","intel-repo-link",row.kind==="commit"?"Commit ↗":"PR ↗");
 // source was already restricted to this repository and record type by normalization.
 a.href=row.source;a.target="_blank";a.rel="noopener noreferrer";return a;
}
function drawContributions(m){
 const kind=$("intel-contribution-kind").value,select=$("intel-contributor");
 const result=analyzeContributions(m.contributions,{kind,actor:select.value});
 select.replaceChildren(new Option("All contributors","all"),...result.contributors.map(c=>new Option(c.label,c.key)));
 select.value=result.actor;
 const cov=result.kind==="commit"?m.cov.commits:m.cov.pulls,scopeLabel=result.kind==="commit"?"Default branch commits":"Merged PRs";
 text("intel-contribution-scope",scopeLabel+" · "+(result.actor==="all"?"All contributors":result.contributors.find(c=>c.key===result.actor)?.label||"All contributors")+" · "+coverage(cov));
 text("intel-contrib-total",value(result.total,cov));text("intel-contrib-declared",value(result.declared,cov));text("intel-contrib-actors",value(result.contributors.filter(c=>c.key!=="unlinked").length,cov));
 text("intel-contrib-note","Linked accounts refer to all contributors for this activity type in the selected repository/period. Explicit declarations include human and unknown/multiple provider markers; unmarked records are not classified as human.");
 const groups=$("intel-agents"),contributors=$("intel-contributors"),evidence=$("intel-evidence");
 groups.replaceChildren();contributors.replaceChildren();evidence.replaceChildren();
 if(!result.total){empty(groups,cov.loaded?"ไม่มีรายการในตัวกรองนี้":"ยังไม่มีข้อมูลที่อ่านได้");}
 else for(const [i,g] of result.groups.entries()){
  const row=n("div","intel-lang-row"),label=n("div","intel-bar-label");
  label.append(n("strong","",g.name),n("small","",g.count+(cov.partial?"*":"")+" · "+num(g.share)+"%"));
  row.append(label,meter(g.count,result.total,"intel-language-meter tone-"+i%4,g.name+": "+g.count+" of "+result.total+" observed records"));
  if(result.kind==="merged_pr")row.append(n("p","muted intel-markers","Median PR cycle: "+(g.cycleHours===null?"—":num(g.cycleHours)+" h")+" · n="+g.cycleN+"/"+g.count));
  groups.append(row);
 }
 if(result.contributors.length){
  const shown=result.contributors.slice(0,100);
  table(contributors,["Account","Records","Declared","Bot records"],shown.map(c=>[c.label,c.count+(cov.partial?"*":""),c.declared,c.bots]));
  if(shown.length<result.contributors.length)contributors.append(n("p","muted intel-foot","Showing "+shown.length+" of "+result.contributors.length+" linked/unlinked actor groups"));
 }else empty(contributors,"ไม่มีรายการ Contributor ที่โหลดได้");
 const visible=result.records.slice(0,50);
 text("intel-evidence-note","Showing "+visible.length+" / "+result.total+" observed records · latest first · ICT");
 if(visible.length)table(evidence,["Date (ICT)","Repository","Account","Attribution","Evidence","Source"],visible.map(r=>[new Date(r.at).toLocaleDateString("en-GB",{timeZone:"Asia/Bangkok"}),repoLink(r.repo),r.actor?"@"+r.actor+" · "+r.account:"Unlinked",r.agent||"Unattributed",(r.evidence||"No explicit agent evidence")+(r.declared?.length?" · "+r.declared.join(" / "):""),sourceLink(r)]));
 else empty(evidence,"ไม่มีหลักฐานที่แสดงได้ในตัวกรอง");
}
for(const id of ["intel-contribution-kind","intel-contributor"]){
 $(id).addEventListener("change",()=>{if(id==="intel-contribution-kind")$("intel-contributor").value="all";if(contributionContext)drawContributions(contributionContext);});
}
function drawComparison(data,m,opts,result=compareIntelligence(data,m,opts)){
 const prev=result.priorRange;
 text("intel-compare-window","Current "+m.range.startDate+" – "+m.range.endDate+" · Previous "+prev.startDate+" – "+prev.endDate+" · ICT");
 text("intel-compare-note",result.historyGap?"ประวัติช่วงก่อนหน้ายังโหลดไม่ครบ · ใช้ Load comparison history เพื่อขอข้อมูลเพิ่มแบบจำกัดจำนวน":"เปรียบเทียบจากประวัติที่โหลดได้ · ขีดจำกัดหรือข้อมูลขาดหายของแต่ละ Endpoint ยังคงแสดงไว้");
 table($("intel-compare"),["Metric","Current","Previous","Change","Coverage"],result.metrics.map(r=>{
  const suffix=r.unit==="h"?" h":r.unit;
  const delta=r.delta===null?"—":(r.delta>0?"+":"")+num(r.delta)+(r.deltaUnit?" "+r.deltaUnit:"");
  return [r.label,value(r.current,r.currentCov,suffix),value(r.previous,r.previousCov,suffix),delta,r.reason];
 }));
}

const dynamicIds=["intel-trend","intel-trend-table","intel-heat","intel-wip","intel-repos","intel-radar","intel-domains","intel-languages","intel-stack","intel-quality","intel-agents","intel-contributors","intel-evidence","intel-compare","intel-insight-summary","intel-insight-list","intel-practice-review","performance-quality"];
const kpis=["merged","closed","commits","cycle","rate","days"];
function clearIntelligence(resetFilters){
 contributionContext=null;insightContext=null;insightLimit=8;
 $("intel-insight-more").hidden=true;text("intel-insight-count","");text("intel-insight-scope","");
 if(resetFilters){$("intel-insight-filter").value="all";$("intel-contribution-kind").value="commit";$("intel-contributor").replaceChildren(new Option("All contributors","all"));}
 for(const id of ["intel-contrib-total","intel-contrib-declared","intel-contrib-actors"])text(id,"—");
 for(const id of ["intel-contribution-scope","intel-contrib-note","intel-evidence-note","intel-compare-window","intel-compare-note"])text(id,"");
 for(const id of dynamicIds)$(id).replaceChildren();
 for(const k of kpis){text("intel-"+k,"—");text("intel-"+k+"-note","");}
 for(const id of ["intel-root-note","intel-language-note"])text(id,"");
 text("intel-period","Shared Period · ICT");text("intel-coverage","เชื่อมต่อ GitHub เพื่อเริ่มวิเคราะห์");
 $("intel-cards").hidden=true;$("intel-empty").hidden=false;
 text("performance-period","Shared Period · ICT");text("performance-coverage","เชื่อมต่อ GitHub เพื่อเริ่มวิเคราะห์");
 $("performance-cards").hidden=true;$("performance-empty").hidden=false;
}
export function resetIntelligence(){clearIntelligence(true);}
// Each page owns its own DOM. Both consume the same normalized data and shared scope.
function drawPerformanceCards(m){
 function kpi(key,v,cov,note,suffix=""){text("intel-"+key,value(v,cov,suffix));text("intel-"+key+"-note",note+" · "+coverage(cov));}
 kpi("merged",m.merged,m.cov.pulls,"Actual merge timestamp");kpi("closed",m.closed,m.cov.issues,"state_reason = completed");kpi("commits",m.commits,m.cov.commits,"Default branch");
 kpi("cycle",m.cycleHours,m.cov.pulls,m.cycleN+"/"+m.merged+" merged PRs with valid timestamps"," h");
 kpi("rate",m.runRate,m.cov.workflows,m.runSuccess+"/"+m.runTotal+" completed runs","%");
 kpi("days",m.activeDays,m.cov.commits,"Distinct calendar days with commits");
 drawTrend(m);drawHeat(m);
 for(const [label,v,cov] of [["Open issues",m.openIssues,m.cov.openIssues],["Blocked issues",m.blocked,m.cov.openIssues],["Open PRs",m.openPRs,m.cov.openPulls]]){const row=n("div","intel-queue-row");row.append(n("span","",label),n("strong","",value(v,cov)));$("intel-wip").append(row);}
 const mark=(v,p)=>v===null?"—":num(v)+(p?"*":"");
 table($("intel-repos"),["Repository","Commits","Merged PRs","Completed issues","Workflow success"],m.repos.map(r=>[repoLink(r.repo),mark(r.commits,r.partial.commits),mark(r.merged,r.partial.merged),mark(r.closed,r.partial.closed),r.runs?num(100*r.success/r.runs)+"% ("+r.success+"/"+r.runs+")"+(r.partial.runs?"*":""):"—"]));
}
function drawAnalyzeCards(data,m,comparison){
 text("intel-root-note",m.rootLoaded+"/"+m.scope.length+" root scans · "+m.rootCapped+" capped");
 drawRadar(m);drawLanguages(m);
 table($("intel-stack"),["Repository","Languages (top 5 by bytes)","Manifest names","Root evidence"],m.repos.map(r=>[repoLink(r.repo),r.languages===null?"Unavailable":r.languages.slice(0,5).map(x=>x.name).join(", ")||"No language bytes",r.root?r.root.manifests.join(", ")||"No matching marker":"Unavailable",r.root?r.root.domains.filter(d=>d.markers.length).map(d=>d.key+": "+d.markers.join(", ")).join(" · ")||"No matching marker":"Unavailable"]));
 drawInsights(data,m,comparison);
 contributionContext=m;drawContributions(m);
}
function drawQuality(m,mode){
 const performance=mode==="performance",quality=$(performance?"performance-quality":"intel-quality");
 const rows=[
  ["Commits",coverage(m.cov.commits),"Committer dates; default branch only"+(performance?"":"; actor from linked GitHub author")],
  ["Pull requests",coverage(m.cov.pulls),"Merged by actual merged_at; median created_at → merged_at"],
  ["Issues",coverage(m.cov.issues),"Closed with explicit completed reason and closed_at"],
  ["Workflows",coverage(m.cov.workflows),"Latest observed terminal run records by updated_at; success / all known completed conclusions"],
  ["Open issues",coverage(m.cov.openIssues),"Current open-issue snapshot; labels determine priority/blocker"],
  ["Open PRs",coverage(m.cov.openPulls),"Current sampled open PRs; not a historical queue count"]
 ];
 if(!performance)rows.push(["Languages",m.langLoaded+"/"+m.scope.length+" repos","Current GitHub language bytes, not time-based usage"],["Root metadata",m.rootLoaded+"/"+m.scope.length+" repos"+(m.rootCapped?" · capped":""),"Exact root markers; no file contents or proficiency inference"]);
 table(quality,["Source","Loaded / selected","Meaning"],rows);
 const relevant=e=>!performance||["repository","commits","pulls","issue_activity","issues","workflows"].includes(e.section);
 const errors=m.errors.filter(relevant),caps=m.caps.filter(relevant);
 if(errors.length||caps.length){const d=n("details","intel-quality-detail");d.append(n("summary","","Unavailable / capped sources"));for(const e of errors)d.append(n("p","muted",e.repo+" · "+e.section+" · "+e.status));for(const e of caps)d.append(n("p","muted",e.repo+" · "+e.section+" · sample limit"));quality.append(d);}
 return {errors:errors.length,caps:caps.length};
}
function renderIntelligencePage(data,opts,mode){
 clearIntelligence(false);if(!data)return;
 const m=analyzeIntelligence(data,opts);if(!m.scope.length)return;
 const performance=mode==="performance",prefix=performance?"performance":"intel";
 $(prefix+"-empty").hidden=true;$(prefix+"-cards").hidden=false;
 text(prefix+"-period",m.range.startDate+" – "+m.range.endDate+" · ICT · "+(opts.filter||"All selected repositories"));
 const comparison=compareIntelligence(data,m,opts);
 if(performance){drawPerformanceCards(m);drawComparison(data,m,opts,comparison);}
 else drawAnalyzeCards(data,m,comparison);
 const quality=drawQuality(m,mode);
 text(prefix+"-coverage",m.scope.length+" repositories · "+quality.errors+" unavailable sections · "+quality.caps+" capped sections"+(m.historyGap?" · History incomplete":"")+(performance?" · Open queue is a current snapshot":" · Skill evidence is a current snapshot"));
}
export function renderIntelligence(data,opts={}){renderIntelligencePage(data,opts,"analyze");}
export function renderPerformance(data,opts={}){renderIntelligencePage(data,opts,"performance");}
