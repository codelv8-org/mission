// Static, user-initiated export of the current rendered view. No data cache or API.
const SVG="http://www.w3.org/2000/svg";
const HTML_TAGS=new Set("div aside main section article header footer nav p h1 h2 h3 strong span small a table colgroup col thead tbody tfoot tr th td meter details summary".split(" "));
const SVG_TAGS=new Set("svg g path rect circle polyline polygon line text title desc".split(" "));
const HTML_ATTRS=new Set("id class role title aria-label aria-current aria-pressed scope colspan rowspan span min max value".split(" "));
const SVG_ATTRS=new Set("class role aria-label aria-hidden focusable viewBox preserveAspectRatio width height x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray opacity fill-opacity text-anchor font-size font-weight transform".split(" "));
const OMIT=".toolbar-actions,.account,.skip-link,.analysis-controls,.intel-local-controls,.expand-card,#timeline-clear,.orbit-controls,.orbit-repos,.orbit-more,.orbit-clear,.nav:not(.active)";
const STYLES=["style.css","auth.css","analytics.css","orbit.css","intelligence.css"];
export const SNAPSHOT_CSP="default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
export function redact(value,secret=""){
  let s=String(value??"");
  if(secret)s=s.split(secret).join("[REDACTED]");
  return s.replace(/\b(?:github_pat_|gh[pousr]_)[a-zA-Z0-9_]{16,}/g,"[REDACTED]");
}
export function snapshotFilename(view,now=new Date()){
  const safe=["dashboard","activity","analyze","performance","priority","repositories"].includes(view)?view:"workspace";
  return "mission-"+safe+"-"+now.toISOString().replace(/[:.]/g,"-")+".html";
}
function styleText(source){
  const sheets=[...source.styleSheets],base=new URL(".",source.baseURI);
  return STYLES.map(name=>{
    const href=new URL(name,base).href;
    const sheet=sheets.find(s=>s.href===href);
    if(!sheet)throw Error("Snapshot styles not ready");
    const css=[...sheet.cssRules].map(r=>r.cssText).join("\n");
    if(/<\/style|@import|url\s*\(/i.test(css))throw Error("Unsupported resource in snapshot stylesheet");
    return css;
  }).join("\n");
}
function addMeta(doc,attrs){
  const meta=doc.createElement("meta");
  for(const [k,v] of Object.entries(attrs))meta.setAttribute(k,v);
  doc.head.append(meta);
}
function logo(doc){
  const svg=doc.createElementNS(SVG,"svg");svg.setAttribute("viewBox","0 0 64 64");svg.setAttribute("class","snapshot-mark");svg.setAttribute("aria-hidden","true");
  const rect=doc.createElementNS(SVG,"rect");for(const [k,v] of Object.entries({x:2,y:2,width:60,height:60,rx:14,fill:"#4f46e5"}))rect.setAttribute(k,v);
  const path=doc.createElementNS(SVG,"path");for(const [k,v] of Object.entries({d:"M14 45V20l18 15 18-15v25M32 35v10",fill:"none",stroke:"#fff","stroke-width":5,"stroke-linecap":"round","stroke-linejoin":"round"}))path.setAttribute(k,v);
  svg.append(rect,path);return svg;
}
function copyVisible(node,doc,secret){
  if(node.nodeType===3)return doc.createTextNode(redact(node.nodeValue,secret));
  if(node.nodeType!==1||node.hasAttribute("hidden")||node.matches(OMIT))return null;
  const isSvg=node.namespaceURI===SVG,tag=node.localName;
  if(tag==="img"&&node.closest(".brand"))return logo(doc);
  const passiveButton=tag==="button"&&node.matches(".heat-cell,.analysis-project-link,.nav.active,.orbit-pill,.orbit-group-toggle");
  if(!isSvg&&!HTML_TAGS.has(tag)&&!passiveButton)return null;
  if(isSvg&&!SVG_TAGS.has(tag))return null;
  const out=isSvg?doc.createElementNS(SVG,tag):doc.createElement(passiveButton?"span":tag);
  const allowed=isSvg?SVG_ATTRS:HTML_ATTRS;
  for(const attr of node.attributes){
    if(!allowed.has(attr.name))continue;
    if(isSvg&&/url\s*\(|javascript:|https?:|data:/i.test(attr.value))continue;
    out.setAttribute(attr.name,redact(attr.value,secret));
  }
  if(tag==="a"){
    try{
      const u=new URL(node.getAttribute("href")||"");
      const href=u.origin+u.pathname+u.hash;
      if(u.protocol==="https:"&&u.hostname==="github.com"&&!u.port&&!u.username&&!u.password&&redact(href,secret)===href){
        out.href=href;out.target="_blank";out.rel="noopener noreferrer";
      }
    }catch{}
  }
  if(tag==="details")out.open=true;
  if(passiveButton&&node.getAttribute("aria-pressed")==="true"){out.classList.add("snapshot-selected");out.removeAttribute("aria-pressed");}
  for(const child of node.childNodes){const copy=copyVisible(child,doc,secret);if(copy)out.append(copy);}
  return out;
}
const EXPORT_STYLE=[
".snapshot .snapshot-mark{width:34px;height:34px;flex:none}",
".snapshot .snapshot-meta{padding:12px 24px;border-bottom:1px solid var(--line);background:var(--surface);color:var(--muted);font-size:12px;overflow-wrap:anywhere}",
".snapshot .snapshot-meta strong{color:var(--ink)}",
".snapshot .topbar{min-height:48px}",
".snapshot .rows,.snapshot .timeline-detail-list{max-height:none;overflow:visible}",
".snapshot .timeline-scroll{max-height:none;overflow-x:auto}",
".snapshot .nav,.snapshot .heat-cell,.snapshot .analysis-project-link{cursor:default}",
".snapshot .snapshot-selected{outline:2px solid var(--focus);outline-offset:1px}",
".snapshot .analysis-project-link{min-height:auto}",
"@media(max-width:760px){.snapshot .snapshot-meta{padding:12px}.snapshot .sidebar{position:static}.snapshot .sidebar nav{display:block}.snapshot .sidebar .nav.active{justify-content:flex-start}}",
"@media print{.snapshot .shell{display:block}.snapshot .sidebar{display:none}.snapshot .content{padding:0}.snapshot .topbar,.snapshot .snapshot-meta{padding:8px 0}.snapshot .card{box-shadow:none;break-inside:avoid-page}.snapshot .analysis-timeline{break-inside:auto}.snapshot .analytics-bento{display:block}.snapshot .analytics-bento>.card,.snapshot .bento>.card{margin-bottom:12px}}"
].join("\n");
export function buildSnapshot({source=document,view,scope,period,eventType,fetchedAt,exportedAt=new Date(),secret=""}){
  const workspace=source.getElementById("workspace");
  if(!workspace||workspace.hidden||!Number.isFinite(Date.parse(fetchedAt)))throw Error("No loaded snapshot");
  const css=styleText(source),doc=source.implementation.createHTMLDocument("Mission snapshot");
  doc.documentElement.lang=source.documentElement.lang||"th";
  doc.documentElement.dataset.theme=source.documentElement.dataset.theme==="dark"?"dark":"light";
  doc.head.replaceChildren();
  addMeta(doc,{charset:"utf-8"});
  addMeta(doc,{"http-equiv":"Content-Security-Policy",content:SNAPSHOT_CSP});
  addMeta(doc,{name:"viewport",content:"width=device-width, initial-scale=1"});
  addMeta(doc,{name:"referrer",content:"no-referrer"});
  addMeta(doc,{name:"robots",content:"noindex,nofollow"});
  const title=doc.createElement("title");title.textContent="Mission — "+redact(view,secret)+" snapshot";doc.head.append(title);
  const style=doc.createElement("style");style.textContent=css+"\n"+EXPORT_STYLE;doc.head.append(style);
  doc.body.className="snapshot";
  const content=copyVisible(workspace,doc,secret);
  if(!content)throw Error("No visible workspace");
  doc.body.append(content);
  const footer=content.querySelector(".sidebar-foot");if(footer)footer.textContent="Saved report · read-only";
  const meta=doc.createElement("section");meta.className="snapshot-meta";
  const heading=doc.createElement("strong");heading.textContent="HTML snapshot · ไม่ใช่ข้อมูลสด";
  const line=doc.createElement("p");line.textContent=redact([scope,period,eventType].filter(Boolean).join(" · "),secret);
  const times=doc.createElement("p");times.textContent="Data fetched: "+new Date(fetchedAt).toISOString()+" · Exported: "+exportedAt.toISOString()+" (UTC)";
  const note=doc.createElement("p");note.textContent="เฉพาะข้อมูลที่โหลดและแสดงในหน้าที่เลือก · อาจมีข้อมูล Private Repository · ไม่มีการเชื่อมต่อ API หรือการอัปเดตข้อมูล";
  meta.append(heading,line,times,note);
  content.querySelector(".topbar").after(meta);
  return "<!doctype html>\n"+doc.documentElement.outerHTML;
}
export function downloadSnapshot(options){
  const html=buildSnapshot(options);
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=snapshotFilename(options.view,options.exportedAt);link.hidden=true;
  document.body.append(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
