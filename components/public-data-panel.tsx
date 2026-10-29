"use client";
import {useEffect,useRef,useState} from 'react';
import type {AcquisitionState} from '@/src/acquisition/types';
import {PUBLIC_DATA_SOURCES} from '@/src/public-data/catalog';
import type {CensusLookupResult} from '@/src/public-data/census';
import {Panel,Pill,Empty,prettyDate} from './acquisition-ui';

export function PublicDataPanel({workspaceId,state,version,onWorkspaceChanged}:{workspaceId:string;state:AcquisitionState;version:number;onWorkspaceChanged:()=>void}) {
  const [leadId,setLeadId]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<CensusLookupResult|null>(null);
  const controller=useRef<AbortController|null>(null);
  const workspace=useRef(workspaceId);workspace.current=workspaceId;
  useEffect(()=>{setLeadId('');setConfirmed(false);setResult(null);setError('');setBusy(false);return()=>controller.current?.abort();},[workspaceId]);
  const lead=state.leads.find(item=>item.id===leadId);
  async function lookup() {
    if(!lead||!confirmed||busy)return;
    const target=workspaceId;
    controller.current?.abort();const requestController=new AbortController();controller.current=requestController;
    setBusy(true);setError('');setResult(null);
    try {
      const response=await fetch('/api/public-data',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},signal:requestController.signal,body:JSON.stringify({workspaceId:target,version,command:{type:'lookup_address',leadId:lead.id,confirmAddressDisclosure:true}})});
      const data=await response.json();
      if(workspace.current!==target||requestController.signal.aborted)return;
      if(!response.ok)throw new Error(data.error||'Address lookup unavailable.');
      setResult(data.result);
    } catch(cause) {if(workspace.current===target&&!requestController.signal.aborted)setError(cause instanceof Error?cause.message:'Address lookup unavailable.');}
    finally {if(workspace.current===target&&!requestController.signal.aborted){setBusy(false);onWorkspaceChanged();}}
  }
  return <div className="acq-stack">
    <Panel title="Free public data" description="Supplement your authorized PropStream exports with clearly labeled public information. These sources do not supply ready-to-call motivated sellers.">
      <div className="px-6 pb-6 space-y-5">{PUBLIC_DATA_SOURCES.map(source=><article key={source.id} className="border border-ink-800 rounded-xl p-4">
        <div className="flex flex-wrap justify-between gap-3"><h3>{source.name}</h3><Pill tone={source.status==='held'?'warn':'good'}>{source.status==='held'?'On hold':'Available per address'}</Pill></div>
        <p className="text-sm text-ink-300 mt-3">{source.summary}</p>
        {source.holdReason&&<p className="text-xs text-amber-300 mt-2">{source.holdReason}</p>}
        <p className="text-xs text-ink-400 mt-3">No API key or provider fee · Checked {source.verifiedOn} · Hosting usage still applies</p>
        <div className="flex gap-4 text-xs mt-3"><a className="text-lime-300 underline" href={source.referenceUrl} target="_blank" rel="noreferrer">Official source</a><a className="text-lime-300 underline" href={source.termsUrl} target="_blank" rel="noreferrer">Usage information</a></div>
      </article>)}</div>
    </Panel>
    <Panel title="Check one property address" description="Census returns approximate address matches. The result is displayed here; Sangam does not overwrite your address or add motivation points.">
      {!state.leads.length?<Empty title="Import a property first">Use the authorized export workflow to add a real lead, or select the practice workspace to test with fictional records.</Empty>:<form className="acq-form" onSubmit={event=>{event.preventDefault();void lookup();}}>
        <fieldset disabled={busy} className="space-y-4">
          <div className="acq-field"><label htmlFor="public-data-lead">Property</label><select id="public-data-lead" value={leadId} onChange={event=>{setLeadId(event.target.value);setConfirmed(false);setResult(null);}} required><option value="">Choose a property…</option>{state.leads.map(item=><option key={item.id} value={item.id}>{item.address}{item.synthetic?' · Practice':''}</option>)}</select></div>
          {lead&&<p className="text-sm text-ink-300">Address to send: {lead.address}, {lead.city}, CA {lead.zip}</p>}
          <label className="flex gap-3 text-sm text-ink-300"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required/>Send this property address to the U.S. Census Geocoder for this lookup. Owner names, phone numbers and notes stay in Sangam.</label>
          <p className="text-xs text-ink-400">Up to 20 lookups per workspace in 24 hours. Failed requests count toward the allowance. Results remain on this screen until you leave or refresh; source time is shown below.</p>
          <button className="btn btn-primary" type="submit" disabled={busy||!lead||!confirmed}>{busy?'Checking address…':'Look up address'}</button>
        </fieldset>
      </form>}
      {error&&<p role="alert" className="px-6 pb-6 text-sm text-red-300">{error}</p>}
      {result&&<div className="px-6 pb-6 space-y-3"><Pill tone={result.status==='unique'?'good':'warn'}>{result.status==='unique'?'One address match':result.status==='ambiguous'?'Multiple matches — review needed':'No match'}</Pill>{result.candidates.map((item,index)=><p key={index} className="text-sm text-ink-200">{item.matchedAddress}<br/><span className="text-xs text-ink-400">Approximate coordinates: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span></p>)}<p className="text-xs text-ink-400">Retrieved {prettyDate(result.provenance.retrievedAt)} · Census benchmark {result.provenance.benchmarkName}. Source update date is not supplied. This does not verify ownership, damage, flood zone or contact permission.</p></div>}
    </Panel>
  </div>;
}
