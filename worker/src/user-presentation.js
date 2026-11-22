const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error;};
export const DASHBOARD_KEYS=["active","mine","overdue","completed","updates"];
export const PROFILE_THEMES=["lavender","ocean","forest","sunset","midnight","neutral","photo"];
export const APPEARANCE_MODES=["light","dark"];
const DEFAULT_DASHBOARD={active:true,mine:true,overdue:true,completed:true,updates:true};
export const presentationDefaults=()=>({
 dashboard:{...DEFAULT_DASHBOARD},profileTheme:"lavender",profileImage:null,appearanceMode:"light"
});
export async function presentationGet(db,user){
 if(!user?.id)fail("Entre na sua conta.",401);
 const row=await db.prepare("SELECT dashboard,profile_theme,profile_image FROM user_presentation_preferences WHERE user_id=?").bind(user.id).first();
 let parsed={};try{parsed=JSON.parse(row?.dashboard||"{}")}catch{}
 const dashboard=Object.fromEntries(DASHBOARD_KEYS.map(key=>[key,typeof parsed?.[key]==="boolean"?parsed[key]:true]));
 return {dashboard,profileTheme:PROFILE_THEMES.includes(row?.profile_theme)?row.profile_theme:"lavender",
  profileImage:row?.profile_image||null,appearanceMode:parsed?.appearanceMode==="dark"?"dark":"light"};
}
export async function presentationSave(db,user,input){
 if(!user?.id)fail("Entre na sua conta.",401);
 if(user.must_change_password)fail("Altere a senha temporária para configurar sua conta.",403);
 const dashboard=input?.dashboard;
 if(!dashboard||typeof dashboard!=="object"||Array.isArray(dashboard)||
  DASHBOARD_KEYS.some(key=>typeof dashboard[key]!=="boolean")||
  Object.keys(dashboard).some(key=>!DASHBOARD_KEYS.includes(key)))
  fail("Escolha as opções válidas do painel.");
 const theme=String(input.profileTheme||"");
 if(!PROFILE_THEMES.includes(theme))fail("Fundo de identificação inválido.");
 const image=input.profileImage===null?null:input.profileImage;
 if(image!==null&&typeof image!=="string")fail("A imagem de fundo deve ser JPG.");
 if(image){
  const match=image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||match[1].length>215000||match[1].length<80||!match[1].startsWith("/9j/"))
   fail("Use uma foto JPG de fundo com até 155 KB.",413);
 }
 if(theme==="photo"&&!image)fail("Escolha uma foto para usar como fundo.");
 // O modo é salvo na coluna JSON existente, sem migração nem exposição de outros dados.
 const appearanceMode=input.appearanceMode===undefined?(await presentationGet(db,user)).appearanceMode:input.appearanceMode;
 if(!APPEARANCE_MODES.includes(appearanceMode))fail("Modo de aparência inválido.");
 await db.prepare("INSERT INTO user_presentation_preferences(user_id,dashboard,profile_theme,profile_image,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET dashboard=excluded.dashboard,profile_theme=excluded.profile_theme,profile_image=excluded.profile_image,updated_at=excluded.updated_at")
  .bind(user.id,JSON.stringify({...Object.fromEntries(DASHBOARD_KEYS.map(key=>[key,dashboard[key]])),appearanceMode}),theme,image,new Date().toISOString()).run();
 return presentationGet(db,user);
}
