import test from "node:test";
import assert from "node:assert/strict";
import {createMissionServer,validate} from "../index.mjs";
const env={APP_ORIGIN:"https://mission.example.com",GOOGLE_CLIENT_ID:"test.apps.googleusercontent.com",GOOGLE_ALLOWED_EMAILS:"owner@gmail.com",GITHUB_TOKEN:"never-expose-this-value",GITHUB_REPOSITORIES:"org/repo"};
test("invalid configuration fails closed",()=>{
  assert.throws(()=>validate({...env,APP_ORIGIN:"https://mission.example.com/"}));
  assert.throws(()=>validate({...env,GOOGLE_ALLOWED_EMAILS:""}));
  assert.throws(()=>validate({...env,GITHUB_TOKEN:""}));
});
test("same-origin server serves only public assets; API requires auth",async()=>{
  const server=createMissionServer(env);
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const url="http://127.0.0.1:"+server.address().port;
  try{
    assert.equal((await fetch(url+"/healthz")).status,200);
    assert.equal((await fetch(url+"/")).status,200);
    const config=await (await fetch(url+"/config.js")).text();
    assert.match(config,/test\.apps\.googleusercontent\.com/);
    assert.ok(!config.includes(env.GITHUB_TOKEN));
    assert.ok(!config.includes(env.GOOGLE_ALLOWED_EMAILS));
    for(const path of ["/.env","/server/api.mjs","/package.json","/README.md","/worker/src/index.js"])assert.equal((await fetch(url+path)).status,404);
    const unauth=await fetch(url+"/api/dashboard");
    assert.equal(unauth.status,401);
    assert.match(unauth.headers.get("cache-control"),/no-store/);
    assert.equal((await fetch(url+"/api/dashboard",{headers:{Origin:"https://evil.example"}})).status,403);
    assert.equal((await fetch(url+"/api/dashboard",{method:"POST"})).status,405);
    assert.equal((await fetch(url+"/api/dashboard",{headers:{Authorization:"Bearer invalid"}})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
