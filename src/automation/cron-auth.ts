import { timingSafeEqual } from 'node:crypto';
export function validCronAuthorization(header:string|null,secret:string|undefined):boolean {
  if(!secret || secret.length<32 || !header) return false;
  const actual=Buffer.from(header),expected=Buffer.from(`Bearer ${secret}`);
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}
