// Explainable portfolio triage. No productivity, skill or risk scores; no network.
const DAY=86400000;
const list=x=>Array.isArray(x)?x:[];
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const validRepo=r=>typeof r==="string"&&/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(r)&&!r.split("/").some(x=>x==="."||x==="..");
export const INSIGHT_RULES=Object.freeze({openPrDays:7,slowCycleHours:72,minCycleSample:3});
export const INSIGHT_CATEGORIES=Object.freeze({act:"Act",review:"Review",verify:"Verify",observed:"Observed"});
const order={act:0,review:1,verify:2,observed:3};
const failures=new Set(["failure","timed_out","startup_failure","action_required"]);
export function safeInsightSource(raw,repo,kind){
 if(!validRepo(repo))return null;
 try{
  const u=new URL(raw),p=u.pathname.split("/").filter(Boolean);
  if(u.protocol!=="https:"||u.hostname!=="github.com"||u.port||u.username||u.password||u.search||u.hash||p.slice(0,2).join("/").toLowerCase()!==repo.toLowerCase())return null;
  const valid=kind==="workflow"?p.length===5&&p[2]==="actions"&&p[3]==="runs"&&/^[1-9]\d*$/.test(p[4]):
   p.length===4&&p[2]===(kind==="issue"?"issues":"pull")&&/^[1-9]\d*$/.test(p[3]);
  return valid?u.href:null;
 }catch{return null;}
}
function repoUrl(repo){return validRepo(repo)?"https://github.com/"+repo.split("/").map(encodeURIComponent).join("/"):null;}
function middle(values){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;}
const fmt=v=>Number(v.toFixed(1)).toString();
export function buildInsights(data,m,comparison=null){
 const scope=list(m?.scope).filter(validRepo),asOf=m?.range?.asOf,start=m?.range?.start;
 if(!scope.length||!Number.isFinite(asOf)||!Number.isFinite(start))return {findings:[],counts:{act:0,review:0,verify:0,observed:0},practices:[],scope:[]};
 const repos=new Set(scope),records=list(data?.performance).filter(x=>repos.has(x.repo)),issues=list(data?.issues).filter(x=>repos.has(x.repo));
 const errors=list(m.errors),caps=list(m.caps),findings=[];
 const inWindow=x=>time(x.at)>=start&&time(x.at)<=asOf;
 const partial=(repo,section,historical=true)=>errors.some(e=>e.repo===repo&&e.section===section)||caps.some(e=>e.repo===repo&&e.section===section)||(historical&&m.historyGap);
 function add(repo,key,category,title,evidence,action,limitation,source=null){
  findings.push({id:(repo||"portfolio")+":"+key,repo,key,category,title,evidence,action,limitation,source:source||repoUrl(repo)});
 }
 for(const repo of scope){
  const own=records.filter(r=>r.repo===repo),q=issues.filter(i=>i.repo===repo);
  const blocked=q.filter(i=>i.blocked===true),urgent=q.filter(i=>i.blocked!==true&&Number.isInteger(i.rank)&&i.rank>=0&&i.rank<=1);
  if(blocked.length||urgent.length){
   const first=blocked[0]||urgent[0];
   add(repo,"queue","act","Triage blocked / high-priority issues",blocked.length+" blocked · "+urgent.length+" other P0/P1 open issues",
    "ตรวจสอบ Issue ต้นทาง ระบุผู้รับผิดชอบและสิ่งที่ติดขัด แล้วกำหนดขั้นตอนแก้ไขถัดไป",
    "Current open-issue snapshot; label-based"+(partial(repo,"issues",false)?" · partial sample":"")+"; blocked และ P0/P1 นับแยกไม่ซ้ำ",
    safeInsightSource(first.url,repo,"issue"));
  }
  const bad=own.filter(r=>r.kind==="workflow"&&inWindow(r)&&failures.has(r.conclusion)).sort((a,b)=>time(b.at)-time(a.at));
  if(bad.length){
   const counts=new Map();for(const r of bad)counts.set(r.conclusion,(counts.get(r.conclusion)||0)+1);
   add(repo,"workflow","act","Inspect unsuccessful workflow runs",bad.length+" observed runs · "+[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+" "+v).join(" · "),
    "เปิด Actions run ตรวจ log และพิจารณาแก้ปัญหาหรือ rerun หลังทราบสาเหตุ",
    "Terminal workflow updates in selected period; not proof the latest deployment is broken"+(partial(repo,"workflows")?" · partial sample":""),
    safeInsightSource(bad[0].source,repo,"workflow"));
  }
  const old=own.filter(r=>r.kind==="open_pr"&&Number.isFinite(time(r.createdAt))&&asOf-time(r.createdAt)>=INSIGHT_RULES.openPrDays*DAY).sort((a,b)=>time(a.createdAt)-time(b.createdAt));
  if(old.length)add(repo,"open_pr","review","Review long-open pull requests",
    old.length+" currently open PRs ≥ "+INSIGHT_RULES.openPrDays+" days · oldest "+Math.floor((asOf-time(old[0].createdAt))/DAY)+" full days",
    "ตรวจสอบความพร้อม Merge, draft status, review และ blocker ที่ยังค้าง",
    "Current sampled open PRs; age from created_at; threshold is a triage heuristic, not an SLA"+(partial(repo,"pulls",false)?" · partial sample":""),
    safeInsightSource(old[0].source,repo,"pull"));
  const merged=own.filter(r=>r.kind==="merged_pr"&&inWindow(r)),cycles=merged.filter(r=>typeof r.cycleHours==="number"&&Number.isFinite(r.cycleHours)&&r.cycleHours>=0);
  const med=middle(cycles.map(r=>r.cycleHours));
  if(cycles.length>=INSIGHT_RULES.minCycleSample&&med>=INSIGHT_RULES.slowCycleHours)add(repo,"cycle","review","Inspect PR delivery cycle",
    "Median "+fmt(med)+" h · "+cycles.length+"/"+merged.length+" merged PRs with valid timestamps",
    "สำรวจเวลารอ Review, CI และขนาดงานผ่าน PR ตัวอย่าง ก่อนสรุปคอขวด",
    "Creation-to-merge elapsed time, not active work time; ≥72 h and ≥3 valid PRs are review thresholds"+(partial(repo,"pulls")||cycles.length!==merged.length?" · partial timestamps/sample":""),
    safeInsightSource([...cycles].sort((a,b)=>b.cycleHours-a.cycleHours)[0].source,repo,"pull"));
  const completed=own.filter(r=>r.kind==="completed_issue"&&inWindow(r)).length;
  if(merged.length||completed)add(repo,"delivery","observed","Delivery recorded",merged.length+" merged PRs · "+completed+" completed issues",
    "ตรวจสอบผลส่งมอบกับ Milestone หรือ acceptance criteria ที่เกี่ยวข้อง",
    "Separate observed record counts; no inference of business value or total completed work"+(partial(repo,"pulls")||partial(repo,"issue_activity")?" · partial sample":""));
  const success=own.filter(r=>r.kind==="workflow"&&inWindow(r)&&r.conclusion==="success").length;
  if(success&&!bad.length&&!partial(repo,"workflows")){
   const total=own.filter(r=>r.kind==="workflow"&&inWindow(r)).length;
   add(repo,"runs","observed","Successful workflow runs observed",success+"/"+total+" completed runs successful",
    "ใช้ run ที่สำเร็จเป็นหลักฐานประกอบการตรวจสอบ delivery แต่ยังต้องตรวจขอบเขต test และ deployment",
    "No recorded adverse outcome in loaded sample; not a test coverage or production-health assessment");
  }
  const missing=errors.filter(e=>e.repo===repo),limited=caps.filter(e=>e.repo===repo);
  if(missing.length||limited.length)add(repo,"coverage","verify","Check data coverage",
   (missing.length?"Unavailable: "+[...new Set(missing.map(e=>e.section))].sort().join(", "):"")+(missing.length&&limited.length?" · ":"")+(limited.length?"Capped: "+[...new Set(limited.map(e=>e.section))].sort().join(", "):""),
   "ตรวจสิทธิ์ Read-only PAT, ขอบเขต Repo และข้อจำกัด API; ใช้ Refresh หรือ Load comparison history ตามความจำเป็น",
   "Coverage warning only; not evidence of missing development activity");
 }
 if(m.historyGap)add(null,"history","verify","History window is incomplete",
  m.range.startDate+" – "+m.range.endDate+" · requested history is not fully loaded",
  "โหลดข้อมูลใหม่หรือใช้ช่วงที่สั้นลงก่อนเปรียบเทียบแนวโน้ม",
  "Date coverage describes request boundaries, not a guarantee of complete GitHub history");
 const observed=list(m.contributions).filter(r=>r.kind==="commit"||r.kind==="merged_pr"),unknown=observed.filter(r=>!list(r.declared).length);
 if(unknown.length)add(null,"attribution","verify","Improve attribution metadata",
  unknown.length+"/"+observed.length+" observed commit/merged PR records lack explicit declarations",
  "ใช้ AI-Agent: Codex (หรือชื่อ Agent จริง) ใน commit trailer หรือ ai-agent:… ใน PR label เมื่อต้องการประกาศการใช้ Agent",
  "Different record types combined only for metadata coverage; lack of declaration does not imply human authorship");
 for(const k of ["cycle","rate"]){
  const v=list(comparison?.metrics).find(x=>x.key===k);
  if(!v||![v.delta,v.current,v.previous].every(x=>typeof x==="number"&&Number.isFinite(x)))continue;
  if(k==="cycle"?v.delta>=24:v.delta<=-10)add(null,"compare_"+k,"review",k==="cycle"?"Review longer median PR cycles":"Review lower workflow success share",
   fmt(v.previous)+(k==="cycle"?" h":"%")+" → "+fmt(v.current)+(k==="cycle"?" h":"%")+" · change "+(v.delta>0?"+":"")+fmt(v.delta)+(k==="cycle"?" h":" pp"),
   k==="cycle"?"เปรียบเทียบขนาดและประเภทของ PR ระหว่างสองช่วงก่อนสรุปสาเหตุ":"ตรวจ denominator และผลลัพธ์แต่ละ run รวมถึง cancelled/skipped ก่อนสรุปสาเหตุ",
   "Comparable bounded samples; thresholds +24 h / −10 pp are review prompts, not KPI targets or causal inference");
 }
 const rootProfiles=list(m.repos).filter(r=>repos.has(r.repo)&&r.root&&!r.root.capped&&!partial(r.repo,"root_metadata",false));
 const practices=[["testing","Testing","ตรวจ test suite และวิธีรัน test จริง รวมถึงโฟลเดอร์ย่อยหรือ monorepo"],
  ["security","Security","ตรวจนโยบาย security, dependency scanning และ secret scanning ที่มีอยู่จริง"],
  ["devops","DevOps","ตรวจ pipeline, deployment workflow และ infrastructure configuration"],
  ["docs","Documentation","ตรวจ README, runbook, API docs และคู่มือสำหรับผู้ดูแล"]].map(([key,label,action])=>{
   const present=rootProfiles.filter(r=>list(r.root.domains).some(d=>d.key===key&&list(d.markers).length)).map(r=>r.repo);
   return {key,label,present,review:rootProfiles.map(r=>r.repo).filter(n=>!present.includes(n)),scanned:rootProfiles.length,selected:scope.length,action};
 });
 findings.sort((a,b)=>order[a.category]-order[b.category]||(a.repo||"").localeCompare(b.repo||"")||a.key.localeCompare(b.key));
 const counts={act:0,review:0,verify:0,observed:0};for(const row of findings)counts[row.category]++;
 return {findings,counts,practices,scope};
}
