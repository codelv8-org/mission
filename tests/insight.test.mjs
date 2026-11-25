import test from "node:test";
import assert from "node:assert/strict";
import {buildInsights,safeInsightSource} from "../docs/insight-model.mjs";
import {analyzeIntelligence,normalizePerformance,normalizeRoot} from "../docs/intelligence-model.mjs";
const repo="org/a",now="2026-11-25T04:00:00Z",at="2026-11-24T00:00:00Z";
const root=normalizeRoot([{name:"tests",type:"dir"},{name:"README.md",type:"file"}]);
function fixture(){
 const performance=normalizePerformance(repo,{
  commits:[{sha:"abc1234567",commit:{message:"Fix",committer:{date:at}}}],
  pulls:[{number:1,state:"open",created_at:"2026-11-01T00:00:00Z",html_url:"https://github.com/org/a/pull/1"},{number:2,state:"open",updated_at:"2026-11-01T00:00:00Z"},...[3,4,5].map(number=>({number,state:"closed",created_at:"2026-11-20T00:00:00Z",merged_at:at,html_url:"https://github.com/org/a/pull/"+number}))],
  issueList:[{number:7,state:"closed",state_reason:"completed",closed_at:at}],
  runs:[{id:1,status:"completed",conclusion:"failure",updated_at:at,html_url:"https://github.com/org/a/actions/runs/1"},{id:2,status:"completed",conclusion:"cancelled",updated_at:at}]
 });
 return {fetchedAt:now,historySince:"2026-10-01T00:00:00Z",repositories:[{name:repo}],performance,issues:[{repo,blocked:true,rank:0,url:"https://github.com/org/a/issues/10"},{repo,blocked:false,rank:1,url:"https://github.com/org/a/issues/11"}],techProfiles:[{repo,root,languages:[]}],errors:[],truncated:[]};
}
test("findings cite observed evidence, avoid double counts and age proxies",()=>{
 const d=fixture(),m=analyzeIntelligence(d,{period:"7"}),r=buildInsights(d,m),by=Object.fromEntries(r.findings.map(i=>[i.key,i]));
 assert.equal(by.queue.category,"act");assert.match(by.queue.evidence,/1 blocked · 1 other P0\/P1/);assert.equal(by.queue.source,"https://github.com/org/a/issues/10");
 assert.equal(by.workflow.category,"act");assert.match(by.workflow.evidence,/1 observed runs · failure 1/);assert.equal(by.workflow.source,"https://github.com/org/a/actions/runs/1");
 assert.match(by.open_pr.evidence,/^1 currently open PRs/);assert.equal(by.open_pr.source,"https://github.com/org/a/pull/1");
 assert.match(by.cycle.evidence,/96 h · 3\/3/);assert.match(by.delivery.evidence,/3 merged PRs · 1 completed issues/);assert.ok(by.attribution);
 assert.equal(r.counts.act,2);assert.equal(r.counts.review,2);assert.deepEqual(r,buildInsights(d,m));
 assert.equal(r.practices.find(x=>x.key==="testing").present.length,1);assert.deepEqual(r.practices.find(x=>x.key==="security").review,[repo]);
});
test("scope and coverage guard absence inference and historical changes",()=>{
 const d=fixture();d.repositories.push({name:"org/b"});d.techProfiles.push({repo:"org/b",root:{...root,capped:true},languages:[]});
 d.errors=[{repo,section:"issues"}];d.truncated=[{repo,section:"workflows"},{repo:"org/b",section:"root_metadata"}];
 const m=analyzeIntelligence(d,{period:"7",filter:"org/b"}),r=buildInsights(d,m,{metrics:[{key:"rate",delta:null}]});
 assert.equal(r.counts.act,0);assert.equal(r.practices[0].scanned,0);assert.ok(r.findings.every(i=>i.repo===null||i.repo==="org/b"));assert.ok(!r.findings.some(i=>i.key==="compare_rate"));
 const a=analyzeIntelligence(d,{period:"7",filter:repo}),s=buildInsights(d,a,{metrics:[{key:"cycle",delta:24,previous:48,current:72},{key:"rate",delta:-10,previous:90,current:80}]});
 assert.match(s.findings.find(i=>i.key==="workflow").limitation,/partial/);assert.ok(s.findings.some(i=>i.key==="coverage"));assert.ok(s.findings.some(i=>i.key==="compare_rate"));
});
test("empty samples and canceled runs do not fabricate healthy/failing signals",()=>{
 const d=fixture();d.performance=normalizePerformance(repo,{runs:[{id:1,status:"completed",conclusion:"cancelled",updated_at:at}]});d.issues=[];d.techProfiles=[];
 const r=buildInsights(d,analyzeIntelligence(d,{period:"7"}));assert.equal(r.counts.act,0);assert.equal(r.counts.observed,0);assert.equal(r.practices[0].scanned,0);
 assert.deepEqual(buildInsights(null,null).findings,[]);
});
test("source URL is restricted to matching GitHub repo and resource type",()=>{
 assert.equal(safeInsightSource("https://github.com/org/a/pull/12",repo,"pull"),"https://github.com/org/a/pull/12");
 for(const url of ["https://github.com/org/b/pull/12","https://evil.example/org/a/pull/12","https://github.com/org/a/pull/12?token=abc","https://github.com/org/a/issues/12","https://user@github.com/org/a/pull/12"])assert.equal(safeInsightSource(url,repo,"pull"),null);
});
