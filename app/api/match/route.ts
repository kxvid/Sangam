import { NextResponse } from 'next/server';
export const runtime='nodejs';
export async function POST(){return NextResponse.json({error:'This legacy integration is disabled in the manual Acquisition release. Use the Acquisition workspace.'},{status:410,headers:{'Cache-Control':'no-store'}});}
