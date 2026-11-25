// Evidence-based portfolio analytics. No personal proficiency scores, inferred AI attribution,
// source-file contents, or fabricated history. Dates use the shared Bangkok calendar.
import {periodRange,bucketKey,calendarDay} from "./period.mjs";
const list=x=>Array.isArray(x)?x:[];
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const validNumber=x=>Number.isSafeInteger(x)&&x>=0;
const CONCLUSIONS=new Set(["success","failure","cancelled","skipped","neutral","timed_out","action_required","stale","startup_failure"]);
const identity=x=>x?.sha??x?.id??x?.number??x?.html_url;
const markerRules=Object.freeze([
 {key:"frontend",label:"Frontend",markers:["frontend","client","web","vite.config.js","vite.config.ts","next.config.js","next.config.mjs","next.config.ts","nuxt.config.ts","angular.json","svelte.config.js","astro.config.mjs"]},
 {key:"backend",label:"Backend",markers:["backend","server","api","artisan","manage.py","wsgi.py","asgi.py","pom.xml","build.gradle","build.gradle.kts"]},
 {key:"devops",label:"DevOps",markers:["dockerfile","docker-compose.yml","docker-compose.yaml","compose.yml","compose.yaml","k8s","kubernetes","terraform","jenkinsfile",".gitlab-ci.yml"]},
 {key:"testing",label:"Testing",markers:["test","tests","__tests__","pytest.ini","phpunit.xml","phpunit.xml.dist","vitest.config.ts","vitest.config.js","jest.config.js","jest.config.ts","playwright.config.ts"]},
 {key:"security",label:"Security",markers:["security.md",".semgrep.yml",".semgrep.yaml",".snyk",".gitleaks.toml","bandit.yaml",".bandit"]},
 {key:"data",label:"Database",markers:["database","db","migrations","prisma","alembic","schema.sql","alembic.ini"]},
 {key:"docs",label:"Documentation",markers:["docs","documentation","readme.md","readme.rst","mkdocs.yml","docusaurus.config.js"]},
]);
const manifests=["package.json","composer.json","requirements.txt","pyproject.toml","pipfile","go.mod","cargo.toml","gemfile","pom.xml","build.gradle","build.gradle.kts","deno.json","deno.jsonc"];
export const DOMAINS=Object.freeze(markerRules.map(({key,label})=>Object.freeze({key,label})));
export function normalizeLanguages(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const entries=Object.entries(raw);
 if(entries.some(([k,v])=>!k||k.length>80||!validNumber(v)))return null;
 return entries.filter(([,v])=>v>0).map(([name,bytes])=>({name,bytes})).sort((a,b)=>b.bytes-a.bytes||a.name.localeCompare(b.name));
}
export function normalizeRoot(raw){
 if(!Array.isArray(raw)||raw.some(e=>!e||typeof e.name!=="string"||typeof e.type!=="string"))return null;
 const names=new Set(raw.filter(e=>["file","dir"].includes(e.type)).map(e=>e.name.toLowerCase()));
 return {domains:markerRules.map(r=>({key:r.key,markers:r.markers.filter(x=>names.has(x))})),manifests:manifests.filter(x=>names.has(x)),capped:raw.length>=1000};
}
export function normalizePerformance(repo,{commits=[],issueList=[],pulls=[],runs=[]}={}){
 const result=new Map();
 function add(kind,x,at,extra={}){
  const id=identity(x);if(id==null||!Number.isFinite(time(at)))return;
  result.set(repo+":"+kind+":"+String(id),{repo,id:repo+":"+kind+":"+String(id),kind,at,...extra});
 }
 for(const c of list(commits))add("commit",c,c.commit?.committer?.date);
 for(const p of list(pulls)){
  const merged=time(p.merged_at),created=time(p.created_at);
  if(Number.isFinite(merged))add("merged_pr",p,p.merged_at,{cycleHours:Number.isFinite(created)&&merged>=created?(merged-created)/3600000:null});
  if(p.state==="open")add("open_pr",p,p.created_at||p.updated_at);
 }
 for(const i of list(issueList))if(!i.pull_request&&i.state==="closed"&&i.state_reason==="completed")add("completed_issue",i,i.closed_at);
 for(const w of list(runs))if(w.status==="completed"&&CONCLUSIONS.has(w.conclusion))add("workflow",w,w.updated_at,{conclusion:w.conclusion});
 return [...result.values()];
}
function median(values){
 const n=values.length;if(!n)return null;
 const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(n/2);
 return n%2?sorted[i]:(sorted[i-1]+sorted[i])/2;
}
export function analyzeIntelligence(data,{names=[],filter="",period="7",now=Date.now()}={}){
 const asOf=Number.isFinite(time(data?.fetchedAt))?time(data.fetchedAt):now,range=periodRange(period,asOf);
 const candidates=[...list(names),...list(data?.repositories).map(r=>r.name),...list(data?.techProfiles).map(r=>r.repo)];
 const scope=[...new Set(candidates.filter(n=>typeof n==="string"&&n&&(!filter||n===filter)))];
 const match=n=>scope.includes(n),errors=list(data?.errors).filter(e=>match(e.repo)),caps=list(data?.truncated).filter(e=>match(e.repo));
 const hasHistory=Array.isArray(data?.performance),historyGap=!Number.isFinite(time(data?.historySince))||time(data.historySince)>range.start;
 function coverage(section,historical=true){
  const errorsFor=errors.filter(e=>e.section===section),capsFor=caps.filter(e=>e.section===section);
  const loaded=hasHistory||!historical?scope.filter(n=>!errorsFor.some(e=>e.repo===n)).length:0;
  return {loaded,selected:scope.length,partial:loaded<scope.length||capsFor.length>0||(historical&&historyGap),capped:capsFor.length};
 }
 const cov={commits:coverage("commits"),pulls:coverage("pulls"),issues:coverage("issue_activity"),workflows:coverage("workflows"),openIssues:coverage("issues",false),openPulls:coverage("pulls",false)};
 const rows=list(data?.performance).filter(r=>match(r.repo)),within=rows.filter(r=>time(r.at)>=range.start&&time(r.at)<=asOf);
 const commits=within.filter(r=>r.kind==="commit"),merged=within.filter(r=>r.kind==="merged_pr"),closed=within.filter(r=>r.kind==="completed_issue"),runs=within.filter(r=>r.kind==="workflow");
 const cycles=merged.map(r=>r.cycleHours).filter(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0);
 const success=runs.filter(r=>r.conclusion==="success").length;
 const activeDays=new Set(commits.map(r=>calendarDay(time(r.at)))).size;
 const openIssues=list(data?.issues).filter(r=>match(r.repo)),openPRs=rows.filter(r=>r.kind==="open_pr"&&time(r.at)<=asOf);
 const series=range.dates.map(date=>({date,commits:0,merged:0,closed:0,workflows:0,success:0}));
 const index=new Map(series.map(d=>[d.date,d]));
 for(const r of within){const d=index.get(bucketKey(time(r.at),range.unit));if(!d)continue;
  if(r.kind==="commit")d.commits++;
  if(r.kind==="merged_pr")d.merged++;
  if(r.kind==="completed_issue")d.closed++;
  if(r.kind==="workflow"){d.workflows++;if(r.conclusion==="success")d.success++;}
 }
 const tech=list(data?.techProfiles).filter(r=>match(r.repo)),rootLoaded=tech.filter(r=>r.root!==null&&r.root!==undefined),langLoaded=tech.filter(r=>Array.isArray(r.languages));
 const langMap=new Map();for(const r of langLoaded)for(const l of r.languages)langMap.set(l.name,(langMap.get(l.name)||0)+l.bytes);
 const totalBytes=[...langMap.values()].reduce((a,b)=>a+b,0);
 const languages=[...langMap.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,bytes])=>({name,bytes,share:totalBytes?bytes/totalBytes*100:0}));
 const domains=DOMAINS.map(({key,label})=>{
  const matching=rootLoaded.filter(r=>list(r.root.domains).some(d=>d.key===key&&list(d.markers).length));
  return {key,label,count:matching.length,total:rootLoaded.length,markers:[...new Set(matching.flatMap(r=>list(r.root.domains).find(d=>d.key===key)?.markers||[]))]};
 });
 const repos=scope.map(repo=>{
  const repoCommits=commits.filter(r=>r.repo===repo),repoMerged=merged.filter(r=>r.repo===repo),repoClosed=closed.filter(r=>r.repo===repo),repoRuns=runs.filter(r=>r.repo===repo);
  const available=section=>!errors.some(e=>e.repo===repo&&e.section===section),partial=section=>caps.some(e=>e.repo===repo&&e.section===section)||historyGap;
  const profile=tech.find(r=>r.repo===repo);
  return {repo,commits:available("commits")?repoCommits.length:null,merged:available("pulls")?repoMerged.length:null,closed:available("issue_activity")?repoClosed.length:null,runs:available("workflows")?repoRuns.length:null,success:repoRuns.filter(r=>r.conclusion==="success").length,
   partial:{commits:partial("commits"),merged:partial("pulls"),closed:partial("issue_activity"),runs:partial("workflows")},
   languages:profile?.languages??null,root:profile?.root??null};
 });
 return {range,scope,cov,errors,caps,historyGap,series,commits:commits.length,merged:merged.length,closed:closed.length,
  cycleHours:median(cycles),cycleN:cycles.length,runTotal:runs.length,runSuccess:success,runRate:runs.length?100*success/runs.length:null,activeDays,
  openIssues:openIssues.length,blocked:openIssues.filter(i=>i.blocked).length,openPRs:openPRs.length,
  languages,totalBytes,domains,rootLoaded:rootLoaded.length,rootCapped:rootLoaded.filter(r=>r.root.capped).length,langLoaded:langLoaded.length,repos};
}
