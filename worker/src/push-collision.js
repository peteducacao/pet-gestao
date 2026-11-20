// Bloqueio de colisões exatas: mesmo usuário + demanda + canal + minuto.
// Não confundir com duplicidade entre horários diferentes escolhidos pelo usuário.
import {pushNotificationToChannels} from "./push.js";

export async function pushWithoutMinuteDuplicates(env,targets,message,dedupe,instant=Date.now()){
 const minute=new Date(instant).toISOString().slice(0,16);
 const result={android:0,pc:0,skipped:{android:0,pc:0}};
 const taskId=String(message?.taskId||"");
 for(const channel of ["android","pc"]){
  const unique=[...new Set((targets?.[channel]||[]).map(u=>String(typeof u==="string"?u:u?.id||"")).filter(Boolean))];
  // Lotes limitados evitam atrasar o cron quando há muitas pessoas na comissão.
  for(let start=0;start<unique.length;start+=8){
   const outcomes=await Promise.all(unique.slice(start,start+8).map(async userId=>{
    const inserted=await env.DB.prepare(
     "INSERT OR IGNORE INTO push_delivery_minute_log(user_id,task_id,channel,minute_key,source,created_at) VALUES(?,?,?,?,?,?)"
    ).bind(userId,taskId,channel,minute,String(message?.kind||"aviso"),new Date().toISOString()).run();
    if(!inserted.meta?.changes)return {sent:0,skipped:1};
    let accepted=false,delivered=0;
    try{
     const recipient={android:channel==="android"?[userId]:[],pc:channel==="pc"?[userId]:[]};
     const sent=await pushNotificationToChannels(env,recipient,message,dedupe+"|"+userId+"|"+channel);
     delivered=Number(sent[channel]||0);
     accepted=delivered>0;
    }catch(error){
     console.error("PET Gestão — aviso por minuto indisponível:",String(error?.message||error).slice(0,150));
    }finally{
     if(!accepted){
      await env.DB.prepare(
       "DELETE FROM push_delivery_minute_log WHERE user_id=? AND task_id=? AND channel=? AND minute_key=?"
      ).bind(userId,taskId,channel,minute).run().catch(()=>{});
     }
    }
    return {sent:delivered,skipped:0};
   }));
   for(const item of outcomes){
    result[channel]+=item.sent;
    result.skipped[channel]+=item.skipped;
   }
  }
 }
 return result;
}
