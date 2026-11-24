import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("liquid glass theme preserves static UI contracts and local assets",async()=>{
 const [html,css,auth,app]=await Promise.all(["docs/index.html","docs/style.css","docs/auth.css","docs/app.js"].map(read));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ["login","pat-input","pat-hint","github-login","auth-message","workspace","view-title","account-login","logout","headline","period","manage-repos","refresh","repo-filter","updated","notice","metrics","m-repos","m-commits","m-issues","m-priority","panels","activity-panel","activity-list","priority-panel","priority-list","repositories-panel","repo-list","repo-dialog","repo-dialog-title","close-repos","repo-dialog-note","repo-search","repo-options","repo-manual","add-repo","repo-selection-message","repo-count","apply-repos"])assert.ok(ids.includes(id),id);
 for(const id of [...app.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]))assert.ok(ids.includes(id),id);
 assert.match(css,/--radius:28px/);assert.match(css,/--stroke:1px/);assert.match(css,/--glass-shadow:/);assert.match(css,/backdrop-filter:blur/);assert.match(css,/sidebar nav::before/);assert.match(css,/prefers-reduced-transparency:reduce/);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/:focus-visible/);assert.match(auth,/min-height:48px/);
 assert.ok(!/@import|url\(\s*["']?https?:/i.test(css+auth));
 assert.match(html,/script-src 'self'; style-src 'self'/);assert.match(app,/createElementNS/);
});
test("representative semantic text colors meet 4.5:1 contrast",()=>{
 const pairs=[["#152338","#f8fbff"],["#40536c","#e5effb"],["#40536c","#dff4ed"],["#40536c","#dfedfc"],["#40536c","#eae5fc"],["#40536c","#fce9e2"],["#ffffff","#2868b9"],["#e5eeff","#4267a4"],["#245b49","#dff4ed"],["#22548a","#dfedfc"],["#8b3f38","#fce9e2"],["#913333","#f9d8d8"],["#78501c","#fae3c2"],["#1859ab","#d5e8fe"]];
 const luminance=hex=>{const [r,g,b]=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
 for(const [fg,bg] of pairs){const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+" on "+bg);}
});

test("optical illustration is local and decorative",async()=>{
 const [html,svg]=await Promise.all([read("docs/index.html"),read("docs/glass-lens.svg")]);
 assert.match(html,/<img src="\.\/glass-lens\.svg" alt=""/);
 assert.match(svg,/<feDisplacementMap/);assert.match(svg,/xChannelSelector="R" yChannelSelector="G"/);
 assert.match(svg,/data:image\/png;base64,/);
 assert.ok(!/href="https?:|<script|<foreignObject/.test(svg));
});
