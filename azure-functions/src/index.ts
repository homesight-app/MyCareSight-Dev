import { app, type InvocationContext, type Timer } from '@azure/functions'
import { jobsEnabled, queueName } from './config.js'
import { sql } from './db.js'
import { discoverLeadReminders, discoverVisitRefills } from './discovery.js'
import { errorCode, failure, info } from './log.js'
import { dispatchOutbox } from './outbox.js'
import { syncVisitStatuses } from './status-sync.js'
import { processQueueItem, recordFailure } from './worker.js'

async function guarded(context:InvocationContext,event:string,fn:()=>Promise<unknown>) {
  if (!jobsEnabled()) { info(context,event,{disabled:true}); return }
  try { const result=await fn(); info(context,event,{ok:true,...result as Record<string,number|boolean>}) }
  catch(error) { const code=errorCode(error); failure(context,event,code); throw error }
}

app.timer('syncVisitStatuses',{schedule:'0 */5 * * * *',handler:(_timer:Timer,ctx)=>guarded(ctx,'sync_visit_statuses',()=>syncVisitStatuses(sql))})
app.timer('discoverVisitRefills',{schedule:'0 0 14 * * *',handler:(_timer:Timer,ctx)=>guarded(ctx,'discover_visit_refills',()=>discoverVisitRefills(sql))})
app.timer('discoverLeadReminders',{schedule:'0 0 8 * * *',handler:(_timer:Timer,ctx)=>guarded(ctx,'discover_lead_reminders',()=>discoverLeadReminders(sql))})
app.timer('dispatchJobOutbox',{schedule:'0 * * * * *',handler:(_timer:Timer,ctx)=>guarded(ctx,'dispatch_job_outbox',()=>dispatchOutbox(sql))})

app.storageQueue('processBackgroundJob',{queueName,connection:'AzureWebJobsStorage',
  handler:async(message:unknown,ctx)=>{
    if (!jobsEnabled()) {
      failure(ctx,'process_background_job','JOBS_DISABLED')
      throw Object.assign(new Error('Background jobs are disabled'),{code:'JOBS_DISABLED'})
    }
    const outboxId=typeof message==='object'&&message!==null&&'outboxId' in message?String((message as any).outboxId):''
    if (!/^[0-9a-f-]{36}$/i.test(outboxId)) throw new Error('Invalid queue message')
    try { await processQueueItem(sql,outboxId); info(ctx,'process_background_job',{ok:true}) }
    catch(error) { const code=errorCode(error); await recordFailure(sql,outboxId,code); failure(ctx,'process_background_job',code); throw error }
  }})
