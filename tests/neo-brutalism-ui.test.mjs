import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("neo-brutalist theme preserves static UI contracts and local assets",async()=>{
 const [html,css,auth,app]=await Promise.all(["docs/index.html","docs/style.css","docs/auth.css","docs/app.js"].map(read));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ["login","pat-input","pat-hint","github-login","auth-message","workspace","view-title","account-login","logout","headline","period","manage-repos","refresh","repo-filter","updated","notice","metrics","m-repos","m-commits","m-issues","m-priority","panels","activity-panel","activity-list","priority-panel","priority-list","repositories-panel","repo-list","repo-dialog","repo-dialog-title","close-repos","repo-dialog-note","repo-search","repo-options","repo-manual","add-repo","repo-selection-message","repo-count","apply-repos"])assert.ok(ids.includes(id),id);
 for(const id of [...app.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]))assert.ok(ids.includes(id),id);
 assert.match(css,/--radius:4px/);assert.match(css,/--stroke:3px/);assert.match(css,/--shadow:5px 5px 0 #111111/);assert.match(css,/--pop-yellow:#ffdb58/);assert.ok(!/backdrop-filter|gradient\(|--clay-/.test(css+auth));
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/:focus-visible/);assert.match(auth,/min-height:48px/);
 assert.ok(!/@import|url\(\s*["']?https?:/i.test(css+auth));
 assert.match(html,/script-src 'self'; style-src 'self'/);assert.match(app,/createElementNS/);
});
test("representative semantic text colors meet 4.5:1 contrast",()=>{
 const pairs=[["#111111","#fffdf5"],["#111111","#ffffff"],["#111111","#ffdb58"],["#111111","#4ecdc4"],["#111111","#76bfff"],["#111111","#ff6b6b"],["#111111","#c4b5fd"],["#111111","#baf1df"],["#111111","#cce5ff"],["#111111","#e4d7ff"],["#111111","#ffd6ca"],["#111111","#f0eee5"],["#292929","#fffdf5"],["#292929","#ffffff"],["#292929","#ffdb58"],["#292929","#4ecdc4"],["#292929","#76bfff"],["#292929","#ff6b6b"],["#292929","#c4b5fd"],["#292929","#baf1df"],["#292929","#ffd6ca"],["#ffffff","#1747a1"],["#164f3f","#baf1df"],["#17457f","#cce5ff"],["#782b27","#ffd6ca"],["#913333","#f9d8d8"],["#78501c","#fae3c2"],["#493780","#e6d9ff"]];
 const luminance=hex=>{const [r,g,b]=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
 for(const [fg,bg] of pairs){const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+" on "+bg);}
});

test("local block art and compact bento contract",async()=>{
 const [html,svg,css,view]=await Promise.all([read("docs/index.html"),read("docs/brutal-workspace.svg"),read("docs/analytics.css"),read("docs/analytics-view.mjs")]);
 assert.match(html,/<img src="\.\/brutal-workspace\.svg" alt=""/);
 assert.ok(!/href="https?:|<script|<foreignObject/.test(svg));
 assert.match(css,/\.analysis-timeline \{ grid-column:span 7/);
 assert.match(css,/\.analysis-trend \{ grid-column:span 5/);
 assert.match(css,/grid-column:span 3/);assert.ok(!/backdrop-filter|gradient\(|inset\s+\d/.test(css));
 assert.match(css,/min-height:44px/);
 assert.match(html,/id="timeline-summary"/);
 assert.match(view,/summary\.hidden=!detail/);
 assert.match(view,/\$\("timeline-summary"\)\.hidden=true/);
});
