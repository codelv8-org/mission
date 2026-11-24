export const split=value=>String(value||"").split(",").map(x=>x.trim()).filter(Boolean);
export function accountAllowed(user,env){
  if(!Number.isSafeInteger(user?.id)||user.id<=0||typeof user.login!=="string"||!user.login)return false;
  const allowed=split(env.GITHUB_ALLOWED_USERS).map(v=>v.toLowerCase());
  return allowed.includes(String(user.id))||allowed.includes(user.login.toLowerCase());
}
export function validRepo(name){return typeof name==="string"&&/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(name)&&name.split("/").every(p=>p!=="."&&p!=="..");}
export function configuredRepos(raw){
  const names=[...new Set(split(raw))];
  if(names.length>8||names.some(x=>!validRepo(x)))throw Error("Invalid repository configuration");
  return names;
}
export function priority(labels){
  const names=(Array.isArray(labels)?labels:[]).map(x=>String(x.name||x).toLowerCase().trim());
  const aliases=[["p0","priority:p0","priority:critical","critical","priority: critical"],["p1","priority:p1","priority:high","high","priority: high"],["p2","priority:p2","priority:medium","medium","priority: medium"],["p3","priority:p3","priority:low","low","priority: low"]];
  const found=aliases.findIndex(group=>group.some(x=>names.includes(x)));
  const rank=found===-1?4:found;
  return {rank,priority:rank===4?"—":"P"+rank,blocked:names.some(n=>n==="blocked"||n==="status:blocked"||n==="status: blocked")};
}
