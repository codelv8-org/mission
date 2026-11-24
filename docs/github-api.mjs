// Browser-only, read-only API. No credentials are persisted or sent to another origin.
const API="https://api.github.com";
export const MAX_REPOS=20;
export const MAX_DISCOVERY_PAGES=5;
export const isFineGrainedPAT=value=>typeof value==="string"&&/^github_pat_[A-Za-z0-9_]{20,500}$/.test(value);
export function validRepo(name){return typeof name==="string"&&name.length<=200&&/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(name)&&name.split("/").every(p=>p!=="."&&p!=="..");}
export function priority(labels){
  const names=(Array.isArray(labels)?labels:[]).map(x=>String(x.name||x).toLowerCase().trim());
  const aliases=[["p0","priority:p0","priority:critical","critical","priority: critical"],["p1","priority:p1","priority:high","high","priority: high"],["p2","priority:p2","priority:medium","medium","priority: medium"],["p3","priority:p3","priority:low","low","priority: low"]];
  const found=aliases.findIndex(group=>group.some(x=>names.includes(x)));
  const rank=found===-1?4:found;
  return {rank,priority:rank===4?"—":"P"+rank,blocked:names.some(n=>n==="blocked"||n==="status:blocked"||n==="status: blocked")};
}

export class GitHubError extends Error{
  constructor(status,kind="github_error"){super(kind);this.status=status;this.kind=kind;}
}
const clean=v=>typeof v==="string"?v.slice(0,300):"";
const repository=r=>({name:r.full_name,url:r.html_url,description:clean(r.description),branch:r.default_branch,pushedAt:r.pushed_at,private:r.private===true});
export function createGitHubClient(token,{fetcher=fetch,signal}={}){
  if(!isFineGrainedPAT(token))throw new GitHubError(400,"invalid_token_format");
  async function get(path){
    signal?.throwIfAborted();
    const url=new URL(path,API);
    if(url.origin!==API||!path.startsWith("/")||path.startsWith("//")||url.username||url.password||url.hash)throw new GitHubError(400,"invalid_api_path");
    const timeout=AbortSignal.timeout(20000);
    const res=await fetcher(url.href,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},cache:"no-store",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",signal:signal?AbortSignal.any([signal,timeout]):timeout});
    if(!res.ok)throw new GitHubError(res.status,(res.status===429||(res.status===403&&(res.headers.get("x-ratelimit-remaining")==="0"||res.headers.has("retry-after"))))?"rate_limited":"github_error");
    return {body:await res.json(),next:/rel="next"/.test(res.headers.get("link")||"")};
  }
  async function user(){
    const {body}=await get("/user");
    if(!Number.isSafeInteger(body?.id)||body.id<=0||typeof body.login!=="string"||!body.login)throw new GitHubError(502,"invalid_user");
    return {id:body.id,login:body.login};
  }
  async function discover(){
    const map=new Map();let truncated=false;
    for(let page=1;page<=MAX_DISCOVERY_PAGES;page++){
      const {body,next}=await get("/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member&page="+page);
      if(!Array.isArray(body))throw new GitHubError(502,"invalid_repository_list");
      for(const r of body)if(validRepo(r.full_name))map.set(r.full_name.toLowerCase(),repository(r));
      if(!next&&body.length<100)break;
      if(page===MAX_DISCOVERY_PAGES){truncated=next||body.length===100;break;}
    }
    return {repositories:[...map.values()],truncated};
  }
  async function findRepo(name){
    if(!validRepo(name))throw new GitHubError(400,"invalid_repository");
    const {body}=await get("/repos/"+name.split("/").map(encodeURIComponent).join("/"));
    if(!validRepo(body?.full_name))throw new GitHubError(502,"invalid_repository");
    return repository(body);
  }
  async function readRepo(name,since){
    const base="/repos/"+name.split("/").map(encodeURIComponent).join("/");
    const sections=["repository","commits","issue_activity","pulls","workflows","issues"];
    const routes=[base,base+"/commits?per_page=10&since="+encodeURIComponent(since),base+"/issues?state=all&sort=updated&direction=desc&per_page=30&since="+encodeURIComponent(since),base+"/pulls?state=all&sort=updated&direction=desc&per_page=10",base+"/actions/runs?per_page=5",base+"/issues?state=open&sort=updated&direction=desc&per_page=100"];
    const results=await Promise.allSettled(routes.map(get));
    signal?.throwIfAborted();
    const fatal=results.find(r=>r.status==="rejected"&&(r.reason?.status===401||r.reason?.kind==="rate_limited"));
    if(fatal)throw fatal.reason;
    const errors=[],activity=[],issues=[];
    const values=results.map((r,i)=>{if(r.status==="fulfilled")return r.value.body;errors.push({repo:name,section:sections[i],status:r.reason?.status||"unavailable"});return null;});
    const [r,commits,issueList,pulls,runs,openIssues]=values;
    const repo=r&&validRepo(r.full_name)?{...repository(r),name}:null;
    const event=(type,title,url,at,status="")=>({repo:name,type,title:clean(title),url,at,status:clean(status)});
    for(const c of Array.isArray(commits)?commits:[])activity.push(event("commit",c.commit?.message?.split("\n")[0],c.html_url,c.commit?.committer?.date));
    for(const i of Array.isArray(issueList)?issueList:[]){if(!i.pull_request)activity.push(event("issue",i.title,i.html_url,i.updated_at,i.state));}
    for(const i of Array.isArray(openIssues)?openIssues:[]){if(!i.pull_request)issues.push({repo:name,number:i.number,title:clean(i.title),url:i.html_url,updatedAt:i.updated_at,...priority(i.labels)});}
    for(const p of Array.isArray(pulls)?pulls:[])activity.push(event("pull",p.title,p.html_url,p.updated_at,p.merged_at?"merged":p.state));
    for(const w of Array.isArray(runs?.workflow_runs)?runs.workflow_runs:[])activity.push(event("workflow",w.name,w.html_url,w.updated_at,w.conclusion||w.status));
    return {repository:repo,activity,issues,errors};
  }
  async function dashboard(names,expectedUser){
    if(!Array.isArray(names)||names.length>MAX_REPOS||names.some(n=>!validRepo(n))||new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw new GitHubError(400,"invalid_selection");
    const identity=await user();
    if(expectedUser&&identity.id!==expectedUser.id)throw new GitHubError(401,"identity_changed");
    const since=new Date(Date.now()-30*86400000).toISOString(),repositories=[],activity=[],issues=[],errors=[];
    for(const name of names){
      signal?.throwIfAborted();
      const r=await readRepo(name,since);
      if(r.repository)repositories.push(r.repository);
      activity.push(...r.activity);issues.push(...r.issues);errors.push(...r.errors);
    }
    activity.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
    return {user:identity,fetchedAt:new Date().toISOString(),repositories,activity,issues,errors};
  }
  return Object.freeze({user,discover,findRepo,dashboard});
}
