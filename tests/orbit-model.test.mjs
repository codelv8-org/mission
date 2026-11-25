import test from "node:test";
import assert from "node:assert/strict";
import {normalizeOrbit,orbitWindow,clipOrbit,orbitGroups} from "../docs/orbit-model.mjs";
const now=Date.parse("2026-11-25T04:00:00Z");
const item={number:12,title:"Fix",created_at:"2026-11-18T00:00:00Z",updated_at:"2026-11-24T00:00:00Z",state:"open",html_url:"https://github.com/org/a/issues/12",assignees:[{login:"dev"}]};
test("normalizes source dates and per-repo identities; avoids invented percentages",()=>{
 const args={issueList:[item,{...item,number:99,pull_request:{}}],openIssues:[item],
 pulls:[{...item,number:13,merged_at:"2026-11-23T00:00:00Z",state:"closed"}],
 milestones:[{...item,number:1,due_on:"2026-12-01T00:00:00Z",open_issues:2,closed_issues:3},{...item,number:2,open_issues:0,closed_issues:0}],
 commits:[{sha:"a",commit:{message:"Commit",committer:{date:"2026-11-24T19:00:00Z"}}}]};
 const rows=normalizeOrbit("org/a",args),other=normalizeOrbit("org/b",args);
 assert.equal(rows.length,5);assert.equal(new Set([...rows,...other].map(r=>r.id)).size,10);
 assert.equal(rows.find(r=>r.type==="issue").progress,null);
 assert.equal(rows.find(r=>r.type==="issue").endAt,null);
 assert.equal(rows.find(r=>r.type==="pull").status,"merged");
 assert.equal(rows.find(r=>r.type==="milestone"&&r.number===1).progress,60);
 assert.equal(rows.find(r=>r.type==="milestone"&&r.number===2).progress,null);
 assert.equal(rows.find(r=>r.type==="milestone"&&r.number===1).endAt,"2026-12-01T00:00:00.000Z");
});
test("clips open intervals and point events in ICT without stretching beyond snapshot",()=>{
 const w=orbitWindow(now,14),rows=normalizeOrbit("org/a",{issueList:[item],commits:[{sha:"a",commit:{message:"Commit",committer:{date:"2026-11-24T19:00:00Z"}}}]});
 assert.equal(w.today,"2026-11-25");assert.equal(w.dates.length,14);
 const issue=clipOrbit(rows[0],w,now),commit=clipOrbit(rows[1],w,now);
 assert.equal(w.dates[issue.last],"2026-11-25");assert.equal(w.dates[commit.first],"2026-11-25");assert.equal(commit.span,1);
 assert.equal(clipOrbit(rows[0],orbitWindow(now,7,30),now),null);
});
test("multi-repo groups, case-insensitive search, type and status filters",()=>{
 const rows=["org/a","org/b"].flatMap(repo=>normalizeOrbit(repo,{issueList:[item,{...item,number:3,state:"closed",state_reason:"not_planned",closed_at:"2026-11-23T00:00:00Z"}]}));
 const w=orbitWindow(now);
 assert.equal(orbitGroups(rows,w,now).length,2);
 assert.equal(orbitGroups(rows,w,now,{group:"type"})[0].rows.length,4);
 assert.equal(orbitGroups(rows,w,now,{filter:"org/b",query:"DEV",status:"active"})[0].rows.length,1);
 assert.equal(orbitGroups(rows,w,now,{status:"complete"}).length,0);
 assert.equal(orbitGroups(rows,w,now,{status:"closed"})[0].rows[0].status,"closed");
});
