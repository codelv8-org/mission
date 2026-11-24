// Real Chromium UI checks on loopback; only synthetic API data, no live GitHub or PAT.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,readFile,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../docs/",import.meta.url));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{for(let i=0;i<100;i++){try{const result=await fn();if(result)return result;}catch{}await delay(100);}throw Error("Timed out: "+label);};
const chrome=process.env.CHROME_BIN||["google-chrome","chromium","chromium-browser"].find(name=>spawnSync("sh",["-c","command -v "+name],{stdio:"ignore"}).status===0);
assert.ok(chrome,"Chromium/Chrome is required on the CI runner");
const dir=await mkdtemp(join(tmpdir(),"mission-browser-"));
const out=resolve("qa-screenshots");await mkdir(out,{recursive:true});
const mime={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
 try{const path=new URL(req.url,"http://127.0.0.1").pathname;const file=resolve(root,path==="/"? "index.html":"."+path);
 if(!file.startsWith(root)||!mime[extname(file)])throw Error("Not found");
 const bytes=await readFile(file);res.writeHead(200,{"Content-Type":mime[extname(file)],"Cache-Control":"no-store"});res.end(bytes);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url="http://127.0.0.1:"+server.address().port+"/";
const proc=spawn(chrome,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--remote-debugging-port=0","--user-data-dir="+dir,"about:blank"],{stdio:"ignore"});
let ws;
function installFixture(){
 const nativeFetch=window.fetch.bind(window),names=["mission","workspace","wifi","api","it-portal"],today=Date.now();
 const stamp=(days=0,hours=0)=>new Date(today-days*86400000-hours*3600000).toISOString();
 const repo=(name)=>({id:names.indexOf(name)+1,full_name:"demo/"+name,html_url:"https://github.com/demo/"+name,default_branch:"main",private:true,pushed_at:stamp(),description:"Synthetic UI test fixture"});
 const respond=body=>new Response(JSON.stringify(body),{status:200,headers:{"Content-Type":"application/json"}});
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==="string"?input:input.url,location.href);
  if(url.origin!=="https://api.github.com")return nativeFetch(input,options);
  if(options.method!=="GET")throw Error("Unexpected mutation");
  const p=url.pathname;
  if(p==="/user")return respond({id:123,login:"demo-qa"});
  if(p==="/user/repos")return respond(names.map(repo));
  const m=p.match(/^\/repos\/demo\/([^/]+)(\/.*)?$/);
  if(!m||!names.includes(m[1]))throw Error("Unexpected fixture route");
  const name=m[1],i=names.indexOf(name),base="https://github.com/demo/"+name,tail=m[2]||"";
  if(!tail)return respond(repo(name));
  if(tail==="/commits")return respond(Array.from({length:6},(_,j)=>({commit:{message:"Fixture commit "+(j+1),committer:{date:stamp(j,i)}},html_url:base+"/commit/"+j})));
  const issue={title:"Fixture review task "+name,number:i+1,html_url:base+"/issues/"+(i+1),labels:[{name:["P0","P1","P2","P3","blocked"][i]}],updated_at:stamp(i%3,2),state:"open"};
  if(tail==="/issues")return respond([issue]);
  if(tail==="/pulls")return respond([{title:"Fixture pull request",html_url:base+"/pull/1",updated_at:stamp(i%3,1),state:"open"}]);
  if(tail==="/actions/runs")return respond({workflow_runs:[{name:"Fixture CI",html_url:base+"/actions/runs/1",updated_at:stamp(0,2),status:"completed",conclusion:i===1?"failure":"success"}]});
  throw Error("Unknown fixture route");
 };
}
try{
 const port=await wait(async()=>Number((await readFile(join(dir,"DevToolsActivePort"),"utf8")).split("\n")[0]),"Chrome devtools");
 const tabs=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 const page=tabs.find(t=>t.type==="page");assert.ok(page);
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
 let seq=0;const pending=new Map(),errors=[];
 ws.addEventListener("message",event=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const cb=pending.get(msg.id);pending.delete(msg.id);msg.error?cb.reject(Error(msg.error.message)):cb.resolve(msg.result);}if(msg.method==="Runtime.exceptionThrown")errors.push(msg.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const ev=async(expression)=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const viewport=(width,height)=>send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
 const shot=async(name)=>{const r=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(out,name+".png"),Buffer.from(r.data,"base64"));};
 const noOverflow=async(label)=>{const v=await ev("({scroll:document.documentElement.scrollWidth,width:innerWidth})");assert.ok(v.scroll<=v.width+1,label+" overflow: "+JSON.stringify(v));};
 await send("Page.enable");await send("Runtime.enable");await send("Page.addScriptToEvaluateOnNewDocument",{source:"("+installFixture.toString()+")()"});
 await viewport(1440,1000);await send("Page.navigate",{url});await wait(()=>ev("document.readyState==='complete' && !!document.querySelector('#github-login')"),"login page");await noOverflow("desktop login");await shot("01-login-1440");
 await ev("document.querySelector('#pat-input').value='github_pat_'+'a'.repeat(40); document.querySelector('#github-login').click()");
 await wait(()=>ev("!document.querySelector('#workspace').hidden && document.querySelector('#m-repos').textContent==='5'"),"fixture login and repository data");
 await ev("document.querySelector('[data-view=dashboard]').click()");
 await wait(()=>ev("!document.querySelector('#analytics-cards').hidden && document.querySelectorAll('#project-timeline tbody tr').length===5"),"analytics");
 const layout=await ev("(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {timeline:r('.analysis-timeline').top,trend:r('.analysis-trend').top,lower:['.analysis-priority','.analysis-projects','.analysis-focus','.analysis-workflows'].map(s=>r(s).top)}})()");
 assert.ok(Math.abs(layout.timeline-layout.trend)<2,"timeline and daily chart share a row");assert.ok(layout.lower.every(y=>Math.abs(y-layout.lower[0])<2),"four lower blocks share a row");
 await noOverflow("1440 dashboard");await shot("02-dashboard-1440");
 await ev("document.querySelector('#project-timeline button[data-day]').click()");
 assert.equal(await ev("document.querySelector('#timeline-summary').children.length"),4);assert.equal(await ev("document.querySelectorAll('#project-timeline button[aria-pressed=true]').length"),1);
 await ev("document.querySelector('#timeline-clear').click()");
 assert.equal(await ev("document.querySelector('#timeline-summary').hidden"),true);
 await ev("const p=document.querySelector('#period');p.value='30';p.dispatchEvent(new Event('change'));");
 assert.equal(await ev("document.querySelectorAll('#project-timeline thead th').length"),31);
 await ev("document.querySelector('#repo-filter').value='demo/mission';document.querySelector('#repo-filter').dispatchEvent(new Event('change'))");
 assert.equal(await ev("document.querySelectorAll('#project-timeline tbody tr').length"),1);
 await ev("document.querySelector('#repo-filter').value='';document.querySelector('#repo-filter').dispatchEvent(new Event('change'));document.querySelector('#period').value='7';document.querySelector('#period').dispatchEvent(new Event('change'));");
 for(const [w,h] of [[1024,768],[768,1024],[375,812],[812,375]]){
   await viewport(w,h);await delay(150);await noOverflow(w+"x"+h+" dashboard");assert.equal(await ev("document.querySelector('#analytics').hidden"),false);
   if(w===375){await shot("03-dashboard-375");await ev("document.querySelector('#manage-repos').click()");assert.equal(await ev("document.querySelector('#repo-dialog').open"),true);await noOverflow("mobile repository dialog");await shot("04-dialog-375");await ev("document.querySelector('#close-repos').click()");assert.equal(await ev("document.querySelector('#repo-dialog').open"),false);}
 }
 await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 assert.equal(await ev("getComputedStyle(document.querySelector('#refresh')).transitionDuration"),"0s");
 await ev("document.querySelector('#logout').click()");
 assert.equal(await ev("document.querySelector('#analytics-cards').hidden && document.querySelector('#timeline-summary').children.length===0 && document.querySelector('#pat-input').value==='' && document.querySelector('#workspace').hidden"),true);
 await viewport(375,812);await noOverflow("mobile login");
 assert.deepEqual(errors,[]);
 console.log("Browser smoke passed: login, 5-repo analytics, 1440 bento rows, 7/30-day and repository filters, day drill-down, 1024/768/375/landscape layout, dialog, reduced motion, logout.");
}finally{ws?.close();proc.kill();await new Promise(r=>server.close(r));await delay(200);await rm(dir,{recursive:true,force:true}).catch(()=>{});}
