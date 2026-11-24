// Pure analytics on the already loaded GitHub sample. No API or persistence.
export const EVENT_TYPES=Object.freeze(["commit","pull","issue","workflow"]);
const SECTION=Object.freeze({commit:"commits",pull:"pulls",issue:"issue_activity",workflow:"workflows"});
const DAY=86400000;
const key=ms=>new Date(ms).toISOString().slice(0,10);
const safeTime=value=>Number.isFinite(Date.parse(value))?Date.parse(value):NaN;
const list=value=>Array.isArray(value)?value:[];
const focusRank=issue=>issue.blocked?0:issue.rank===0?1:issue.rank===1?2:3;
export function analyzeSample(data,{names=[],filter="",days=7,type="all",now=Date.now()}={}){
  days=days===30?30:7;
  type=EVENT_TYPES.includes(type)?type:"all";
  const asOf=Number.isFinite(safeTime(data?.fetchedAt))?safeTime(data.fetchedAt):now;
  const endDay=Date.parse(key(asOf)+"T00:00:00Z"),start=endDay-(days-1)*DAY;
  const dates=Array.from({length:days},(_,i)=>key(start+i*DAY));
  const candidates=[...names,...list(data?.repositories).map(r=>r.name),...list(data?.activity).map(e=>e.repo),...list(data?.issues).map(e=>e.repo),...list(data?.errors).map(e=>e.repo)];
  const scope=[...new Set(candidates.filter(n=>typeof n==="string"&&n&&(!filter||n===filter)))];
  const allowed=new Set(scope),errors=list(data?.errors).filter(e=>allowed.has(e.repo));
  const observed=list(data?.activity).filter(e=>allowed.has(e.repo)&&EVENT_TYPES.includes(e.type)&&safeTime(e.at)>=start&&safeTime(e.at)<=asOf).sort((a,b)=>safeTime(b.at)-safeTime(a.at));
  const filtered=observed.filter(e=>type==="all"||e.type===type);
  const issueSample=list(data?.issues).filter(i=>allowed.has(i.repo));
  const focus=issueSample.filter(i=>i.blocked||i.rank===0||i.rank===1).sort((a,b)=>focusRank(a)-focusRank(b)||(safeTime(b.updatedAt)||0)-(safeTime(a.updatedAt)||0));
  const breakdown=[0,1,2,3,4].map(rank=>({label:rank===4?"Unclassified":"P"+rank,count:issueSample.filter(i=>([0,1,2,3].includes(i.rank)?i.rank:4)===rank).length}));
  const blocked=issueSample.filter(i=>i.blocked).length;
  const missing=(repo,sections)=>errors.some(e=>e.repo===repo&&(e.section==="repository"||sections.includes(e.section)));
  const loadedNames=new Set(list(data?.repositories).map(r=>r.name));
  const timelineSections=type==="all"?Object.values(SECTION):[SECTION[type]];
  const daily=dates.map(date=>{
    const events=filtered.filter(e=>key(safeTime(e.at))===date);
    return {date,total:events.length,counts:Object.fromEntries(EVENT_TYPES.map(t=>[t,events.filter(e=>e.type===t).length]))};
  });
  const projects=scope.map(name=>{
    const events=observed.filter(e=>e.repo===name),visible=filtered.filter(e=>e.repo===name);
    const cells=dates.map(date=>({date,events:visible.filter(e=>key(safeTime(e.at))===date)}));
    const latestWorkflow=events.find(e=>e.type==="workflow")||null;
    return {name,loaded:loadedNames.has(name),total:events.length,visibleTotal:visible.length,latest:events[0]||null,cells,
      timelinePartial:!loadedNames.has(name)||missing(name,timelineSections),
      activityPartial:!loadedNames.has(name)||missing(name,Object.values(SECTION)),
      issuesPartial:!loadedNames.has(name)||missing(name,["issues"]),
      workflowPartial:!loadedNames.has(name)||missing(name,["workflows"]),latestWorkflow};
  });
  return {dates,days,type,asOf,projects,daily,filteredTotal:filtered.length,observedTotal:observed.length,active:projects.filter(r=>r.total>0).length,focus,breakdown,blocked,
    issueTotal:issueSample.length,issuePartial:projects.some(p=>p.issuesPartial),activityPartial:projects.some(p=>p.activityPartial),timelinePartial:projects.some(p=>p.timelinePartial),errors,loadedCount:projects.filter(p=>p.loaded).length};
}
export function heatClass(count,partial=false){return count>=4?"heat-3":count>=2?"heat-2":count===1?"heat-1":partial?"heat-unknown":"heat-0";}
export function workflowTone(status){
  if(status==="success")return "signal-success";
  if(["failure","timed_out","action_required","startup_failure"].includes(status))return "signal-failure";
  if(["queued","in_progress","requested","waiting","pending"].includes(status))return "signal-pending";
  return "signal-neutral";
}
