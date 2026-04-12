/**
 * Air Bank (Czech Republic) PDF statement parser.
 * Mirrors the logic in scripts/parse_statement.py but runs in-browser using pdfjs-dist.
 */
import type { BankParser, ParsedStatement, ParsedTransaction } from './types';

// Default column x-boundaries for Air Bank A4 PDF (PDF points).
// Positions split: dates | type | name/account | details | amount | fees
const DEFAULT_BOUNDS = [95, 165, 290, 445, 510];

// ── pdfjs lazy init ──────────────────────────────────────────────────────────

let _pdfjs: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import('pdfjs-dist');
    _pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return _pdfjs;
}

// ── Small helpers ────────────────────────────────────────────────────────────

function parseCzechDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseCzechAmount(s: string): number {
  if (!s?.trim()) return 0;
  const cleaned = s.trim().replace(/[\u00a0\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function classifyType(czech: string): string {
  const t = czech.toLowerCase();
  if (t.includes('platba kartou')) return 'platba_kartou';
  if (t.includes('příchozí') || t.includes('prichozi')) return 'prichozi_uhrada';
  if (t.includes('odchozí') || t.includes('odchozi')) return 'odchozi_uhrada';
  if (t.includes('trvalý') || t.includes('trvaly')) return 'trvaly_prikaz';
  if (t.includes('vrácení') || t.includes('vraceni')) return 'vraceni_penez';
  if (t.includes('odměna') || t.includes('odmena')) return 'odmena_unity';
  return 'other';
}

function extractMerchant(details: string): string {
  if (!details) return '';
  const parts = details.split(/\s+(?=\d+[/,])/);
  return parts[0].trim().replace(/,$/, '');
}

function looksLikeAccount(s: string): boolean {
  return /^[A-Z]{2}\d/.test(s) || /^\d+\/\d+$/.test(s);
}

// ── Position-aware text extraction ──────────────────────────────────────────

interface TItem { str: string; x: number; y: number; }

/** Group text items into rows by proximity of y coordinate. */
function groupByRow(items: TItem[], tol = 3): TItem[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y); // top → bottom
  const rows: TItem[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = rows[rows.length - 1];
    if (Math.abs(sorted[i].y - last[0].y) <= tol) {
      last.push(sorted[i]);
    } else {
      rows.push([sorted[i]]);
    }
  }
  return rows.map(r => r.sort((a, b) => a.x - b.x));
}

function colIndex(x: number, bounds: number[]): number {
  for (let i = 0; i < bounds.length; i++) if (x < bounds[i]) return i;
  return bounds.length;
}

/** Try to detect column boundaries from the header row of the table. */
function detectBounds(rows: TItem[][]): number[] {
  for (const row of rows) {
    const joined = row.map(i => i.str).join(' ').toLowerCase();
    if (!joined.includes('druh') || !joined.includes('popis')) continue;

    const starts: number[] = new Array(6).fill(-1);
    for (const item of row) {
      const t = item.str.toLowerCase();
      if (/zaúčtování|zauctov/.test(t)) starts[0] = item.x;
      else if (/^druh$/.test(t.trim())) starts[1] = item.x;
      else if (/jméno|jmeno/.test(t)) starts[2] = item.x;
      else if (/popis/.test(t)) starts[3] = item.x;
      else if (/objem|částka/.test(t)) starts[4] = item.x;
      else if (/poplatek/.test(t)) starts[5] = item.x;
    }

    const detected = starts.filter(x => x >= 0).sort((a, b) => a - b);
    if (detected.length >= 5) {
      const bounds: number[] = [];
      for (let i = 1; i < detected.length; i++) {
        bounds.push((detected[i - 1] + detected[i]) / 2);
      }
      return bounds;
    }
  }
  return DEFAULT_BOUNDS;
}

// ── Transaction builder ──────────────────────────────────────────────────────

interface Accumulator { cols: string[]; } // 6 columns, newline-joined

function buildTransaction(acc: Accumulator): ParsedTransaction | null {
  const [datesRaw, typeRaw, nameRaw, detailsRaw, amountRaw, feesRaw] = acc.cols;

  const dates = (datesRaw.match(/\d{1,2}\.\d{1,2}\.\d{4}/g) || []).map(parseCzechDate);
  if (dates.length === 0) return null;

  const amount = parseCzechAmount(amountRaw);
  const fees = parseCzechAmount(feesRaw);
  if (!dates[0] || (amount === 0 && fees === 0)) return null;

  const txType = classifyType(typeRaw.split('\n')[0] ?? '');

  const nameParts = nameRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const line1 = nameParts[0] ?? '';
  const line2 = nameParts[1] ?? '';

  let cardholderName: string;
  let accountIdentifier: string;

  if (txType === 'platba_kartou') {
    cardholderName = line1;
    accountIdentifier = line2;
  } else if (['odchozi_uhrada', 'trvaly_prikaz'].includes(txType)) {
    cardholderName = '';
    accountIdentifier = line2 || line1;
  } else {
    // incoming / other — show sender name, fall back to account number
    if (!line1 || looksLikeAccount(line1)) {
      cardholderName = line1;
      accountIdentifier = line1;
    } else {
      cardholderName = line1;
      accountIdentifier = line2;
    }
  }

  const details = detailsRaw.replace(/\n/g, ' ').trim();

  return {
    datePosted: dates[0],
    dateExecuted: dates[1] ?? dates[0],
    type: txType,
    cardholderName,
    accountIdentifier,
    merchantName: extractMerchant(details),
    details,
    amount,
    fees,
  };
}

// ── Header extraction ────────────────────────────────────────────────────────

function parseHeader(text: string): Omit<ParsedStatement, 'transactions'> {
  const norm = text.replace(/\s+/g, ' ');

  const accMatch = norm.match(/\d{2,12}\s*\/\s*\d{3,4}/);
  const accountNumber = accMatch ? accMatch[0].replace(/\s/g, '') : '';

  const perMatch = norm.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*[-–]\s*\d/);
  const period = perMatch
    ? `${perMatch[3]}-${perMatch[2].padStart(2, '0')}`
    : '';

  const findAmt = (patterns: RegExp[]): number => {
    for (const p of patterns) {
      const m = norm.match(p);
      if (m) return parseCzechAmount(m[1]);
    }
    return 0;
  };

  return {
    accountNumber,
    period,
    openingBalance: findAmt([/[Pp]o[čc]áte[čc]ní\s+z[ůu]statek[^0-9]*([\d\s]+,\d{2})/]),
    closingBalance: findAmt([/[Kk]one[čc]ný\s+z[ůu]statek[^0-9]*([\d\s]+,\d{2})/]),
    totalIncome: findAmt([/[Pp][řr]ips[áa]no\s+na[^0-9]*([\d\s]+,\d{2})/]),
    totalDebits: findAmt([/[Oo]deps[áa]no\s+z[^0-9]*([\d\s]+,\d{2})/]),
  };
}

// ── Parser class ─────────────────────────────────────────────────────────────

export class AirBankPdfParser implements BankParser {
  readonly name = 'Air Bank (Czech Republic)';

  async detect(file: File): Promise<boolean> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return false;
    }
    const buffer = await file.arrayBuffer();
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const page1 = await pdf.getPage(1);
    const tc = await page1.getTextContent();
    const text = (tc.items as any[]).map((i: any) => i.str).join(' ');
    return /air\s*bank/i.test(text);
  }

  async parse(file: File): Promise<ParsedStatement> {
    const buffer = await file.arrayBuffer();
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    const pageItemSets: TItem[][] = [];
    const fullTextParts: string[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;
      const tc = await page.getTextContent();

      const items: TItem[] = (tc.items as any[])
        .filter((i: any) => i.str?.trim())
        .map((i: any) => ({
          str: i.str as string,
          x: i.transform[4] as number,
          y: pageHeight - (i.transform[5] as number), // convert to top-down
        }));

      pageItemSets.push(items);
      fullTextParts.push(...items.map(i => i.str));
    }

    const fullText = fullTextParts.join(' ');
    const header = parseHeader(fullText);

    // Detect column boundaries from all rows across pages
    const allRows = pageItemSets.flatMap(items => groupByRow(items));
    const bounds = detectBounds(allRows);

    // Walk rows, accumulate transactions
    const transactions: ParsedTransaction[] = [];
    let current: Accumulator | null = null;
    let inTable = false;

    for (const pageItems of pageItemSets) {
      const rows = groupByRow(pageItems);
      for (const row of rows) {
        // A new transaction starts when the leftmost column contains a date
        const col0Text = row
          .filter(i => i.x < (bounds[0] ?? DEFAULT_BOUNDS[0]))
          .map(i => i.str)
          .join(' ');
        const isNewTx = /\d{1,2}\.\d{1,2}\.\d{4}/.test(col0Text);

        if (isNewTx) {
          if (current) {
            const tx = buildTransaction(current);
            if (tx) transactions.push(tx);
          }
          current = { cols: ['', '', '', '', '', ''] };
          inTable = true;
        } else if (!inTable || !current) {
          continue;
        }

        // Append this row's items to the current accumulator by column
        for (const item of row) {
          const col = colIndex(item.x, bounds);
          if (col < 6) {
            current.cols[col] += (current.cols[col] ? '\n' : '') + item.str;
          }
        }
      }
    }

    // Flush last transaction
    if (current) {
      const tx = buildTransaction(current);
      if (tx) transactions.push(tx);
    }

    return { ...header, transactions };
  }
}
