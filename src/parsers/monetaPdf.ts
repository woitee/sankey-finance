/**
 * MONETA Money Bank (Czech Republic) PDF statement parser.
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

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

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

const CZECH_AMOUNT_PATTERN = '[-+]?\\s?\\d{1,3}(?:\\s\\d{3})*,\\d{2}';

function extractFirstDate(line: string): string {
  const match = line.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/);
  return match ? parseCzechDate(match[0]) : '';
}

function stripTrailingDateMetadata(line: string): string {
  return normalizeSpaces(line.replace(/\s+\d{1,2}\.\d{1,2}\.\d{4}(?:\s+\d+)?\s*$/, ''));
}

function classifyType(headerText: string, firstLine: string, amount: number): string {
  const header = headerText.toLowerCase();
  const detail = firstLine.toLowerCase();

  if (header.includes('platba kartou')) return 'platba_kartou';
  if (detail.includes('trvalý přík') || detail.includes('trvaly prik')) return 'trvaly_prikaz';
  if (detail.includes('okamžitá úhrada') || detail.includes('okamzita uhrada')) return 'odchozi_uhrada';
  if (detail.includes('inkaso')) return 'inkaso';
  if (amount > 0) return 'prichozi_uhrada';
  return 'other';
}

function extractAccountIdentifier(headerText: string): string {
  const accountMatch = headerText.match(/\b\d+(?:-\d+)?\s*\/\s*\d{4}\b/);
  if (accountMatch) return accountMatch[0].replace(/\s+/g, '');

  const ibanMatch = headerText.match(/\b[A-Z]{2}\d[A-Z0-9]{10,}\b/);
  if (ibanMatch) return ibanMatch[0];

  const tokens = headerText.split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens[tokens.length - 1] : '';
}

function looksLikePersonName(line: string): boolean {
  const normalized = normalizeSpaces(line);
  if (!normalized || /\d/.test(normalized)) return false;
  if (!/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ .-]+$/u.test(normalized)) return false;
  return normalized.split(' ').filter(Boolean).length >= 2;
}

function extractAccountHolder(rows: string[]): string {
  const headerEndIndex = rows.findIndex(row => /^Informace o účtu$/i.test(normalizeSpaces(row)));
  const searchRows = headerEndIndex >= 0 ? rows.slice(0, headerEndIndex) : rows.slice(0, 20);

  for (const row of searchRows) {
    const candidate = normalizeSpaces(row);
    if (looksLikePersonName(candidate)) return candidate;
  }

  return '';
}

function isIgnorableRow(line: string): boolean {
  return [
    /^Výpis z běžného účtu$/i,
    /^Číslo výpisu:$/i,
    /^Výpis ze dne:$/i,
    /^Předchozí výpis ze dne:$/i,
    /^Periodicita výpisu:$/i,
    /^Strana:$/i,
    /^\d+\/\d+$/,
    /^Informace o účtu$/i,
    /^Obchodní místo:/i,
    /^KARLOVA\s+/i,
    /^\d{3}\s+\d{2}\s+/,
    /^Bankovní spojení:/i,
    /^Číslo účtu IBAN:/i,
    /^SWIFT kód BIC:/i,
    /^Označení měny:/i,
    /^Souhrnné zúčtování v měně účtu$/i,
    /^Počáteční zůstatek:/i,
    /^Konečný zůstatek:/i,
    /^Obrat kredit:/i,
    /^Obrat debet:/i,
    /^Roční kreditní obrat:/i,
    /^Roční debetní obrat:/i,
    /^Přehled transakcí(?:\s+Počáteční zůstatek.*)?$/i,
    /^Datum Bankovní spojení Kód transakce VS Debetní obrat Kreditní obrat$/i,
    /^zpracování \/ Popis Datum zaúčtování \/ KS Částka Částka$/i,
    /^Valuta odepsání SS$/i,
    /^výpis pokračuje na další stránce$/i,
    /^www\.moneta\.cz/i,
    /^MONETA Money Bank/i,
    /^IČO:/i,
    /^Vklad na tomto účtu podléhá ochraně/i,
    /^z vkladů je k dispozici/i,
    /^Celkový počet transakcí:/i,
    /^Konečný zůstatek\s+/i,
    /^Žádáme Vás o překontrolování/i,
    /^Dovolujeme si Vás upozornit/i,
    /^následující poplatky a úroky:/i,
    /^Smluvní úrok z nepovoleného debetního zůstatku/i,
  ].some(pattern => pattern.test(line));
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

  const accountMatch = norm.match(/Bankovní spojení:\s*(\d+\s*\/\s*\d{4})/i);
  const accountNumber = accountMatch ? accountMatch[1].replace(/\s+/g, '') : '';

  const statementMatch = norm.match(/Číslo výpisu:\s*(\d{4})\/(\d{1,2})/i);
  const period = statementMatch
    ? `${statementMatch[1]}-${statementMatch[2].padStart(2, '0')}`
    : '';

  const findAmt = (pattern: RegExp): number => {
    const match = norm.match(pattern);
    return match ? parseCzechAmount(match[1]) : 0;
  };

  return {
    accountNumber,
    period,
    openingBalance: findAmt(/Počáteční zůstatek:\s*(-?[\d\s]+,\d{2})/i),
    closingBalance: findAmt(/Konečný zůstatek:\s*(-?[\d\s]+,\d{2})/i),
    totalIncome: Math.abs(findAmt(/Obrat kredit:\s*(-?[\d\s]+,\d{2})/i)),
    totalDebits: Math.abs(findAmt(/Obrat debet:\s*(-?[\d\s]+,\d{2})/i)),
  };
}

// ── Transaction builder ──────────────────────────────────────────────────────

interface RawTransaction {
  datePostedRaw: string;
  headerText: string;
  amountRaw: string;
  lines: string[];
}

function buildDetails(lines: string[]): string {
  const cleaned = lines
    .map(line => normalizeSpaces(line))
    .filter(line => line && !/^\d{1,2}\.\d{1,2}\.\d{4}(?:\s+\d+)?$/.test(line));
  return normalizeSpaces(cleaned.join(' '));
}

function buildTransaction(raw: RawTransaction, accountHolder: string): ParsedTransaction | null {
  const datePosted = parseCzechDate(raw.datePostedRaw);
  const amount = parseCzechAmount(raw.amountRaw);
  if (!datePosted || amount === 0) return null;

  const lines = raw.lines.map(normalizeSpaces).filter(Boolean);
  const firstLine = lines[0] ?? '';
  const type = classifyType(raw.headerText, firstLine, amount);
  const dateExecuted = extractFirstDate(firstLine) || extractFirstDate(lines[1] ?? '') || datePosted;

  let cardholderName = '';
  let accountIdentifier = extractAccountIdentifier(raw.headerText);
  let merchantName = '';

  if (type === 'platba_kartou') {
    cardholderName = accountHolder;
    merchantName = stripTrailingDateMetadata(firstLine);
  } else if (type === 'prichozi_uhrada') {
    merchantName = stripTrailingDateMetadata(firstLine);
    cardholderName = merchantName;
  } else {
    const avLine = lines.find(line => /^AV:/i.test(line));
    merchantName = avLine
      ? avLine.replace(/^AV:\s*/i, '').trim()
      : stripTrailingDateMetadata(firstLine) || raw.headerText;
  }

  if (type === 'platba_kartou' && /^\d+$/.test(accountIdentifier)) {
    accountIdentifier = accountIdentifier;
  }

  const details = buildDetails([
    raw.headerText,
    ...lines,
  ]);

  return {
    datePosted,
    dateExecuted,
    type,
    cardholderName,
    accountIdentifier,
    merchantName,
    details,
    amount,
    fees: 0,
  };
}

