import { disabled } from './manual-only';
export async function sendSMS(_to:string,_body:string):Promise<{sid:string}>{return disabled('SMS');}
