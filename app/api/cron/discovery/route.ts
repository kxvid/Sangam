import { NextResponse } from 'next/server';
export const runtime='nodejs';
export async function GET(){return NextResponse.json({error:'Automatic discovery is disabled in the manual Acquisition release.'},{status:410,headers:{'Cache-Control':'no-store'}});}
