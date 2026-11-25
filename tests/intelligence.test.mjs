import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {normalizePerformance,normalizeLanguages,normalizeRoot,analyzeIntelligence} from "../docs/intelligence-model.mjs";
const now=Date.parse("2026-11-25T04:00:00Z"),at="2026-11-23T02:00:00Z",old="2025-12-01T00:00:00Z",repo="org/a";
test("only actual merged, completed, and completed workflow timestamps are normalized",()=>{
 const p=normalizePerformance(repo,{commits:[{sha:"x",commit:{committer:{date:at}}},{sha:"x",commit:{committer:{date:at}}}],pulls:[{number:1,created_at:"2026-11-22T02:00:00Z",merged_at:at,state:"closed"},{number:2,created_at:at,state:"open"},{number:3,state:"closed",updated_at:at}],issueList:[{number:4,state:"closed",state_reason:"completed",closed_at:at},{number:5,state:"closed",state_reason:"not_planned",closed_at:at},{number:6,pull_request:{},state:"closed",state_reason:"completed",closed_at:at}],runs:[{id:1,status:"completed",conclusion:"success",updated_at:at},{id:2,status:"completed",conclusion:"failure",updated_at:at},{id:3,status:"in_progress",updated_at:at}]});
 assert.equal(p.length,6);assert.equal(p.find(x=>x.kind==="merged_pr").cycleHours,24);assert.equal(p.filter(x=>x.kind==="completed_issue").length,1);
 assert.equal(p.filter(x=>x.kind==="workflow").length,2);assert.equal(p.filter(x=>x.kind==="commit").length,1);
});
test("evidence is limited to exact root markers and valid language bytes",()=>{
 assert.equal(normalizeLanguages([]),null);assert.equal(normalizeLanguages({PHP:-1}),null);
 assert.deepEqual(normalizeLanguages({PHP:20,JavaScript:10,HTML:0}),[{name:"PHP",bytes:20},{name:"JavaScript",bytes:10}]);
 const root=normalizeRoot([{name:"Dockerfile",type:"file"},{name:"package.json",type:"file"},{name:"tests",type:"dir"},{name:"private-personal-file",type:"file"},{name:"security-fake",type:"file"}]);
 assert.deepEqual(root.manifests,["package.json"]);assert.ok(root.domains.some(d=>d.key==="devops"&&d.markers.includes("dockerfile")));
 assert.ok(!JSON.stringify(root).includes("private-personal-file"));assert.equal(root.domains.find(d=>d.key==="security").markers.length,0);
 assert.equal(normalizeRoot({}),null);
});
test("period/repository scope, median and honest missing-data coverage",()=>{
 const performance=[...normalizePerformance(repo,{commits:[{sha:"a",commit:{committer:{date:at}}}],pulls:[{number:1,created_at:"2026-11-22T02:00:00Z",merged_at:at},{number:2,created_at:"2026-11-21T02:00:00Z",merged_at:at}],issueList:[{number:4,state:"closed",state_reason:"completed",closed_at:old}],runs:[{id:1,status:"completed",conclusion:"success",updated_at:at},{id:2,status:"completed",conclusion:"cancelled",updated_at:at}]}),...normalizePerformance("org/b",{commits:[{sha:"b",commit:{committer:{date:old}}}]})];
 const data={fetchedAt:new Date(now).toISOString(),historySince:"2026-10-01T00:00:00Z",repositories:[{name:repo},{name:"org/b"}],performance,issues:[{repo,blocked:true}],techProfiles:[{repo,languages:normalizeLanguages({PHP:30}),root:normalizeRoot([{name:"tests",type:"dir"}])},{repo:"org/b",languages:null,root:null}],errors:[{repo:"org/b",section:"languages"},{repo:"org/b",section:"root_metadata"},{repo:"org/b",section:"workflows"}],truncated:[{repo,section:"pulls"}]};
 const m=analyzeIntelligence(data,{names:[repo,"org/b"],period:"7"});
 assert.equal(m.merged,2);assert.equal(m.closed,0);assert.equal(m.cycleHours,36);assert.equal(m.runRate,50);assert.equal(m.activeDays,1);assert.equal(m.blocked,1);assert.equal(m.series.length,7);assert.equal(m.cov.pulls.partial,true);assert.equal(m.cov.workflows.loaded,1);
 assert.equal(m.langLoaded,1);assert.equal(m.languages[0].share,100);assert.equal(m.domains.find(d=>d.key==="testing").count,1);
 const y=analyzeIntelligence(data,{filter:repo,period:"year"});assert.equal(y.closed,1);assert.equal(y.range.unit,"month");assert.equal(y.series.length,23);assert.equal(y.historyGap,true);assert.equal(y.repos.length,1);
 const missing=analyzeIntelligence({...data,performance:[],errors:[{repo,section:"workflows"}]},{filter:repo});assert.equal(missing.runRate,null);assert.equal(missing.cov.workflows.loaded,0);
});
test("Analyze UI is isolated, uses shared period, no unsafe rendering or extra origins",async()=>{
 const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const [h,a,v,c,s]=await Promise.all(["docs/index.html","docs/app.js","docs/intelligence-view.mjs","docs/intelligence.css","docs/snapshot.mjs"].map(read));
 assert.match(h,/data-view="analyze"/);assert.match(h,/data-view="performance"/);assert.match(a,/\$\("performance"\).hidden=view!=="performance"/);assert.match(a,/\$\("intelligence"\).hidden=view!=="analyze"/);assert.match(a,/renderIntelligence\(data,\{names:selected,filter:\$\("repo-filter"\).value,period:\$\("period"\).value\}/);
 for(const [,id] of v.matchAll(/\$\("([^"]+)"\)/g))assert.ok(h.includes('id="'+id+'"'),id);
 assert.ok(!/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|\bfetch\(/.test(v));assert.ok(!/@import|url\s*\(/i.test(c));assert.match(s,/"intelligence.css"/);assert.match(s,/"analyze"/);
});

test("Analyze and Performance own distinct DOM, share filters, and preserve data-model calculations",async()=>{
 const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const [h,a,v,s]=await Promise.all(["docs/index.html","docs/app.js","docs/intelligence-view.mjs","docs/snapshot.mjs"].map(read));
 const analysis=h.slice(h.indexOf('<section id="intelligence"'),h.indexOf('<section id="performance"'));
 const performance=h.slice(h.indexOf('<section id="performance"'),h.indexOf('<footer>MISSION'));
 assert.ok(analysis.includes('id="intel-stack"')&&analysis.includes('id="intel-agents"')&&analysis.includes('id="intel-insight-list"'));
 assert.ok(!analysis.includes('id="intel-merged"')&&!analysis.includes('id="intel-compare"'));
 assert.ok(performance.includes('id="intel-merged"')&&performance.includes('id="intel-compare"')&&performance.includes('id="performance-quality"'));
 assert.ok(!performance.includes('id="intel-stack"')&&!performance.includes('id="intel-agents"')&&!performance.includes('id="intel-insight-list"'));
 const ids=[...h.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 assert.match(a,/renderPerformance\(data,\{names:selected,filter:\$\("repo-filter"\).value,period:\$\("period"\).value\}/);
 assert.match(a,/if\(view==="performance"\)renderPerformancePage\(\)/);
 assert.match(v,/if\(performance\)\{drawPerformanceCards\(m\);drawComparison\(data,m,opts,comparison\);\}/);
 assert.match(s,/"performance"/);
});
