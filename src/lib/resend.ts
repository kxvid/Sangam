import { disabled } from './manual-only';
export async function sendEmail(_args:{to:string;subject:string;html:string;text?:string}):Promise<{id:string}>{return disabled('Email');}
