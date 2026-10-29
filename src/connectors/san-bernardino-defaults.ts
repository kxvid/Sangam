import {createHash} from 'node:crypto';

export const MAX_COUNTY_CSV_BYTES = 5_000_000;
export const MAX_COUNTY_CSV_ROWS = 10_000;
const MAX_FIELD_LENGTH = 4_096;
const HEADERS = ['Roll Yr','Tax Rate Yr','Account Number','Bill Number','Installment Number','Escrow Company','TRA Code','TRA Name','Installment Balance','Bill Amount','Bill Balance','Balance Status','Account Status','Roll','Transfer Destination','Bill Type','Bill Category','Tax Default Number','Tax Default Date','Redemption Status','Redemption Total','In Active Payment Plan?'];
const DATASETS = {
  newer: 'https://opendata.sbcountyatc.gov/dataset/d9541b0c4b2711f0a6031973736cf94a',
  older: 'https://opendata.sbcountyatc.gov/dataset/9bb708264b2811f08edbee73736cf94a',
} as const;

export interface CountySourceMetadata {
  dataset: keyof typeof DATASETS;
  sourceReference: string;
  exportDate: string;
  sourceUpdatedDate?: string;
}
type EvidenceStatus = 'paid_in_full' | 'unpaid' | 'unknown';
interface Observation {
  sourceRows: number[];
  fields: Record<string,string>;
  normalized: {
    billBalance: string | null;
    billBalanceStatus: EvidenceStatus;
    accountStatus: EvidenceStatus;
    taxDefaultDate: string | null;
    inActivePaymentPlan: boolean | null;
  };
}
interface AccountEvidence {
  sourceAccountNumber: string;
  parcelNumber: null;
  observations: Observation[];
}

export class CountyResearchError extends Error {
  constructor(public readonly code: string, message: string) {super(message);}
}

function dateValue(value: string, allowCountyFormat: boolean): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const county = allowCountyFormat ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value) : null;
  const parts = iso ? [Number(iso[1]),Number(iso[2]),Number(iso[3])] : county ? [Number(county[3]),Number(county[1]),Number(county[2])] : null;
  if (!parts) throw new CountyResearchError('invalid_date','Use a valid date; source dates need YYYY-MM-DD and county dates need M/D/YYYY or YYYY-MM-DD.');
  const [year,month,day] = parts;
  const parsed = new Date(Date.UTC(year,month - 1,day));
  if (year < 1900 || year > 2100 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new CountyResearchError('invalid_date','A date is outside the supported calendar range.');
  }
  return parsed.toISOString().slice(0,10);
}

function sourceMetadata(source: CountySourceMetadata, now: Date) {
  if (!source || !Object.hasOwn(DATASETS,source.dataset) || typeof source.sourceReference !== 'string' || !source.sourceReference.trim() || source.sourceReference.length > 1_000 || /[\u0000-\u001f]/.test(source.sourceReference)) {
    throw new CountyResearchError('invalid_source','Supply a supported dataset and a nonempty source reference of at most 1,000 characters.');
  }
  if (typeof source.exportDate !== 'string' || (source.sourceUpdatedDate !== undefined && typeof source.sourceUpdatedDate !== 'string') || !Number.isFinite(now.getTime())) {
    throw new CountyResearchError('invalid_date','Supply valid source/export dates.');
  }
  const exportDate = dateValue(source.exportDate,false);
  const sourceUpdatedDate = source.sourceUpdatedDate ? dateValue(source.sourceUpdatedDate,false) : null;
  if (exportDate > now.toISOString().slice(0,10) || (sourceUpdatedDate && sourceUpdatedDate > exportDate)) {
    throw new CountyResearchError('invalid_date','Source dates cannot be after export; export cannot be in the future.');
  }
  return {dataset:source.dataset,sourceUrl:DATASETS[source.dataset],sourceReference:source.sourceReference,exportDate,sourceUpdatedDate};
}

/** Parses only the observed county schema. Never fetches a URL or creates an operational lead. */
function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  function pushField() {
    row.push(field); field = ''; closed = false;
    if (row.length > 23) throw new CountyResearchError('invalid_schema','County CSV has more columns than the supported schema.');
  }
  function pushRow() {
    pushField();
    if (row.some(cell => cell !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_COUNTY_CSV_ROWS + 1) throw new CountyResearchError('too_many_rows','County CSV exceeds 10,000 rows; supply a deliberately selected smaller file.');
  }
  const text = input.replace(/^\uFEFF/,'');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i+1] === '"') {field += '"'; i++;}
        else {quoted = false; closed = true;}
      } else field += char;
    } else if (char === ',') pushField();
    else if (char === '\n' || char === '\r') {pushRow(); if (char === '\r' && text[i+1] === '\n') i++;}
    else if (char === '"') {
      if (field || closed) throw new CountyResearchError('malformed_csv','County CSV has an unexpected quote.');
      quoted = true;
    } else {
      if (closed) throw new CountyResearchError('malformed_csv','County CSV has text after a closing quote.');
      field += char;
    }
    if (field.length > MAX_FIELD_LENGTH) throw new CountyResearchError('too_large','County CSV contains an oversized field.');
  }
  if (quoted) throw new CountyResearchError('malformed_csv','County CSV ends inside a quoted field.');
  if (field || row.length || closed) pushRow();
  if (rows.length < 2) throw new CountyResearchError('malformed_csv','County CSV needs a header and at least one observation.');
  return rows;
}

