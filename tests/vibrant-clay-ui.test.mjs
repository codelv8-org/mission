import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("vibrant clay theme preserves static UI contracts and local assets",async()=>{
 const [html,css,auth,app]=await Promise.all(["docs/index.html","docs/style.css","docs/auth.css","docs/app.js"].map(read));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ["login","pat-input","pat-hint","github-login","auth-message","workspace","view-title","account-login","logout","headline","period","manage-repos","refresh","repo-filter","updated","notice","metrics","m-repos","m-commits","m-issues","m-priority","panels","activity-panel","activity-list","priority-panel","priority-list","repositories-panel","repo-list","repo-dialog","repo-dialog-title","close-repos","repo-dialog-note","repo-search","repo-options","repo-manual","add-repo","repo-selection-message","repo-count","apply-repos"])assert.ok(ids.includes(id),id);
 for(const id of [...app.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]))assert.ok(ids.includes(id),id);
 assert.match(css,/--radius:24px/);assert.match(css,/--stroke:3px/);assert.match(css,/--clay-shadow:[^;]*inset/);assert.match(css,/--vibrant-mint:/);assert.ok(!/backdrop-filter|--glass-/.test(css+auth));
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/:focus-visible/);assert.match(auth,/min-height:48px/);
 assert.ok(!/@import|url\(\s*["']?https?:/i.test(css+auth));
 assert.match(html,/script-src 'self'; style-src 'self'/);assert.match(app,/createElementNS/);
});
test("representative semantic text colors meet 4.5:1 contrast",()=>{
 const pairs=[["#19213b","#fff7ee"],["#44526a","#fff7ee"],["#19213b","#6de3b4"],["#19213b","#ffa48f"],["#19213b","#c6a1f7"],["#ffffff","#1d62c9"],["#ffffff","#2672d1"],["#ffffff","#2872cf"],["#ffffff","#28429c"],["#e5edff","#16686b"],["#e5edff","#4b369c"],["#e5edff","#293da6"],["#e5edff","#164b73"],["#155842","#c6f5e1"],["#154a93","#d8eaff"],["#843b32","#ffded1"],["#15365d","#8fbffc"],["#ffffff","#1955b6"],["#913333","#f9d8d8"],["#78501c","#fae3c2"],["#493780","#e6d9ff"],["#44526a","#d4b9f8"],["#44526a","#a7ebcf"],["#44526a","#ffc6b5"],["#44526a","#dfc5fb"]];
 const luminance=hex=>{const [r,g,b]=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
 for(const [fg,bg] of pairs){const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+" on "+bg);}
});

test("local clay art and compact bento contract",async()=>{
 const [html,svg,css,view]=await Promise.all([read("docs/index.html"),read("docs/clay-workspace.svg"),read("docs/analytics.css"),read("docs/analytics-view.mjs")]);
 assert.match(html,/<img src="\.\/clay-workspace\.svg" alt=""/);
 assert.ok(!/href="https?:|<script|<foreignObject/.test(svg));
 assert.match(css,/\.analysis-timeline \{ grid-column:span 7/);
 assert.match(css,/\.analysis-trend \{ grid-column:span 5/);
 assert.match(css,/grid-column:span 3/);
 assert.match(css,/min-height:44px/);
 assert.match(html,/id="timeline-summary"/);
 assert.match(view,/summary\.hidden=!detail/);
 assert.match(view,/\$\("timeline-summary"\)\.hidden=true/);
});
