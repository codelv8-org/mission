import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {redact,snapshotFilename,SNAPSHOT_CSP} from "../docs/snapshot.mjs";
test("snapshot filename and token redaction",()=>{
 const pat="github_pat_"+"a".repeat(40),classic="ghp_"+"z".repeat(36);
 assert.equal(redact("prefix "+pat+" "+classic,pat),"prefix [REDACTED] [REDACTED]");
 assert.equal(redact("repo/mission <script> text"),"repo/mission <script> text");
 assert.equal(snapshotFilename("dashboard",new Date("2026-11-25T00:00:00Z")),"mission-dashboard-2026-11-25T00-00-00-000Z.html");
 assert.match(snapshotFilename("../unsafe",new Date(0)),/^mission-workspace-/);
 for(const directive of ["default-src 'none'","script-src 'none'","connect-src 'none'","form-action 'none'","img-src 'none'"])assert.ok(SNAPSHOT_CSP.includes(directive));
});
test("snapshot static boundaries and manual download control",async()=>{
 const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const [html,app,exporter]=await Promise.all(["docs/index.html","docs/app.js","docs/snapshot.mjs"].map(read));
 assert.match(html,/id="download-html"[^>]*disabled/);assert.match(html,/id="snapshot-dialog"/);assert.match(app,/function canExport/);assert.match(app,/!request/);
 assert.match(exporter,/source\.styleSheets/);assert.match(exporter,/node\.hasAttribute\("hidden"\)/);assert.match(exporter,/doc\.createTextNode\(redact/);assert.match(exporter,/URL\.createObjectURL/);assert.match(exporter,/URL\.revokeObjectURL/);
 assert.ok(!/innerHTML|insertAdjacentHTML|\bfetch\(|localStorage|sessionStorage|indexedDB/.test(exporter));
 assert.match(exporter,/u\.hostname==="github\.com"/);
});
