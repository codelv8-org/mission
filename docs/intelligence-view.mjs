import {analyzeIntelligence} from "./intelligence-model.mjs";
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
const dynamicIds=["intel-trend","intel-trend-table","intel-heat","intel-wip","intel-repos","intel-radar","intel-domains","intel-languages","intel-stack","intel-quality"];
const kpis=["merged","closed","commits","cycle","rate","days"];
export function resetIntelligence(){
 for(const id of dynamicIds)$(id).replaceChildren();
 for(const k of kpis){text("intel-"+k,"—");text("intel-"+k+"-note","");}
 for(const id of ["intel-root-note","intel-language-note"])text(id,"");
 text("intel-period","Shared Period · ICT");text("intel-coverage","เชื่อมต่อ GitHub เพื่อเริ่มวิเคราะห์");
 $("intel-cards").hidden=true;$("intel-empty").hidden=false;
}
export function renderIntelligence(data,opts={}){
 resetIntelligence();if(!data)return;
 const m=analyzeIntelligence(data,opts);
 if(!m.scope.length)return;
 $("intel-empty").hidden=true;$("intel-cards").hidden=false;
 text("intel-period",m.range.startDate+" – "+m.range.endDate+" · ICT · "+(opts.filter||"All selected repositories"));
 text("intel-coverage",m.scope.length+" repositories · "+m.errors.length+" unavailable sections · "+m.caps.length+" capped sections"+(m.historyGap?" · History incomplete":"")+" · Skill evidence is a current snapshot");
 function kpi(key,v,cov,note,suffix=""){text("intel-"+key,value(v,cov,suffix));text("intel-"+key+"-note",note+" · "+coverage(cov));}
 kpi("merged",m.merged,m.cov.pulls,"Actual merge timestamp");kpi("closed",m.closed,m.cov.issues,"state_reason = completed");kpi("commits",m.commits,m.cov.commits,"Default branch");
 kpi("cycle",m.cycleHours,m.cov.pulls,m.cycleN+"/"+m.merged+" merged PRs with valid timestamps"," h");
 kpi("rate",m.runRate,m.cov.workflows,m.runSuccess+"/"+m.runTotal+" completed runs","%");
 kpi("days",m.activeDays,m.cov.commits,"Distinct calendar days with commits");
 drawTrend(m);drawHeat(m);
 for(const [label,v,cov] of [["Open issues",m.openIssues,m.cov.openIssues],["Blocked issues",m.blocked,m.cov.openIssues],["Open PRs",m.openPRs,m.cov.openPulls]]){const row=n("div","intel-queue-row");row.append(n("span","",label),n("strong","",value(v,cov)));$("intel-wip").append(row);}
 const mark=(v,p)=>v===null?"—":num(v)+(p?"*":"");
 table($("intel-repos"),["Repository","Commits","Merged PRs","Completed issues","Workflow success"],m.repos.map(r=>[repoLink(r.repo),mark(r.commits,r.partial.commits),mark(r.merged,r.partial.merged),mark(r.closed,r.partial.closed),r.runs?num(100*r.success/r.runs)+"% ("+r.success+"/"+r.runs+")"+(r.partial.runs?"*":""):"—"]));
 text("intel-root-note",m.rootLoaded+"/"+m.scope.length+" root scans · "+m.rootCapped+" capped");
 drawRadar(m);drawLanguages(m);
 table($("intel-stack"),["Repository","Languages (top 5 by bytes)","Manifest names","Root evidence"],m.repos.map(r=>[repoLink(r.repo),r.languages===null?"Unavailable":r.languages.slice(0,5).map(x=>x.name).join(", ")||"No language bytes",r.root?r.root.manifests.join(", ")||"No matching marker":"Unavailable",r.root?r.root.domains.filter(d=>d.markers.length).map(d=>d.key+": "+d.markers.join(", ")).join(" · ")||"No matching marker":"Unavailable"]));
 const quality=$("intel-quality");
 table(quality,["Source","Loaded / selected","Meaning"],[
  ["Commits",coverage(m.cov.commits),"Committer dates; default branch only"],
  ["Pull requests",coverage(m.cov.pulls),"Merged by actual merged_at; median created_at → merged_at"],
  ["Issues",coverage(m.cov.issues),"Closed with explicit completed reason and closed_at"],
  ["Workflows",coverage(m.cov.workflows),"Latest observed terminal run records by updated_at; success / all known completed conclusions"],
  ["Languages",m.langLoaded+"/"+m.scope.length+" repos","Current GitHub language bytes, not time-based usage"],
  ["Root metadata",m.rootLoaded+"/"+m.scope.length+" repos"+(m.rootCapped?" · capped":""),"Exact root markers; no file contents or proficiency inference"]
 ]);
 if(m.errors.length||m.caps.length){const d=n("details","intel-quality-detail");d.append(n("summary","","Unavailable / capped sources"));for(const e of m.errors)d.append(n("p","muted",e.repo+" · "+e.section+" · "+e.status));for(const e of m.caps)d.append(n("p","muted",e.repo+" · "+e.section+" · sample limit"));quality.append(d);}
}
