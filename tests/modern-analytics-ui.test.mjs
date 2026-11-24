import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("modern analytical theme preserves static UI contracts and local assets",async()=>{
 const [html,css,auth,app]=await Promise.all(["docs/index.html","docs/style.css","docs/auth.css","docs/app.js"].map(read));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ["login","pat-input","pat-hint","github-login","auth-message","workspace","view-title","account-login","logout","headline","period","manage-repos","refresh","repo-filter","updated","notice","metrics","m-repos","m-commits","m-issues","m-priority","panels","activity-panel","activity-list","priority-panel","priority-list","repositories-panel","repo-list","repo-dialog","repo-dialog-title","close-repos","repo-dialog-note","repo-search","repo-options","repo-manual","add-repo","repo-selection-message","repo-count","apply-repos"])assert.ok(ids.includes(id),id);
 for(const id of [...app.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]))assert.ok(ids.includes(id),id);
 assert.match(css,/--radius:14px/);assert.match(css,/--stroke:1px/);assert.match(css,/--accent:#6366f1/);assert.match(css,/data-theme="dark"/);assert.match(css,/LINE Seed Sans TH/);assert.ok(!/backdrop-filter|gradient\(|--clay-/.test(css+auth));
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/:focus-visible/);assert.match(auth,/min-height:48px/);
 assert.ok(!/@import|url\(\s*["']?https?:/i.test(css+auth));
 assert.match(html,/script-src 'self'; style-src 'self'/);assert.match(app,/createElementNS/);
});
test("representative semantic text colors meet 4.5:1 contrast",()=>{
 const pairs=[["#20232c","#ffffff"],["#596579","#ffffff"],["#596579","#f4f5f8"],["#596579","#eef0f5"],["#ffffff","#4f46e5"],["#4338ca","#eef0ff"],["#176449","#e3f7ef"],["#22518c","#e4efff"],["#5935a5","#f1ebff"],["#844b0c","#fff2df"],["#a1233d","#fde8eb"],["#20232c","#a5b4fc"],["#ffffff","#4338ca"],["#f1f3f7","#1b1e25"],["#a7b0bf","#1b1e25"],["#a7b0bf","#111318"],["#a7b0bf","#282d37"],["#17182f","#a5a5ff"],["#b6b8ff","#2b3050"],["#94e4c3","#183c34"],["#a8d1ff","#24374e"],["#d6bbff","#352b4f"],["#ffd39a","#453321"],["#ffabb8","#432631"],["#f1f3f7","#303864"],["#f1f3f7","#484e88"],["#c3c9db","#20243a"],["#c3c9db","#252a40"]];
 const luminance=hex=>{const [r,g,b]=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
 for(const [fg,bg] of pairs){const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+" on "+bg);}
});

test("local analytical art and compact bento contract",async()=>{
 const [html,svg,css,view]=await Promise.all([read("docs/index.html"),read("docs/workspace-illustration.svg"),read("docs/analytics.css"),read("docs/analytics-view.mjs")]);
 assert.match(html,/<img src="\.\/workspace-illustration\.svg" alt=""/);
 assert.ok(!/href="https?:|<script|<foreignObject/.test(svg));
 assert.match(css,/\.analysis-timeline \{ grid-column:span 7/);
 assert.match(css,/\.analysis-trend \{ grid-column:span 5/);
 assert.match(css,/grid-column:span 3/);assert.ok(!/backdrop-filter|gradient\(|inset\s+\d/.test(css));
 assert.match(css,/min-height:44px/);
 assert.match(html,/id="timeline-summary"/);
 assert.match(view,/summary\.hidden=!detail/);
 assert.match(view,/\$\("timeline-summary"\)\.hidden=true/);
});

test("theme and expansion controls are local, and sparklines use loaded counts",async()=>{const [html,theme,view,css]=await Promise.all([read("docs/index.html"),read("docs/theme.mjs"),read("docs/analytics-view.mjs"),read("docs/analytics.css")]);assert.match(html,/id="login-theme"/);assert.match(html,/id="workspace-theme"/);assert.equal([...html.matchAll(/data-expand="/g)].length,6);assert.match(theme,/prefers-color-scheme: dark/);assert.ok(!/localStorage|sessionStorage|\bfetch\(/.test(theme));assert.match(view,/all\.daily\.map\(d=>d\.total\)/);assert.match(view,/setExpandedCard\(\)/);assert.match(css,/\.analytics-bento>\.is-expanded \{ grid-column:1\/-1/);});
