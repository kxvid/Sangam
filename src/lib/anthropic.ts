import { disabled } from './manual-only';
export const CLAUDE_MODEL = 'disabled';
export async function completeText(_prompt:string,_opts:{maxTokens?:number;system?:string}={}):Promise<string>{return disabled('AI enrichment');}
