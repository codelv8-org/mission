import test from "node:test";
import assert from "node:assert/strict";
import {createHandler} from "../src/index.mjs";
import {accountAllowed,configuredRepos,priority} from "../src/policy.mjs";
import {sealSession,openSession} from "../src/session.mjs";
const env={APP_URL:"https://codelv8-org.github.io/mission/",GITHUB_CLIENT_ID:"Iv1.test",GITHUB_CLIENT_SECRET:"fake-client-secret-used-only-for-tests",GITHUB_ALLOWED_USERS:"123",GITHUB_REPOSITORIES:"org/repo"};
const origin=new URL(env.APP_URL).origin,token="ghu_testTokenOnly";
const request=(path,options={})=>new Request("https://mission.example.workers.dev"+path,{...options,headers:{Origin:origin,...options.headers}});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
function mock(upstreamUser={id:123,login:"owner"}){
  const requests=[];
  const handler=createHandler(async(url,opts={})=>{
    requests.push({url,opts});
    if(url==="https://github.com/login/oauth/access_token"){assert.equal(opts.body.get("client_secret"),env.GITHUB_CLIENT_SECRET);assert.equal(opts.body.get("redirect_uri"),env.APP_URL);assert.equal(opts.body.get("code_verifier"),"a".repeat(43));return response({access_token:token,expires_in:28800,refresh_token:"ghr_neverExpose"});}
    if(url.endsWith("/user"))return response(upstreamUser);
    if(url.includes("/user/installations?"))return response({total_count:1,installations:[{id:1}]});
    if(url.includes("/user/installations/1/repositories"))return response({total_count:1,repositories:[{full_name:"org/repo",pushed_at:"2026-11-20T00:00:00Z"}]});
    if(url.endsWith("/repos/org/repo"))return response({html_url:"https://github.com/org/repo",default_branch:"main"});
    if(url.includes("/actions/runs"))return response({workflow_runs:[]});
    return response([]);
  });
  return {handler,requests};
}
const exchange=handler=>handler.fetch(request("/api/auth/exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:"abc123456789",verifier:"a".repeat(43)})}),env);
test("explicit allowlist and bounded configuration",()=>{
  assert.equal(accountAllowed({id:123,login:"owner"},env),true);
  assert.equal(accountAllowed({id:124,login:"other"},env),false);
  assert.equal(accountAllowed({id:123,login:"owner"},{}),false);
  assert.deepEqual(configuredRepos(""),[]);
  assert.throws(()=>configuredRepos("org/.."));
  assert.throws(()=>configuredRepos(Array.from({length:9},(_,i)=>"org/r"+i).join(",")));
  assert.equal(priority(["priority: high"]).priority,"P1");
});
test("encrypted session expires and rejects tampering or changed client secret",async()=>{
  const session=await sealSession({id:123,token,exp:Math.floor(Date.now()/1000)+120},env);
  assert.ok(!session.includes(token));
  assert.equal((await openSession(session,env)).id,123);
  const [iv,ct]=session.split(".");
  await assert.rejects(openSession(iv+"."+(ct[0]==="A"?"B":"A")+ct.slice(1),env));
  await assert.rejects(openSession(session,{...env,GITHUB_CLIENT_SECRET:"another-client-secret-test-value"}));
  await assert.rejects(openSession(await sealSession({id:123,token,exp:1},env),env));
});
test("OAuth exchange protects secret and GitHub token; dashboard checks user",async()=>{
  const {handler,requests}=mock();
  const config=await handler.fetch(request("/api/config"),env);
  const configText=await config.text();
  assert.ok(!configText.includes(env.GITHUB_CLIENT_SECRET));
  const auth=await exchange(handler);assert.equal(auth.status,200);
  const raw=await auth.text();assert.ok(!raw.includes(token));assert.ok(!raw.includes("ghr_"));
  const {session}=JSON.parse(raw);
  const r=await handler.fetch(request("/api/dashboard",{headers:{Authorization:"Bearer "+session}}),env);
  assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.user.login,"owner");assert.equal(data.repositories[0].name,"org/repo");
  assert.equal(requests.filter(x=>x.url.includes("api.github.com/repos/")).length,6);
  assert.equal((await handler.fetch(request("/api/dashboard",{headers:{Authorization:"Bearer "+session}}),{...env,GITHUB_ALLOWED_USERS:"999"})).status,403);
});
test("auto discovers authorized installations",async()=>{
  const {handler}=mock();const {session}=await (await exchange(handler)).json();
  const r=await handler.fetch(request("/api/dashboard",{headers:{Authorization:"Bearer "+session}}),{...env,GITHUB_REPOSITORIES:""});
  assert.equal(r.status,200);assert.equal((await r.json()).repositories[0].name,"org/repo");
});
test("fail closed for missing session, wrong origin, disallowed account or absent configuration",async()=>{
  const {handler}=mock({id:999,login:"other"});
  assert.equal((await exchange(handler)).status,403);
  assert.equal((await handler.fetch(request("/api/dashboard"),env)).status,401);
  assert.equal((await handler.fetch(request("/api/dashboard",{headers:{Origin:"https://evil.example"}}),env)).status,403);
  assert.equal((await handler.fetch(request("/api/config"),{...env,GITHUB_ALLOWED_USERS:""})).status,503);
  const r=await handler.fetch(request("/api/auth/exchange",{method:"OPTIONS"}),env);
  assert.equal(r.status,204);assert.equal(r.headers.get("access-control-allow-origin"),origin);
});
