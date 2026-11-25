// Evidence-only attribution. A GitHub User account is NOT proof of human authorship.
// Keep only normalized provider declarations, linked login, account type and a safe source URL.
const list=x=>Array.isArray(x)?x:[];
const PROVIDERS=Object.freeze({
 "codex":"Codex","openai-codex":"Codex","claude-code":"Claude Code","claude":"Claude Code",
 "antigravity":"Antigravity","opencode":"OpenCode","open-code":"OpenCode","cursor":"Cursor",
 "github-copilot":"GitHub Copilot","copilot":"GitHub Copilot","gemini-cli":"Gemini CLI",
 "cline":"Cline","aider":"Aider","hermes":"Hermes","hermes-agent":"Hermes","human":"Human (declared)"
});
function provider(raw){
 const key=String(raw??"").trim().toLowerCase().replace(/[\s_]+/g,"-");
 return Object.hasOwn(PROVIDERS,key)?PROVIDERS[key]:"Other declaration";
}
function declarations(raw,kind){
 if(kind==="merged_pr")return list(raw.labels).flatMap(l=>{
  const name=typeof l==="string"?l:l?.name;
  const match=typeof name==="string"&&name.match(/^ai-agent:\s*(\S.*)$/i);
  return match?[provider(match[1])]:[];
 });
 // Accept a terminal Git trailer block only; do not scan prose or store the message.
 const message=raw.commit?.message;
 if(typeof message!=="string"||message.length>100000)return [];
 const block=message.trimEnd().split(/\r?\n[ \t]*\r?\n/).at(-1)||"";
 if(block===message.trimEnd())return [];
 const lines=block.split(/\r?\n/);
 if(!lines.every(l=>/^[A-Za-z0-9][A-Za-z0-9-]*:[ \t]*\S.*$/.test(l)))return [];
 return lines.flatMap(l=>{const m=l.match(/^AI-Agent:\s*(\S.*)$/i);return m?[provider(m[1])]:[];});
}
function safeSource(raw,repo,kind){
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!=="github.com"||u.port||u.username||u.password||u.search||u.hash)return null;
  const parts=u.pathname.split("/").filter(Boolean);
  if(parts.length!==4||parts.slice(0,2).join("/").toLowerCase()!==repo.toLowerCase())return null;
  if(kind==="commit"?parts[2]!=="commit"||!/^[0-9a-f]{7,64}$/i.test(parts[3]):parts[2]!=="pull"||!/^[1-9]\d*$/.test(parts[3]))return null;
  return u.href;
 }catch{return null;}
}
export function contributionEvidence(raw,kind,repo){
 const user=kind==="commit"?raw.author:raw.user;
 const login=typeof user?.login==="string"&&/^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\[bot\])?$/.test(user.login)?user.login.toLowerCase():null;
 const account=login&&user.type==="Bot"?"Bot":login&&user.type==="User"?"User account":login?"Account (type unknown)":"Unlinked";
 const declared=[...new Set(declarations(raw,kind))].sort();
 const group=declared.length>1?"Multiple declarations":declared[0]||(account==="Bot"?"Bot (provider unknown)":"Unattributed");
 return {actor:login,account,agent:group,evidence:declared.length?(kind==="commit"?"Commit trailer":"PR label"):account==="Bot"?"GitHub Bot account":"No explicit agent evidence",declared,source:safeSource(raw.html_url,repo,kind)};
}
function median(values){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;}
export function analyzeContributions(rows,{kind="commit",actor="all"}={}){
 if(!["commit","merged_pr"].includes(kind))kind="commit";
 const all=list(rows).filter(r=>r.kind===kind),actors=new Map();
 for(const r of all){const key=r.actor?"login:"+r.actor:"unlinked";const item=actors.get(key)||{key,label:r.actor?"@"+r.actor:"Unlinked actor",count:0,declared:0,bots:0};item.count++;if(list(r.declared).length)item.declared++;if(r.account==="Bot")item.bots++;actors.set(key,item);}
 const contributors=[...actors.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
 if(actor!=="all"&&!actors.has(actor))actor="all";
 const selected=all.filter(r=>actor==="all"||(r.actor?"login:"+r.actor:"unlinked")===actor);
 const groups=new Map();
 for(const r of selected){
  const key=r.agent||"Unattributed",g=groups.get(key)||{name:key,count:0,cycles:[],declared:0};
  g.count++;if(list(r.declared).length)g.declared++;if(typeof r.cycleHours==="number"&&Number.isFinite(r.cycleHours)&&r.cycleHours>=0)g.cycles.push(r.cycleHours);groups.set(key,g);
 }
 return {kind,actor,contributors,total:selected.length,allTotal:all.length,declared:selected.filter(r=>list(r.declared).length).length,
  groups:[...groups.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).map(g=>({name:g.name,count:g.count,declared:g.declared,share:selected.length?100*g.count/selected.length:0,cycleHours:median(g.cycles),cycleN:g.cycles.length})),
  records:[...selected].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||String(a.id).localeCompare(String(b.id)))};
}
