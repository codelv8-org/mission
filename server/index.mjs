import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import api from "./api.mjs";
import {configuredRepos,split} from "./policy.mjs";

const assets = new Map([
  ["/",["index.html","text/html; charset=utf-8"]],
  ["/index.html",["index.html","text/html; charset=utf-8"]],
  ["/app.js",["app.js","text/javascript; charset=utf-8"]],
  ["/style.css",["style.css","text/css; charset=utf-8"]],
  ["/mark.svg",["mark.svg","image/svg+xml"]]
]);

export function validate(env) {
  let origin;
  try { origin=new URL(env.APP_ORIGIN); } catch { throw Error("APP_ORIGIN must be an exact HTTPS origin"); }
  if(origin.protocol!=="https:"||origin.origin!==env.APP_ORIGIN||origin.username||origin.password)throw Error("APP_ORIGIN must be an exact HTTPS origin");
  if(!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||""))throw Error("Invalid GOOGLE_CLIENT_ID");
  if(!split(env.GOOGLE_ALLOWED_EMAILS).length&&!split(env.GOOGLE_ALLOWED_SUBS).length)throw Error("Explicit Google account allowlist required");
  if(!env.GITHUB_TOKEN?.trim())throw Error("GITHUB_TOKEN required");
  configuredRepos(env.GITHUB_REPOSITORIES);
  return {...env,ALLOWED_ORIGIN:origin.origin};
}
export function createMissionServer(rawEnv){
  const env=validate(rawEnv);
  return createServer(async(req,res)=>{
    const send=(status,type,body,headers={})=>{
      res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Cross-Origin-Opener-Policy":"same-origin-allow-popups","X-Frame-Options":"DENY",...headers});
      res.end(req.method==="HEAD"?undefined:body);
    };
    const json=(status,data)=>send(status,"application/json; charset=utf-8",JSON.stringify(data));
    try {
      // Reject absolute-form and ambiguous request targets. Only named assets are served.
      if(!req.url?.startsWith("/")||req.url.startsWith("//"))return json(400,{error:"invalid_request"});
      const path=new URL(req.url,env.APP_ORIGIN).pathname;
      if(path==="/api/dashboard"){
        if(!["GET","OPTIONS"].includes(req.method))return json(405,{error:"method_not_allowed"});
        const origin=req.headers.origin;
        if(origin&&origin!==env.APP_ORIGIN)return json(403,{error:"origin_not_allowed"});
        const headers=new Headers({Origin:origin||env.APP_ORIGIN});
        if(req.headers.authorization)headers.set("Authorization",req.headers.authorization);
        const result=await api.fetch(new Request(env.APP_ORIGIN+path,{method:req.method,headers}),env);
        const out=Object.fromEntries(result.headers);
        const body=Buffer.from(await result.arrayBuffer());
        send(result.status,out["content-type"]||"application/json",body,out);
        return;
      }
      if(!["GET","HEAD"].includes(req.method))return json(405,{error:"method_not_allowed"});
      if(path==="/healthz")return json(200,{status:"ok"});
      if(path==="/config.js"){
        const config={googleClientId:env.GOOGLE_CLIENT_ID,apiBase:env.APP_ORIGIN};
        return send(200,"text/javascript; charset=utf-8","window.MISSION_CONFIG = Object.freeze("+JSON.stringify(config)+");\n");
      }
      const asset=assets.get(path);
      if(!asset)return json(404,{error:"not_found"});
      const body=await readFile(new URL("../docs/"+asset[0],import.meta.url));
      send(200,asset[1],body);
    }catch{if(!res.headersSent)json(500,{error:"internal_error"});else res.destroy();}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const server=createMissionServer(process.env);
    // Keep the application private behind aaPanel's HTTPS reverse proxy.
    server.listen(3107,"127.0.0.1",()=>console.log("Mission listening on 127.0.0.1:3107"));
  }catch(e){console.error("Mission configuration error:",e.message);process.exitCode=1;}
}
