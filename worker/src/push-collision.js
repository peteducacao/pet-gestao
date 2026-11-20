// Bloqueio de colisões exatas: mesmo usuário + demanda + canal + minuto.
// Não confundir com duplicidade entre horários diferentes escolhidos pelo usuário.
import {pushNotificationToChannels} from "./push.js";

export async function pushWithoutMinuteDuplicates(env,targets,message,dedupe,instant=Date.now()){
 const minute=new Date(instant).toISOString().slice(0,16);
 const result={android:0,pc:0,skipped:{android:0,pc:0}};
 const taskId=String(message?.taskId||"");
 for(const channel of ["android","pc"]){
  const unique=[...new Set((targets?.[channel]||[]).map(u=>String(typeof u==="string"?u:u?.id||"")).filter(Boolean))];
  for(const userId of unique){
   // Para avisos pessoais sem demanda, o próprio ID do lembrete é a referência.
   const inserted=await env.DB.prepare(
    "INSERT OR IGNORE INTO push_delivery_minute_log(user_id,task_id,channel,minute_key,source,created_at) VALUES(?,?,?,?,?,?)"
   ).bind(userId,taskId,channel,minute,String(message?.kind||"aviso"),new Date().toISOString()).run();
   if(!inserted.meta?.changes){result.skipped[channel]++;continue;}
   let accepted=false;
   try{
    const recipient={android:channel==="android"?[userId]:[],pc:channel==="pc"?[userId]:[]};
    const sent=await pushNotificationToChannels(env,recipient,message,dedupe+"|"+userId+"|"+channel);
    result[channel]+=Number(sent[channel]||0);
    accepted=Number(sent[channel]||0)>0;
   }catch(error){
    console.error("PET Gestão — aviso por minuto indisponível:",String(error?.message||error).slice(0,150));
   }finally{
    if(!accepted){
     // Sem dispositivo aceito, libera o minuto para outro envio/retentativa.
     await env.DB.prepare(
      "DELETE FROM push_delivery_minute_log WHERE user_id=? AND task_id=? AND channel=? AND minute_key=?"
     ).bind(userId,taskId,channel,minute).run().catch(()=>{});
    }
   }
  }
 }
 return result;
}
