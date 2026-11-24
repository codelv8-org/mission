import test from "node:test";
import assert from "node:assert/strict";
import {periodRange,bucketKey,weekdayIndex,WEEKDAYS_TH,isWeekend,monthGroups,historyRequest} from "../docs/period.mjs";
import {analyzeSample} from "../docs/analytics.mjs";
const now=Date.parse("2026-11-24T17:23:00Z"); // Nov 25, 00:23 ICT
test("Bangkok calendar day, previous calendar month and previous calendar year",()=>{
 const r=periodRange("month",now);
 assert.equal(r.startDate,"2026-10-01");assert.equal(r.endDate,"2026-11-25");assert.equal(r.start,Date.parse("2026-09-30T17:00:00Z"));assert.equal(r.unit,"day");assert.equal(r.dates.length,56);
 assert.deepEqual(monthGroups(r.dates).map(g=>[g.key,g.span]),[["2026-10",31],["2026-11",25]]);
 const y=periodRange("year",now);assert.equal(y.startDate,"2025-01-01");assert.equal(y.endDate,"2026-11-25");assert.equal(y.dates.length,23);assert.equal(y.dates.at(-1),"2026-11-01");assert.equal(y.unit,"month");
 assert.equal(periodRange("7",now).dates[0],"2026-11-19");assert.equal(periodRange("30",now).dates.length,30);
 assert.equal(bucketKey(Date.parse("2026-10-31T17:00:00Z")),"2026-11-01");assert.equal(bucketKey(Date.parse("2026-10-31T17:00:00Z"),"month"),"2026-11-01");
});
test("leap year, December-January rollover and Thai weekdays",()=>{
 const leap=periodRange("month",Date.parse("2024-03-01T01:00:00Z"));assert.equal(leap.dates.length,30);assert.ok(leap.dates.includes("2024-02-29"));
 const jan=periodRange("month",Date.parse("2026-01-01T01:00:00Z"));assert.deepEqual(monthGroups(jan.dates).map(g=>[g.key,g.span]),[["2025-12",31],["2026-01",1]]);
 const y=periodRange("year",Date.parse("2026-01-01T01:00:00Z"));assert.equal(y.dates.length,13);assert.equal(y.dates.at(-1),"2026-01-01");
 assert.equal(WEEKDAYS_TH[weekdayIndex("2026-11-25")],"พ.");assert.equal(WEEKDAYS_TH[weekdayIndex("2026-11-28")],"ส.");assert.equal(WEEKDAYS_TH[weekdayIndex("2026-11-29")],"อา.");assert.ok(isWeekend("2026-11-28")&&isWeekend("2026-11-29"));assert.equal(isWeekend("2026-11-25"),false);
 assert.equal(historyRequest("year",now).pages,5);assert.equal(historyRequest("month",now).pages,3);assert.equal(historyRequest("7",now).pages,1);
});
test("monthly aggregates, exact time boundaries, scope, missing history and page caps",()=>{
 const data={fetchedAt:new Date(now).toISOString(),historySince:"2024-12-31T17:00:00Z",repositories:[{name:"org/a"}],activity:[
 {repo:"org/a",type:"commit",at:"2024-12-31T16:59:59Z"},
 {repo:"org/a",type:"commit",at:"2024-12-31T17:00:00Z"},
 {repo:"org/a",type:"issue",at:"2026-10-31T16:59:59Z"},
 {repo:"org/a",type:"pull",at:"2026-10-31T17:00:00Z"},
 {repo:"org/a",type:"commit",at:"2026-11-24T17:10:00Z"},
 {repo:"org/a",type:"commit",at:"2026-11-24T17:24:00Z"}
 ],errors:[],issues:[],truncated:[]};
 const year=analyzeSample(data,{period:"year"});assert.equal(year.observedTotal,4);assert.equal(year.daily[0].total,1);assert.equal(year.daily.at(-1).total,2);assert.equal(year.projects[0].cells.at(-1).events.length,2);
 const m=analyzeSample(data,{period:"month",type:"pull"});assert.equal(m.observedTotal,3);assert.equal(m.filteredTotal,1);assert.equal(m.daily.find(d=>d.date==="2026-11-01").total,1);
 const partial=analyzeSample({...data,historySince:"2026-10-01T00:00:00Z",truncated:[{repo:"org/a",section:"commits"}]},{period:"year"});
 assert.equal(partial.coverageGap,true);assert.equal(partial.timelinePartial,true);assert.equal(partial.limited.length,1);
 assert.equal(analyzeSample({...data,truncated:[{repo:"org/a",section:"commits"}]},{period:"year",type:"issue"}).timelinePartial,false);
});
