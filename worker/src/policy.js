export const split = value => String(value||"").split(",").map(x=>x.trim()).filter(Boolean);
export function accountAllowed(payload, env){
  if(payload.email_verified!==true||typeof payload.email!=="string"||typeof payload.sub!=="string"||!payload.sub)return false;
  if(split(env.GOOGLE_ALLOWED_SUBS).includes(payload.sub))return true;
  const email=payload.email.toLowerCase();
  const authoritative=email.endsWith("@gmail.com")||(typeof payload.hd==="string"&&payload.hd.length>0);
  return authoritative&&split(env.GOOGLE_ALLOWED_EMAILS).map(x=>x.toLowerCase()).includes(email);
}
export function configuredRepos(raw){
  const names=[...new Set(split(raw))];
  if(!names.length||names.length>8||names.some(x=>!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(x)||x.split("/").some(p=>p==="."||p==="..")))throw Error("Invalid repository configuration");
  return names;
}
export function priority(labels){
  const names=(Array.isArray(labels)?labels:[]).map(x=>String(x.name||x).toLowerCase().trim());
  const aliases=[["p0","priority:p0","priority:critical","critical","priority: critical"],["p1","priority:p1","priority:high","high","priority: high"],["p2","priority:p2","priority:medium","medium","priority: medium"],["p3","priority:p3","priority:low","low","priority: low"]];
  const found=aliases.findIndex(group=>group.some(x=>names.includes(x)));
  const rank=found===-1?4:found;
  return {rank,priority:rank===4?"—":"P"+rank,blocked:names.some(n=>n==="blocked"||n==="status:blocked"||n==="status: blocked")};
}
