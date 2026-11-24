import {accountAllowed,configuredRepos,priority,split,validRepo} from "./policy.mjs";
import {sealSession,openSession} from "./session.mjs";
function appConfig(env){
  try{
    const u=new URL(env.APP_URL);
    if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!u.pathname.endsWith("/")||u.href!==env.APP_URL)return null;
    if(!/^[A-Za-z0-9._-]+$/.test(env.GITHUB_CLIENT_ID||"")||typeof env.GITHUB_CLIENT_SECRET!=="string"||env.GITHUB_CLIENT_SECRET.length<20||!split(env.GITHUB_ALLOWED_USERS).length)return null;
    return {origin:u.origin,callbackUrl:u.href,clientId:env.GITHUB_CLIENT_ID,names:configuredRepos(env.GITHUB_REPOSITORIES)};
  }catch{return null;}
}
function headers(origin){
  const h=new Headers({"Cache-Control":"no-store, private","Vary":"Origin","X-Content-Type-Options":"nosniff","Content-Type":"application/json; charset=utf-8","Referrer-Policy":"no-referrer"});
  if(origin){h.set("Access-Control-Allow-Origin",origin);h.set("Access-Control-Allow-Headers","Authorization, Content-Type");h.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");}
  return h;
}
const json=(value,status,origin)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
class UpstreamError extends Error{constructor(status){super("GitHub upstream error");this.status=status;}}
const clean=v=>typeof v==="string"?v.slice(0,300):"";
async function github(path,token,fetcher=fetch){
  const r=await fetcher("https://api.github.com"+path,{headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"mission-workspace"},redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new UpstreamError(r.status);
  return r.json();
}
function event(repo,type,title,url,at,status=""){return {repo,type,title:clean(title),url,at,status:clean(status)};}
async function readRepo(name,token,since,fetcher){
  const base="/repos/"+name.split("/").map(encodeURIComponent).join("/");
  const results=await Promise.allSettled([
    github(base,token,fetcher),
    github(base+"/commits?per_page=10&since="+encodeURIComponent(since),token,fetcher),
    github(base+"/issues?state=all&sort=updated&direction=desc&per_page=30&since="+encodeURIComponent(since),token,fetcher),
    github(base+"/pulls?state=all&sort=updated&direction=desc&per_page=10",token,fetcher),
    github(base+"/actions/runs?per_page=5",token,fetcher),
    github(base+"/issues?state=open&sort=updated&direction=desc&per_page=100",token,fetcher)
  ]);
  const sections=["repository","commits","issue_activity","pulls","workflows","issues"],errors=[],activity=[],issues=[];
  const vals=results.map((r,i)=>{if(r.status==="fulfilled")return r.value;errors.push({repo:name,section:sections[i],status:r.reason?.status||"unavailable"});return null;});
  const [r,commits,issueList,pulls,runs,openIssues]=vals;
  const repository=r?{name,url:r.html_url,description:clean(r.description),branch:r.default_branch,pushedAt:r.pushed_at}:null;
  for(const c of Array.isArray(commits)?commits:[])activity.push(event(name,"commit",c.commit?.message?.split("\n")[0],c.html_url,c.commit?.committer?.date));
  for(const i of Array.isArray(issueList)?issueList:[]){if(i.pull_request)continue;activity.push(event(name,"issue",i.title,i.html_url,i.updated_at,i.state));}
  for(const i of Array.isArray(openIssues)?openIssues:[]){if(i.pull_request)continue;issues.push({repo:name,number:i.number,title:clean(i.title),url:i.html_url,updatedAt:i.updated_at,...priority(i.labels)});}
  for(const p of Array.isArray(pulls)?pulls:[])activity.push(event(name,"pull",p.title,p.html_url,p.updated_at,p.merged_at?"merged":p.state));
  for(const w of Array.isArray(runs?.workflow_runs)?runs.workflow_runs:[])activity.push(event(name,"workflow",w.name,w.html_url,w.updated_at,w.conclusion||w.status));
  return {repository,activity,issues,errors};
}

async function discover(token,fetcher){
  const errors=[],byName=new Map();
  const installations=await github("/user/installations?per_page=4",token,fetcher);
  const list=Array.isArray(installations.installations)?installations.installations.slice(0,4):[];
  if(Number(installations.total_count)>list.length)errors.push({repo:"GitHub App",section:"installations",status:"sampled (first 4)"});
  for(const installation of list){
    if(!Number.isSafeInteger(installation.id)||installation.id<=0)continue;
    try{
      const result=await github("/user/installations/"+installation.id+"/repositories?per_page=100",token,fetcher);
      const repos=Array.isArray(result.repositories)?result.repositories.slice(0,100):[];
      if(Number(result.total_count)>repos.length)errors.push({repo:"GitHub App",section:"repositories",status:"sampled (first 100 per installation)"});
      for(const r of repos)if(validRepo(r.full_name))byName.set(r.full_name.toLowerCase(),r);
    }catch(e){errors.push({repo:"GitHub App",section:"installation "+installation.id,status:e.status||"unavailable"});}
  }
  const repos=[...byName.values()].sort((a,b)=>(Date.parse(b.pushed_at)||0)-(Date.parse(a.pushed_at)||0));
  if(repos.length>7)errors.push({repo:"GitHub App",section:"repositories",status:"showing 7 most recently pushed from discovered sample"});
  if(!repos.length&&!errors.length)errors.push({repo:"GitHub App",section:"repositories",status:"no installation repositories; install Mission on selected repositories"});
  return {names:repos.slice(0,7).map(r=>r.full_name),errors};
}
export function createHandler(fetcher=fetch){
  return {async fetch(request,env){
    const path=new URL(request.url).pathname;
    let origin="";
    try{const expected=new URL(env.APP_URL).origin;if(request.headers.get("Origin")===expected)origin=expected;}catch{}
    if(!origin)return json({error:"origin_not_allowed"},403,"");
    if(!["/api/config","/api/auth/exchange","/api/dashboard"].includes(path))return json({error:"not_found"},404,origin);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
    const cfg=appConfig(env);
    if(!cfg)return json({error:"not_configured"},503,origin);
    if(request.method!==(path==="/api/auth/exchange"?"POST":"GET"))return json({error:"method_not_allowed"},405,origin);
    if(path==="/api/config")return json({clientId:cfg.clientId,callbackUrl:cfg.callbackUrl},200,origin);
    try{
      if(path==="/api/auth/exchange"){
        if(!request.headers.get("content-type")?.startsWith("application/json"))return json({error:"invalid_request"},400,origin);
        let body;try{const raw=await request.text();if(raw.length>2048)throw Error();body=JSON.parse(raw);}catch{return json({error:"invalid_request"},400,origin);}
        if(!/^[A-Za-z0-9_-]{10,256}$/.test(body?.code||"")||!/^[A-Za-z0-9._~-]{43,128}$/.test(body?.verifier||""))return json({error:"invalid_request"},400,origin);
        const upstream=await fetcher("https://github.com/login/oauth/access_token",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:cfg.clientId,client_secret:env.GITHUB_CLIENT_SECRET,code:body.code,code_verifier:body.verifier,redirect_uri:cfg.callbackUrl}),redirect:"error",signal:AbortSignal.timeout(12000)});
        if(!upstream.ok)return json({error:"oauth_unavailable"},502,origin);
        const auth=await upstream.json();
        if(!/^ghu_[A-Za-z0-9_]+$/.test(auth?.access_token||"")||!Number.isFinite(auth.expires_in)||auth.expires_in<=0||auth.error)return json({error:"oauth_failed"},401,origin);
        const user=await github("/user",auth.access_token,fetcher);
        if(!accountAllowed(user,env))return json({error:"forbidden"},403,origin);
        const exp=Math.floor(Date.now()/1000)+Math.min(3600,Math.floor(auth.expires_in));
        const session=await sealSession({id:user.id,token:auth.access_token,exp},env);
        // The underlying GitHub token and refresh token never leave the Worker.
        return json({session},200,origin);
      }
      const auth=request.headers.get("Authorization")||"";
      let session;
      try{if(!auth.startsWith("Bearer "))throw Error();session=await openSession(auth.slice(7),env);}catch{return json({error:"unauthorized"},401,origin);}
      const user=await github("/user",session.token,fetcher);
      if(user.id!==session.id||!accountAllowed(user,env))return json({error:"forbidden"},403,origin);
      const chosen=cfg.names.length?{names:cfg.names,errors:[]}:await discover(session.token,fetcher);
      const since=new Date(Date.now()-30*86400000).toISOString();
      const repositories=[],activity=[],issues=[],errors=[...chosen.errors];
      // Bounded sample: explicit max 8 x 6 + user = 49 upstream calls.
      // Auto discovery max 4 installation pages + list + 7 x 6 + user = 48.
      for(const name of chosen.names){const r=await readRepo(name,session.token,since,fetcher);if(r.repository)repositories.push(r.repository);activity.push(...r.activity);issues.push(...r.issues);errors.push(...r.errors);}
      activity.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
      return json({user:{login:user.login,expiresAt:session.exp},fetchedAt:new Date().toISOString(),repositories,activity,issues,errors},200,origin);
    }catch(e){return json({error:e.status===401?"unauthorized":"upstream_unavailable"},e.status===401?401:502,origin);}
  }};
}
export default createHandler();
