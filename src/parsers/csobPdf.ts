/**
 * CSOB (Czech Republic) PDF statement parser.
 * Uses row-based extraction from pdfjs-dist text items.
 */
import type { BankParser, ParsedStatement, ParsedTransaction } from './types';

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

function parseShortCzechDate(s: string, year: string): string {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.$/);
  if (!m || !year) return '';
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseCzechAmount(s: string): number {
  if (!s?.trim()) return 0;
  const cleaned = s.trim().replace(/[\u00a0\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function classifyType(czech: string): string {
  const t = czech.toLowerCase();
  if (t.includes('transakce platební kartou') || t.includes('transakce platebni kartou')) return 'platba_kartou';
  if (t.includes('příchozí úhrada') || t.includes('prichozi uhrada')) return 'prichozi_uhrada';
  if (t.includes('odchozí úhrada') || t.includes('odchozi uhrada')) return 'odchozi_uhrada';
  if (t.includes('trvalý příkaz') || t.includes('trvaly prikaz')) return 'trvaly_prikaz';
  if (t.includes('inkaso')) return 'inkaso';
  return 'other';
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function extractAccountIdentifier(line: string): string {
  const accountMatch = line.match(/\b\d+(?:-\d+)?\/\d{4}\b/);
  return accountMatch ? accountMatch[0] : normalizeSpaces(line);
}

function extractAccountHolder(text: string): string {
  const match = text.match(/Název účtu:\s*(.+?)(?=\s+(?:Strana:|X\s+Rok\/č\. výpisu:|Rok\/č\. výpisu:))/i);
  return match ? normalizeSpaces(match[1]) : '';
}

function isIgnorableRow(line: string): boolean {
  return [
    /^Datum$/i,
    /^Valuta$/i,
    /^Označení platby$/i,
    /^Protiúčet nebo poznámka$/i,
    /^Název protiúčtu$/i,
    /^VS KS SS$/i,
    /^Identifikace Částka Zůstatek$/i,
    /^Strana:/i,
    /^Období:/i,
    /^Účet:/i,
    /^Název účtu:/i,
    /^VÝPIS Z ÚČTU/i,
    /^zapsaná v obchodním rejstříku/i,
    /^Prosíme Vás o včasné překontrolování/i,
    /^Pokud při zúčtování karetní transakce/i,
    /^pro měny států EHP/i,
    /^Vklad na tomto účtu podléhá ochraně/i,
    /^o systému pojištění pohledávek/i,
  ].some(pattern => pattern.test(line));
}

function parseTypeLabel(header: string): { type: string; extra: string } {
  const card = header.match(/^Transakce platební kartou\s*(.*)$/i);
  if (card) return { type: 'platba_kartou', extra: card[1].trim() };

  const incoming = header.match(/^(?:Příchozí|Prichozi) úhrada\s*(.*)$/i);
  if (incoming) return { type: 'prichozi_uhrada', extra: incoming[1].trim() };

  const outgoing = header.match(/^(?:Odchozí|Odchozi) úhrada\s*(.*)$/i);
  if (outgoing) return { type: 'odchozi_uhrada', extra: outgoing[1].trim() };

  const standing = header.match(/^(?:Trvalý|Trvaly) příkaz(?:\s+elektronicky)?(?:\s+číslo\s+\d+)?\s*(.*)$/i);
  if (standing) return { type: 'trvaly_prikaz', extra: standing[1].trim() };

  const debit = header.match(/^Inkaso\s*(.*)$/i);
  if (debit) return { type: 'inkaso', extra: debit[1].trim() };

  return { type: classifyType(header), extra: '' };
}

// ── Position-aware text extraction ──────────────────────────────────────────

interface TItem { str: string; x: number; y: number; }

function groupByRow(items: TItem[], tol = 3): TItem[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: TItem[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = rows[rows.length - 1];
    if (Math.abs(sorted[i].y - last[0].y) <= tol) {
      last.push(sorted[i]);
    } else {
      rows.push([sorted[i]]);
    }
  }
  return rows.map(row => row.sort((a, b) => a.x - b.x));
}

// ── Header extraction ────────────────────────────────────────────────────────

function parseHeader(text: string): Omit<ParsedStatement, 'transactions'> {
  const norm = text.replace(/\s+/g, ' ');

  const accountMatch = norm.match(/Účet:\s*(\d+(?:-\d+)?\/\d{4})/i);
  const accountNumber = accountMatch ? accountMatch[1] : '';

  const periodMatch = norm.match(/Období:\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*[-–]\s*\d/);
  const period = periodMatch
    ? `${periodMatch[3]}-${periodMatch[2].padStart(2, '0')}`
    : '';

  const findAmt = (pattern: RegExp): number => {
    const match = norm.match(pattern);
    return match ? parseCzechAmount(match[1]) : 0;
  };

  return {
    accountNumber,
    period,
    openingBalance: findAmt(/Počáteční zůstatek:\s*([\d\s]+,\d{2})/i),
    closingBalance: findAmt(/Konečný zůstatek:\s*([\d\s]+,\d{2})/i),
    totalIncome: findAmt(/Celkové příjmy:\s*([\d\s]+,\d{2})/i),
    totalDebits: findAmt(/Celkové výdaje:\s*([\d\s]+,\d{2})/i),
  };
}

// ── Transaction builder ──────────────────────────────────────────────────────

interface RawTransaction {
  datePostedRaw: string;
  headerText: string;
  identifier: string;
  amountRaw: string;
  lines: string[];
}

function deriveMerchantName(type: string, extra: string, lines: string[], details: string): string {
  if (type === 'platba_kartou') {
    const placeLine = lines.find(line => /^Místo:/i.test(line));
    if (placeLine) return placeLine.replace(/^Místo:\s*/i, '').trim();
    return details;
  }

  if (type === 'trvaly_prikaz') {
    return 'Trvalý příkaz';
  }

  if (extra) return extra;

  const noteLine = lines.slice(1).find(Boolean);
  if (noteLine) return noteLine;

  return details;
}

function buildTransaction(
  raw: RawTransaction,
  statementYear: string,
  accountHolder: string,
  statementAccountNumber: string,
): ParsedTransaction | null {
  const datePosted = parseShortCzechDate(raw.datePostedRaw, statementYear);
  const amount = parseCzechAmount(raw.amountRaw);
  if (!datePosted || amount === 0) return null;

  const { type, extra } = parseTypeLabel(raw.headerText);
  const lines = raw.lines.map(normalizeSpaces).filter(Boolean);

  let dateExecuted = datePosted;
  const cardholderName = accountHolder;
  let accountIdentifier = raw.identifier;
  let details = lines.join(' ').trim();

  if (type === 'platba_kartou') {
    const executedMatch = details.match(/Částka:\s*.+?\s+(\d{1,2}\.\d{1,2}\.\d{4})/i);
    if (executedMatch) {
      dateExecuted = parseCzechDate(executedMatch[1]) || datePosted;
    }
  } else {
    if (lines[0]) accountIdentifier = extractAccountIdentifier(lines[0]);

    const detailLines = lines.slice(1);
    if (detailLines.length > 0) {
      details = detailLines.join(' ').trim();
    } else if (extra) {
      details = extra;
    }

    if (type === 'trvaly_prikaz') {
      details = `${normalizeSpaces(raw.headerText)}, ${statementAccountNumber} -> ${accountIdentifier}`;
    }
  }

  return {
    datePosted,
    dateExecuted,
    type,
    cardholderName,
    accountIdentifier,
    merchantName: deriveMerchantName(type, extra, lines, details),
    details,
    amount,
    fees: 0,
  };
}

// ── Parser class ─────────────────────────────────────────────────────────────

export class CsobPdfParser implements BankParser {
  readonly name = 'ČSOB (Czech Republic)';

  async detect(file: File): Promise<boolean> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return false;
    }
    const buffer = await file.arrayBuffer();
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const page1 = await pdf.getPage(1);
    const tc = await page1.getTextContent();
    const text = (tc.items as Array<{ str?: string }>).map(item => item.str ?? '').join(' ');
    return /československá obchodní banka|csob/i.test(text);
  }

  async parse(file: File): Promise<ParsedStatement> {
    const buffer = await file.arrayBuffer();
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    const pageRows: string[][] = [];
    const fullTextParts: string[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;
      const tc = await page.getTextContent();

      const items: TItem[] = (tc.items as Array<{ str?: string; transform: number[] }>)
        .filter(item => item.str?.trim())
        .map(item => ({
          str: item.str as string,
          x: item.transform[4] as number,
          y: pageHeight - (item.transform[5] as number),
        }));

      const rows = groupByRow(items)
        .map(row => normalizeSpaces(row.map(item => item.str).join(' ')))
        .filter(Boolean);

      pageRows.push(rows);
      fullTextParts.push(...rows);
    }

    const fullText = fullTextParts.join(' ');
    const header = parseHeader(fullText);
    const accountHolder = extractAccountHolder(fullText);
    const statementYear = header.period.slice(0, 4);

    const transactions: ParsedTransaction[] = [];
    let current: RawTransaction | null = null;

    for (const rows of pageRows) {
      for (const row of rows) {
        if (isIgnorableRow(row)) continue;

        const txMatch = row.match(/^(\d{1,2}\.\d{1,2}\.)\s+(.+?)\s+(\d{4})\s+(-?[\d\s]+,\d{2})\s+[\d\s]+,\d{2}$/);
        if (txMatch) {
          if (current) {
            const tx = buildTransaction(current, statementYear, accountHolder, header.accountNumber);
            if (tx) transactions.push(tx);
          }

          current = {
            datePostedRaw: txMatch[1],
            headerText: txMatch[2],
            identifier: txMatch[3],
            amountRaw: txMatch[4],
            lines: [],
          };
          continue;
        }

        if (!current) continue;
        current.lines.push(row);
      }
    }

    if (current) {
      const tx = buildTransaction(current, statementYear, accountHolder, header.accountNumber);
      if (tx) transactions.push(tx);
    }

    return { ...header, transactions };
  }
}
