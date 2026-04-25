import type { BankParser } from './types';
import { AirBankPdfParser } from './airBankPdf';
import { CsobPdfParser } from './csobPdf';
import { MonetaPdfParser } from './monetaPdf';

/**
 * Ordered list of parsers. First match wins.
 * Add new bank parsers here — each must implement BankParser.
 */
export const PARSERS: BankParser[] = [
  new AirBankPdfParser(),
  new CsobPdfParser(),
  new MonetaPdfParser(),
  // new RevolutCsvParser(),
  // new MBankCsvParser(),
];

/** Returns the first parser that recognises the file, or null. */
export async function detectParser(file: File): Promise<BankParser | null> {
  for (const parser of PARSERS) {
    if (await parser.detect(file)) return parser;
  }
  return null;
}
