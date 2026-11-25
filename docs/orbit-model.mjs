// Orbit timeline: observed lifetimes, explicit milestone due dates and point events.
// No estimated task progress or dates; all calendar geometry uses Asia/Bangkok.
import {calendarDay} from "./period.mjs";
const DAY=86400000;
const clean=(v,n=300)=>typeof v==="string"?v.slice(0,n):"";
const date=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export const ORBIT_TYPES=Object.freeze(["milestone","issue","pull","commit"]);
export const ORBIT_NAMES=Object.freeze({milestone:"Milestones",issue:"Issues",pull:"Pull requests",commit:"Commits"});
export const ORBIT_STATUS=Object.freeze({open:"Open",draft:"Draft",blocked:"Blocked",completed:"Completed",merged:"Merged",closed:"Closed",commit:"Commit"});
const participants=(...users)=>[...new Set(users.flat().map(u=>clean(u?.login,39)).filter(Boolean))].slice(0,10);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const isBlocked=i=>(Array.isArray(i.labels)?i.labels:[]).some(x=>/^(blocked|status:\s*blocked)$/i.test(String(x?.name??x).trim()));
const identity=i=>i.number??i.id??i.sha??i.html_url;
function lifetime(x){
 const created=date(x.created_at),updated=date(x.updated_at),closed=date(x.closed_at);
 if(!created)return {startAt:updated,endAt:updated,basis:"Latest update only (creation unavailable)"};
 return {startAt:created,endAt:x.state==="closed"?(closed||updated||created):null,basis:x.state==="closed"?(closed?"Created → closed":"Created → last observed update"):"Created → snapshot (open)"};
}
export function normalizeOrbit(repo,{commits=[],issueList=[],openIssues=[],pulls=[],milestones=[]}={}){
 const items=new Map();
 function add(type,x,fields){
  const key=identity(x);
  if(key==null||!fields.startAt)return;
  const id=repo+":"+type+":"+String(key);
  items.set(id,{id,repo,type,number:Number.isSafeInteger(x.number)?x.number:null,title:clean(x.title||x.commit?.message?.split("\n")[0])||"Untitled",url:clean(x.html_url,2048),participants:participants(x.assignees||[],x.user||x.author),progress:null,...fields});
 }
 // Prefer the current open-issue sample over older activity records, keyed per repo.
 for(const raw of [...(issueList||[]),...(openIssues||[]).map(x=>({...x,state:x.state||"open"}))]){
  if(raw.pull_request)continue;
  add("issue",raw,{...lifetime(raw),status:raw.state==="closed"?(raw.state_reason==="completed"?"completed":"closed"):isBlocked(raw)?"blocked":"open"});
 }
 for(const p of pulls||[]){
  const merged=date(p.merged_at);
  const span=lifetime(p);
  add("pull",p,{...span,...(merged&&span.startAt?{endAt:merged,basis:"Created → merged"}:{}),status:merged?"merged":p.state==="closed"?"closed":p.draft?"draft":"open"});
 }
 for(const m of milestones||[]){
  const created=date(m.created_at),due=date(m.due_on),closed=date(m.closed_at);
  const start=created||date(m.updated_at)||due;
  const validDue=due&&start&&Date.parse(due)>=Date.parse(start);
  const n=m.open_issues,c=m.closed_issues,total=count(n)&&count(c)?n+c:0;
  add("milestone",m,{startAt:start,endAt:validDue?due:m.state==="closed"?(closed||date(m.updated_at)||start):null,
   basis:validDue?"Created → milestone due date":m.state==="closed"?"Observed milestone lifetime (no usable due date)":"Created → snapshot (no usable due date)",
   status:m.state==="closed"?"closed":"open",dueAt:due,closedAt:closed,progress:total>0?Math.round(c/total*100):null,
   counts:count(n)&&count(c)?{open:n,closed:c}:null,participants:participants(m.creator)});
 }
 for(const c of commits||[]){
  const at=date(c.commit?.committer?.date);
  add("commit",c,{startAt:at,endAt:at,basis:"Committer date · default branch",status:"commit"});
 }
 return [...items.values()];
}
export function orbitWindow(asOf,days=14,offset=0){
 const d=[7,14,28].includes(Number(days))?Number(days):14;
 const ms=Number.isFinite(asOf)?asOf:Date.now();
 const today=calendarDay(ms),todayMs=Date.parse(today+"T00:00:00Z");
 const end=todayMs+(2+Math.max(-3660,Math.min(3660,Math.trunc(offset)||0)))*DAY;
 const start=end-(d-1)*DAY;
 const dates=Array.from({length:d},(_,i)=>new Date(start+i*DAY).toISOString().slice(0,10));
 return {dates,today,startDate:dates[0],endDate:dates.at(-1),days:d};
}
export function clipOrbit(item,window,asOf){
 if(!date(item.startAt))return null;
 const start=calendarDay(Date.parse(item.startAt)),end=calendarDay(item.endAt&&date(item.endAt)?Date.parse(item.endAt):asOf);
 if(end<start||end<window.startDate||start>window.endDate)return null;
 const first=Math.max(0,Math.round((Date.parse(start)-Date.parse(window.startDate))/DAY));
 const last=Math.min(window.days-1,Math.round((Date.parse(end)-Date.parse(window.startDate))/DAY));
 return {first,last,span:last-first+1,before:start<window.startDate,after:end>window.endDate};
}
export function orbitGroups(items,window,asOf,{filter="",type="all",status="all",query="",group="repo"}={}){
 const needle=query.trim().toLowerCase(),map=new Map();
 for(const item of items||[]){
  if(filter&&item.repo!==filter||type!=="all"&&item.type!==type)continue;
  if(status==="active"&&!["open","draft","blocked"].includes(item.status)||status==="complete"&&!["completed","merged"].includes(item.status)||status==="closed"&&item.status!=="closed")continue;
  if(needle&&![item.title,item.repo,item.number==null?"":"#"+item.number,...item.participants].some(v=>String(v).toLowerCase().includes(needle)))continue;
  const clipped=clipOrbit(item,window,asOf);if(!clipped)continue;
  const name=group==="type"?item.type:item.repo;
  if(!map.has(name))map.set(name,[]);
  map.get(name).push({...item,clipped});
 }
 return [...map.entries()].sort(([a],[b])=>group==="type"?ORBIT_TYPES.indexOf(a)-ORBIT_TYPES.indexOf(b):a.localeCompare(b)).map(([key,rows])=>({
  key,title:group==="type"?ORBIT_NAMES[key]:key,
  rows:rows.sort((a,b)=>ORBIT_TYPES.indexOf(a.type)-ORBIT_TYPES.indexOf(b.type)||a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id))
 }));
}
