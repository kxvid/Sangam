/** Strict, bounded CSV parsing for the mapped PropStream export contract. */
export const CSV_HEADERS = ['county', 'apn', 'address', 'city', 'zip', 'owner_name', 'mailing_address', 'phone', 'email', 'property_type', 'estimated_value', 'equity_pct', 'tax_delinquent_years', 'years_owned', 'nod', 'vacant', 'absentee', 'inherited', 'code_violations', 'beds', 'baths', 'sqft', 'year_built', 'last_sale_date', 'last_sale_price', 'notes'] as const;
export const REQUIRED_HEADERS = ['county', 'apn', 'address', 'owner_name'];
export function parseCsv(csv: string): Record<string, string>[] {
  if (Buffer.byteLength(csv, 'utf8') > 1_800_000) throw new Error('CSV exceeds the 1.8 MB pilot limit. Split the file.');
  if (csv.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(csv)) throw new Error('CSV must contain valid UTF-8 text.');
  const input = csv.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  function pushField() { row.push(field.trim()); field = ''; closed = false; }
  function pushRow() { pushField(); if (row.some(cell => cell !== '')) rows.push(row); row = []; }
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') { if (input[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === ',') pushField();
    else if (char === '\n' || char === '\r') { pushRow(); if (char === '\r' && input[i + 1] === '\n') i++; }
    else if (char === '"') { if (field !== '' || closed) throw new Error('Malformed CSV quote.'); quoted = true; }
    else { if (closed) throw new Error('Unexpected text after a quoted CSV value.'); field += char; }
    if (field.length > 10_000) throw new Error('CSV field exceeds 10,000 characters.');
    if (rows.length > 5_001) throw new Error('CSV exceeds 5,000 rows. Split the file.');
  }
  if (quoted) throw new Error('CSV has an unclosed quoted value.');
  if (field || row.length || closed) pushRow();
  const headers = rows.shift();
  if (!headers || rows.length === 0) throw new Error('CSV needs a header and at least one data row.');
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV header.');
  for (const header of headers) if (!(CSV_HEADERS as readonly string[]).includes(header)) throw new Error(`Unsupported CSV column: ${header}. Map the export to the provided template; permissions cannot be imported here.`);
  for (const header of REQUIRED_HEADERS) if (!headers.includes(header)) throw new Error(`Required CSV column missing: ${header}.`);
  if (rows.length > 5_000) throw new Error('CSV exceeds 5,000 rows. Split the file.');
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${i + 2} has ${cells.length} columns; expected ${headers.length}.`);
    const item = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    for (const header of REQUIRED_HEADERS) if (!item[header]) throw new Error(`CSV row ${i + 2}: ${header} is required.`);
    return item;
  });
}

export function csvDownload(headers: string[], rows: Array<Array<string | number | null>>): string {
  function cell(value: string | number | null) {
    let text = String(value ?? '');
    // Quoting alone does not prevent spreadsheet formula execution.
    if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
