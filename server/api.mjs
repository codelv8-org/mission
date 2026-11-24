import {createRemoteJWKSet,jwtVerify} from "jose";
import {accountAllowed,configuredRepos,priority,split} from "./policy.mjs";
const keys=createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const originFor=(request,env)=>request.headers.get("Origin")===env.ALLOWED_ORIGIN&&env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN : "";
function headers(origin){
  const h=new Headers({"Cache-Control":"no-store, private","Vary":"Origin","X-Content-Type-Options":"nosniff","Content-Type":"application/json; charset=utf-8"});
  if(origin){h.set("Access-Control-Allow-Origin",origin);h.set("Access-Control-Allow-Headers","Authorization");h.set("Access-Control-Allow-Methods","GET, OPTIONS");}
  return h;
}
const json=(value,status,origin)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
class UpstreamError extends Error{constructor(status){super("GitHub upstream error");this.status=status;}}
const clean=v=>typeof v==="string"?v.slice(0,300):"";
async function github(path,env){
  const r=await fetch("https://api.github.com"+path,{headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"mission-workspace"},redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new UpstreamError(r.status);
  return r.json();
}
function event(repo,type,title,url,at,status=""){return {repo,type,title:clean(title),url,at,status:clean(status)};}
async function readRepo(name,env,since){
  const base="/repos/"+name.split("/").map(encodeURIComponent).join("/");
  const results=await Promise.allSettled([
    github(base,env),
    github(base+"/commits?per_page=10&since="+encodeURIComponent(since),env),
    github(base+"/issues?state=all&sort=updated&direction=desc&per_page=30&since="+encodeURIComponent(since),env),
    github(base+"/pulls?state=all&sort=updated&direction=desc&per_page=10",env),
    github(base+"/actions/runs?per_page=5",env),
    github(base+"/issues?state=open&sort=updated&direction=desc&per_page=100",env)
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
export default {async fetch(request,env){
  const origin=originFor(request,env);
  const path=new URL(request.url).pathname;
  if(path!=="/api/dashboard")return json({error:"not_found"},404,origin);
  if(!origin)return json({error:"origin_not_allowed"},403,"");
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(request.method!=="GET")return json({error:"method_not_allowed"},405,origin);
  if(!env.GOOGLE_CLIENT_ID||(!split(env.GOOGLE_ALLOWED_EMAILS).length&&!split(env.GOOGLE_ALLOWED_SUBS).length)||!env.GITHUB_TOKEN)return json({error:"not_configured"},503,origin);
  const auth=request.headers.get("Authorization")||"";
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)||auth.length>10000)return json({error:"unauthorized"},401,origin);
  let payload;
  try{({payload}=await jwtVerify(auth.slice(7),keys,{issuer:["https://accounts.google.com","accounts.google.com"],audience:env.GOOGLE_CLIENT_ID,algorithms:["RS256"],requiredClaims:["sub","exp","iat","email","email_verified"],maxTokenAge:"1h",clockTolerance:0}));}
  catch{return json({error:"unauthorized"},401,origin);}
  if(!accountAllowed(payload,env))return json({error:"forbidden"},403,origin);
  let names;try{names=configuredRepos(env.GITHUB_REPOSITORIES);}catch{return json({error:"not_configured"},503,origin);}
  const since=new Date(Date.now()-30*86400000).toISOString();
  const repositories=[],activity=[],issues=[],errors=[];
  // Six GitHub calls per repository, sequential batches keep outgoing connections bounded.
  for(const name of names){const r=await readRepo(name,env,since);if(r.repository)repositories.push(r.repository);activity.push(...r.activity);issues.push(...r.issues);errors.push(...r.errors);}
  activity.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  return json({user:{email:payload.email,expiresAt:payload.exp},fetchedAt:new Date().toISOString(),repositories,activity,issues,errors},200,origin);
}};
