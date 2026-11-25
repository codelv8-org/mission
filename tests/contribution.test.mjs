import test from "node:test";
import assert from "node:assert/strict";
import {contributionEvidence,analyzeContributions} from "../docs/contribution-model.mjs";
import {normalizePerformance,analyzeIntelligence,compareIntelligence} from "../docs/intelligence-model.mjs";
import {periodRange,previousPeriodRange,historyRequest} from "../docs/period.mjs";
const repo="org/a",now=Date.parse("2026-11-25T04:00:00Z"),at="2026-11-23T02:00:00Z";
const c=(message,author={login:"alice",type:"User"})=>({sha:"abcdef123456",author,commit:{message,committer:{date:at}},html_url:"https://github.com/org/a/commit/abcdef123456"});
test("agent declarations require an exact terminal trailer or label; no automatic human inference",()=>{
 assert.equal(contributionEvidence(c("Feature by Codex"),"commit",repo).agent,"Unattributed");
 assert.equal(contributionEvidence(c("Fix\n\nAI-Agent: Codex"),"commit",repo).agent,"Codex");
 assert.equal(contributionEvidence(c("AI-Agent: Codex"),"commit",repo).agent,"Unattributed");
 assert.equal(contributionEvidence(c("Fix\n\nAI-Agent: Codex\nNot a trailer"),"commit",repo).agent,"Unattributed");
 assert.equal(contributionEvidence(c("Fix\n\nAI-Agent: Codex\nAI-Agent: Claude Code"),"commit",repo).agent,"Multiple declarations");
 assert.equal(contributionEvidence(c("Fix",{login:"robot[bot]",type:"Bot"}),"commit",repo).agent,"Bot (provider unknown)");
 assert.equal(contributionEvidence(c("Fix",{login:"codex",type:"User"}),"commit",repo).agent,"Unattributed");
 assert.equal(contributionEvidence(c("Fix\n\nAI-Agent: Human"),"commit",repo).agent,"Human (declared)");
 assert.equal(contributionEvidence({labels:[{name:"ai-agent:claude-code"}],user:{login:"alice",type:"User"}},"merged_pr",repo).agent,"Claude Code");
 assert.equal(contributionEvidence({labels:[{name:"codex-fix"}]},"merged_pr",repo).agent,"Unattributed");
 assert.equal(contributionEvidence({...c("Fix"),html_url:"https://github.com/org/b/commit/abcdef123456"},"commit",repo).source,null);
 assert.equal(contributionEvidence({...c("Fix"),html_url:"https://evil.example/"},"commit",repo).source,null);
 assert.ok(!JSON.stringify(contributionEvidence(c("Fix\n\nAI-Agent: unknown-sensitive-text"),"commit",repo)).includes("unknown-sensitive-text"));
});
test("group counts, contributor filter, separate record units and median cycle",()=>{
 const rows=normalizePerformance(repo,{commits:[c("Fix\n\nAI-Agent: Codex"),{...c("Other",{login:"bob",type:"User"}),sha:"fedcba987654"}],pulls:[{number:1,state:"closed",created_at:"2026-11-22T02:00:00Z",merged_at:at,user:{login:"alice",type:"User"},labels:["ai-agent:codex"]}]});
 const all=analyzeContributions(rows);assert.equal(all.total,2);assert.equal(all.declared,1);assert.equal(all.groups.reduce((n,g)=>n+g.count,0),2);
 assert.equal(analyzeContributions(rows,{actor:"login:bob"}).groups[0].name,"Unattributed");
 assert.equal(analyzeContributions(rows,{kind:"merged_pr"}).groups[0].cycleHours,24);
 assert.equal(analyzeContributions(rows,{kind:"merged_pr",actor:"login:bob"}).actor,"all");
});
test("previous ranges preserve elapsed time, including monthly and yearly periods",()=>{
 for(const period of ["7","30","month","year"]){
  const range=periodRange(period,now),prior=previousPeriodRange(range);
  assert.equal(prior.asOf-prior.start,range.asOf-range.start);assert.ok(prior.asOf<range.start);
  assert.equal(new Date(prior.asOf).getUTCHours(),new Date(range.asOf).getUTCHours());
  assert.ok(Date.parse(historyRequest(period,now,{compare:true}).since)<=prior.start);
  assert.ok(historyRequest(period,now,{compare:true}).pages<=5);
 }
 assert.equal(previousPeriodRange(periodRange("7",now)).startDate,"2026-11-12");
});
test("comparison suppresses deltas for missing history, caps, permissions and undefined rates",()=>{
 const priorAt="2026-11-15T02:00:00Z",rows=normalizePerformance(repo,{commits:[c("Fix"),{...c("Older"),sha:"9876543210abcdef",commit:{committer:{date:priorAt}}}]});
 const data={fetchedAt:new Date(now).toISOString(),historySince:"2026-11-01T00:00:00Z",repositories:[{name:repo}],performance:rows,issues:[],techProfiles:[],errors:[],truncated:[]};
 const get=(d,p="7")=>compareIntelligence(d,analyzeIntelligence(d,{period:p}),{period:p}).metrics;
 assert.equal(get(data).find(x=>x.key==="commits").delta,0);
 assert.equal(get(data).find(x=>x.key==="rate").delta,null);
 const cap=get({...data,truncated:[{repo,section:"commits"}]});assert.equal(cap.find(x=>x.key==="commits").delta,null);
 const gap=get({...data,historySince:"2026-11-19T00:00:00Z"});assert.equal(gap.find(x=>x.key==="commits").previousCov.loaded,0);
 assert.equal(get({...data,errors:[{repo,section:"commits"}]}).find(x=>x.key==="commits").delta,null);
});

test("real account names cannot collide with filter sentinels",()=>{
 const rows=normalizePerformance(repo,{commits:[c("Fix",{login:"all",type:"User"}),{...c("Fix",{login:"unlinked",type:"User"}),sha:"fedcba987654"},{...c("Fix",null),sha:"123456789abcd"}]});
 const result=analyzeContributions(rows);assert.equal(result.contributors.length,3);assert.equal(analyzeContributions(rows,{actor:"login:all"}).total,1);assert.equal(analyzeContributions(rows,{actor:"unlinked"}).total,1);
});
