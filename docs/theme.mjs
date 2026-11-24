// Theme preference is session-only and contains no credential or repository data.
export function initTheme(){
  const root=document.documentElement,system=matchMedia("(prefers-color-scheme: dark)");
  const controls=[document.getElementById("login-theme"),document.getElementById("workspace-theme")];
  let choice="system";
  function apply(){
    root.dataset.theme=choice==="system"?(system.matches?"dark":"light"):choice;
    for(const control of controls)control.value=choice;
    document.querySelector('meta[name="theme-color"]').content=root.dataset.theme==="dark"?"#111318":"#f4f5f8";
  }
  for(const control of controls)control.addEventListener("change",()=>{
    choice=["system","light","dark"].includes(control.value)?control.value:"system";
    apply();
  });
  system.addEventListener("change",()=>{if(choice==="system")apply();});
  apply();
}
