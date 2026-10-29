import { json } from '@/src/acquisition/http';
import { enqueueDueRuns } from '@/src/automation/store';
import { processOne } from '@/src/automation/worker';
import { validCronAuthorization } from '@/src/automation/cron-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request) {
  if(!validCronAuthorization(request.headers.get('authorization'),process.env.CRON_SECRET)) return json({error:'Scheduler authorization required.'},401);
  try {
    const queued=await enqueueDueRuns();
    const statuses:string[]=[];
    const started=Date.now();
    while(statuses.length<5 && Date.now()-started<40_000) {const job=await processOne();if(!job)break;statuses.push(job.status);}
    return json({queued,processed:statuses.length,statuses,collection:'uploaded_exports_only',outbound:'disabled'});
  }catch{return json({error:'Scheduled processing could not finish. Saved jobs will be checked on the next run.'},503);}
}
