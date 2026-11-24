const encoder=new TextEncoder(),decoder=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
const unb64=s=>Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const aad=env=>encoder.encode("mission-session-v1|"+env.APP_URL+"|"+env.GITHUB_CLIENT_ID);
async function key(env){
  const material=await crypto.subtle.importKey("raw",encoder.encode(env.GITHUB_CLIENT_SECRET),"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:encoder.encode("mission-session-v1"),info:aad(env)},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function sealSession(payload,env){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(env)},await key(env),encoder.encode(JSON.stringify(payload)));
  return b64(iv)+"."+b64(ct);
}
export async function openSession(value,env){
  if(typeof value!=="string"||value.length>4096||!/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(value))throw Error("Invalid session");
  const [i,c]=value.split("."),iv=unb64(i),ct=unb64(c);
  if(b64(iv)!==i||b64(ct)!==c)throw Error("Invalid encoding");
  const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:aad(env)},await key(env),ct);
  const p=JSON.parse(decoder.decode(plaintext));
  if(!Number.isSafeInteger(p.id)||p.id<=0||!Number.isInteger(p.exp)||p.exp<=Math.floor(Date.now()/1000)||!/^ghu_[A-Za-z0-9_]+$/.test(p.token||""))throw Error("Expired or invalid session");
  return p;
}
