import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createGitHubClient,isFineGrainedPAT,validRepo,priority,MAX_REPOS} from "../docs/github-api.mjs";
const token="github_pat_"+"a".repeat(40);
const repo=name=>({full_name:name,html_url:"https://github.com/"+name,default_branch:"main",private:true,pushed_at:"2026-11-24T00:00:00Z"});
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...headers}});
function mock(override){
 const calls=[];
 const client=createGitHubClient(token,{fetcher:async(url,opts)=>{
  calls.push(url);
  assert.equal(new URL(url).origin,"https://api.github.com");
  assert.equal(opts.method,"GET");assert.equal(opts.headers.Authorization,"Bearer "+token);assert.equal(opts.redirect,"error");assert.equal(opts.cache,"no-store");assert.equal(opts.credentials,"omit");
  if(override){const v=override(url);if(v)return v;}
  const u=new URL(url);
  if(u.pathname==="/user")return json({id:123,login:"owner"});
  if(u.pathname==="/user/repos")return json([repo("org/a"),repo("org/b")]);
  if(/^\/repos\/org\/[ab]$/.test(u.pathname))return json(repo(u.pathname.slice(7)));
  if(u.pathname.endsWith("/issues")&&u.searchParams.get("state")==="open")return json([{title:"Fix",number:5,html_url:"https://github.com/org/a/issues/5",labels:[{name:"P0"}],updated_at:"2026-11-20T00:00:00Z"},{pull_request:{},title:"PR"}]);
  if(u.pathname.endsWith("/actions/runs"))return json({workflow_runs:[]});
  return json([]);
 }});
 return {client,calls};
}
test("only fine-grained PAT format, bounded safe repo names and explicit priorities",()=>{
 assert.ok(isFineGrainedPAT(token));assert.ok(!isFineGrainedPAT("ghp_"+"a".repeat(40)));assert.ok(!isFineGrainedPAT("github_pat_short"));
 assert.ok(validRepo("org/repo"));assert.ok(!validRepo("org/.."));assert.ok(!validRepo("https://example.com"));assert.equal(priority(["priority: high"]).priority,"P1");assert.equal(priority(["blocked"]).blocked,true);
 assert.throws(()=>createGitHubClient("not-a-token"));
});
test("verify GitHub identity, discover and select repositories, normalize real data",async()=>{
 const {client,calls}=mock();const u=await client.user();assert.equal(u.login,"owner");
 const found=await client.discover();assert.deepEqual(found.repositories.map(r=>r.name),["org/a","org/b"]);
 const data=await client.dashboard(["org/a"],u);
 assert.equal(data.repositories.length,1);assert.equal(data.issues.length,1);assert.equal(data.issues[0].priority,"P0");
 assert.equal(calls.filter(v=>v.includes("/repos/org/a")).length,6);assert.ok(!JSON.stringify(data).includes(token));
});
test("pagination is bounded and de-duplicated",async()=>{
 const {client,calls}=mock(url=>url.includes("/user/repos?")?json([repo("org/a")],200,{link:'<https://evil.example/?page=2>; rel="next"'}):null);
 const found=await client.discover();
 assert.equal(found.repositories.length,1);assert.equal(found.truncated,true);assert.equal(calls.length,5);
 assert.ok(calls.every(x=>x.startsWith("https://api.github.com/")));
});
test("manual repo lookup and invalid selection",async()=>{
 const {client}=mock();
 assert.equal((await client.findRepo("org/b")).name,"org/b");
 await assert.rejects(client.findRepo("../evil"));
 await assert.rejects(client.dashboard(["org/a","ORG/A"]));
 await assert.rejects(client.dashboard(Array.from({length:MAX_REPOS+1},(_,i)=>"org/r"+i)));
});
test("revocation and rate limits fail; permission errors remain visible",async()=>{
 const denied=mock(url=>url.endsWith("/user")?json({},401):null).client;await assert.rejects(denied.user(),{status:401});
 const limited=mock(url=>url.includes("/user/repos?")?json({},403,{"x-ratelimit-remaining":"0"}):null).client;await assert.rejects(limited.discover(),{kind:"rate_limited"});
 const partial=mock(url=>url.includes("/actions/runs")?json({},403):null).client;
 const data=await partial.dashboard(["org/a"]);assert.equal(data.errors[0].section,"workflows");assert.equal(data.repositories.length,1);
});
test("frontend static security baseline",async()=>{
 const html=await readFile(new URL("../docs/index.html",import.meta.url),"utf8");
 const app=await readFile(new URL("../docs/app.js",import.meta.url),"utf8");
 assert.match(html,/connect-src https:\/\/api\.github\.com;/);assert.match(html,/id="pat-input" type="password"/);
 assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(app));
 assert.ok(!html.includes("accounts.google.com"));assert.ok(!html.includes("workers.dev"));
 assert.match(app,/pagehide/);assert.match(app,/createGitHubClient/);
});