// ── Parser class ─────────────────────────────────────────────────────────────

export class MonetaPdfParser implements BankParser {
  readonly name = 'MONETA Money Bank (Czech Republic)';

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
    return /moneta\s+money\s+bank|www\.moneta\.cz/i.test(text);
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
    const accountHolder = extractAccountHolder(fullTextParts);

    const transactions: ParsedTransaction[] = [];
    let current: RawTransaction | null = null;

    for (const rows of pageRows) {
      for (const row of rows) {
        if (isIgnorableRow(row)) continue;

        const txMatch = row.match(new RegExp(`^(\\d{1,2}\\.\\d{1,2}\\.\\d{4})\\s+(.+?)\\s+(${CZECH_AMOUNT_PATTERN})$`));
        if (txMatch) {
          if (current) {
            const tx = buildTransaction(current, accountHolder);
            if (tx) transactions.push(tx);
          }

          current = {
            datePostedRaw: txMatch[1],
            headerText: normalizeSpaces(txMatch[2]),
            amountRaw: txMatch[3],
            lines: [],
          };
          continue;
        }

        if (!current) continue;
        current.lines.push(row);
      }
    }

    if (current) {
      const tx = buildTransaction(current, accountHolder);
      if (tx) transactions.push(tx);
    }

    return { ...header, transactions };
  }
}