function status(value: string): EvidenceStatus {
  if (value.trim().toLowerCase() === 'paid in full') return 'paid_in_full';
  if (value.trim().toLowerCase() === 'unpaid') return 'unpaid';
  return 'unknown';
}
function money(value: string): string | null {
  if (!value.trim()) return null;
  if (!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(value.trim())) throw new CountyResearchError('invalid_amount','A county amount is not a supported plain decimal; review the source file.');
  return value.trim();
}

export function decodeSanBernardinoDefaults(input: string | Uint8Array, source: CountySourceMetadata, now = new Date()) {
  const metadata = sourceMetadata(source,now);
  const bytes = typeof input === 'string' ? Buffer.from(input,'utf8') : input;
  if (bytes.byteLength > MAX_COUNTY_CSV_BYTES) throw new CountyResearchError('too_large','County CSV exceeds 5 MB; supply a deliberately selected smaller file.');
  let text: string;
  try {text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch {throw new CountyResearchError('invalid_encoding','County CSV must be valid UTF-8.');}
  if (text.includes('\0') || (typeof input === 'string' && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input))) {
    throw new CountyResearchError('invalid_encoding','County CSV must be valid UTF-8 without NUL characters.');
  }
  const [headers,...rows] = parseRows(text);
  const headerSet = new Set(headers);
  if (headers.length !== 23 || headerSet.size !== 23 || HEADERS.some(header => !headerSet.has(header)) || (headerSet.has('Tax Year') === headerSet.has('Assessment Year'))) {
    throw new CountyResearchError('invalid_schema','County CSV must use the documented 23-column tax-default schema. Owner/contact columns and unexpected schema changes are not accepted.');
  }
  const accounts = new Map<string,AccountEvidence>();
  const exactRows = new Map<string,Observation>();
  let duplicateRows = 0, paidBillObservations = 0, unpaidBillObservations = 0, rowsWithUnknownFacts = 0;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length !== headers.length) throw new CountyResearchError('malformed_csv',`County CSV observation ${i+1} has the wrong number of columns; no partial result was produced.`);
    const fingerprint = JSON.stringify(cells);
    const duplicate = exactRows.get(fingerprint);
    if (duplicate) {duplicate.sourceRows.push(i+2); duplicateRows++; continue;}
    const fields = Object.fromEntries(headers.map((header,index) => [header,cells[index]]));
    if (!/^\d{13}$/.test(fields['Account Number']) || !/^\d{1,24}$/.test(fields['Bill Number'])) {
      throw new CountyResearchError('invalid_identifier','Account numbers must be 13 digits and bill numbers must be digit strings; preserve all leading zeros.');
    }
    for (const key of ['Installment Balance','Bill Amount','Bill Balance','Redemption Total']) money(fields[key]);
    const taxDefaultDate = fields['Tax Default Date'].trim() ? dateValue(fields['Tax Default Date'].trim(),true) : null;
    if (taxDefaultDate && taxDefaultDate > metadata.exportDate) throw new CountyResearchError('invalid_date','A tax-default date cannot be after the export date.');
    const plan = fields['In Active Payment Plan?'].trim().toLowerCase();
    const normalized = {
      billBalance: money(fields['Bill Balance']),
      billBalanceStatus: status(fields['Balance Status']),
      accountStatus: status(fields['Account Status']),
      taxDefaultDate,
      inActivePaymentPlan: plan === 'yes' ? true : plan === 'no' ? false : null,
    };
    const observation: Observation = {sourceRows:[i+2],fields,normalized};
    exactRows.set(fingerprint,observation);
    const account = accounts.get(fields['Account Number']) ?? {sourceAccountNumber:fields['Account Number'],parcelNumber:null,observations:[]};
    account.observations.push(observation);
    accounts.set(account.sourceAccountNumber,account);
    if (normalized.billBalanceStatus === 'paid_in_full') paidBillObservations++;
    if (normalized.billBalanceStatus === 'unpaid') unpaidBillObservations++;
    if (Object.values(normalized).some(value => value === null || value === 'unknown')) rowsWithUnknownFacts++;
  }
  return {
    schemaVersion:1,
    purpose:'county_tax_default_research' as const,
    status:'held' as const,
    county:'San Bernardino' as const,
    holds:['source_use_review_required','parcel_identity_join_required','owner_address_source_required','operational_review_required'],
    limitations:[
      'Source reference and dates are operator-supplied context, not an approval or permission attestation.',
      'Account numbers remain source identifiers until a verified parcel join; no owner, score, tax-delinquency duration or contact eligibility is inferred.',
      'Bill and account status are separate. Amounts are source observations; no parcel payoff or sum is calculated.',
      'This may be a selected subset. A missing row or account does not prove redemption or exclusion from the full source.',
      'No live source retrieval, lead import, outreach, offer, contract or launch has occurred.',
    ],
    provenance:{...metadata,processedAt:now.toISOString(),inputSha256:createHash('sha256').update(bytes).digest('hex'),inputBytes:bytes.byteLength},
    summary:{inputRows:rows.length,duplicateRows,observations:exactRows.size,accounts:accounts.size,paidBillObservations,unpaidBillObservations,rowsWithUnknownFacts},
    accounts:[...accounts.values()],
  };
}
