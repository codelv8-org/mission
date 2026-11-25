import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {analyzeSample,heatClass,workflowTone} from "../docs/analytics.mjs";
const data={fetchedAt:"2026-11-24T12:00:00Z",repositories:[{name:"org/a"},{name:"org/b"}],activity:[
 {repo:"org/a",type:"commit",at:"2026-11-18T00:00:00Z",title:"at boundary"},
 {repo:"org/a",type:"pull",at:"2026-11-24T09:00:00Z",title:"PR"},
 {repo:"org/a",type:"workflow",at:"2026-11-24T08:00:00Z",status:"failure"},
 {repo:"org/a",type:"workflow",at:"2026-11-24T10:00:00Z",status:"success"},
 {repo:"org/b",type:"issue",at:"2026-11-23T09:00:00Z"},
 {repo:"org/b",type:"commit",at:"2026-11-17T23:59:59Z"},
 {repo:"org/b",type:"commit",at:"2026-11-24T13:00:00Z"},
 {repo:"org/b",type:"commit",at:"invalid"}
],issues:[{repo:"org/a",rank:2,blocked:true,number:1,updatedAt:"2026-11-20"},{repo:"org/a",rank:0,blocked:false,number:2},{repo:"org/b",rank:4,blocked:false,number:3}],errors:[{repo:"org/b",section:"commits",status:403}]};
test("Bangkok calendar boundary, recent sample and latest workflow",()=>{
 const m=analyzeSample(data,{names:["org/a","org/b","org/c"],days:7});
 assert.equal(m.dates[0],"2026-11-18");assert.equal(m.dates.at(-1),"2026-11-24");assert.equal(m.observedTotal,6);assert.equal(m.active,2);assert.equal(m.loadedCount,2);
 assert.equal(m.projects[0].latestWorkflow.status,"success");assert.equal(m.projects[0].cells.at(-1).events.length,3);
 assert.equal(m.daily.reduce((s,d)=>s+d.total,0),6);assert.equal(m.projects[1].activityPartial,true);assert.equal(m.projects[2].timelinePartial,true);
 assert.equal(m.focus.length,2);assert.equal(m.focus[0].number,1);assert.equal(m.blocked,1);assert.deepEqual(m.breakdown.map(x=>x.count),[1,0,1,0,1]);
 assert.equal(m.issueTotal,3);assert.equal(m.issuePartial,true);assert.equal(heatClass(0,true),"heat-unknown");
});
test("period/repository/event filters; issue snapshot remains independent",()=>{
 const m=analyzeSample(data,{filter:"org/b",days:30,type:"issue"});
 assert.equal(m.dates.length,30);assert.equal(m.projects.length,1);assert.equal(m.observedTotal,2);assert.equal(m.filteredTotal,1);assert.equal(m.timelinePartial,false);assert.equal(m.activityPartial,true);assert.equal(m.issueTotal,1);
 assert.equal(m.daily.find(d=>d.date==="2026-11-23").counts.issue,1);assert.equal(m.daily.reduce((n,d)=>n+d.counts.commit,0),0);
 assert.equal(analyzeSample(data,{filter:"org/a",days:7}).issueTotal,2);
});
test("empty input, unavailable data, unknown priorities and workflow states",()=>{
 const m=analyzeSample(null,{now:Date.parse("2026-11-24T00:00:00Z")});
 assert.equal(m.projects.length,0);assert.equal(m.observedTotal,0);
 assert.equal(heatClass(0,false),"heat-0");assert.equal(heatClass(1),"heat-1");assert.equal(heatClass(3),"heat-2");assert.equal(heatClass(4),"heat-3");
 assert.equal(workflowTone("timed_out"),"signal-failure");assert.equal(workflowTone("queued"),"signal-pending");assert.equal(workflowTone("cancelled"),"signal-neutral");
});
test("dashboard navigation, analytics DOM contract, local-only rendering and reset",async()=>{
 const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const [html,app,view,css,layout]=await Promise.all(["docs/index.html","docs/app.js","docs/analytics-view.mjs","docs/analytics.css","docs/style.css"].map(read));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const id of [...view.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]))assert.ok(ids.includes(id),id);
 assert.match(html,/data-view="dashboard"/);assert.match(html,/id="analytics"[^>]+hidden/);assert.match(html,/id="project-timeline"/);
 assert.match(app,/resetAnalytics\(\);switchView\("dashboard"\)/);assert.match(app,/\$\("analytics"\).hidden=view!=="dashboard"/);
 assert.match(app,/data=null;resetAnalytics\(\)/);assert.match(app,/\$\("orbit"\)\.hidden=view!=="activity"/);assert.match(app,/\$\("activity-matrix"\)\.hidden=view!=="activity"/);assert.ok(!/data-view="overview"/.test(html));
 assert.match(view,/button\.setAttribute\("aria-pressed"/);assert.match(view,/u\.hostname==="github\.com"/);
 assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|\bfetch\(|localStorage|sessionStorage/.test(view));
 assert.ok(!/@import|url\(\s*["']?https?:/.test(css));assert.match(layout,/\.nav\.active/);assert.match(layout,/\.sidebar nav \{ display:grid/);assert.match(css,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
});
