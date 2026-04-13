import { generateText } from 'ai';
import { createLanguageModel } from '../services/llm/model';
import type { BankParser, ParsedStatement } from './types';

async function fileToText(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const parts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      parts.push((tc.items as any[]).map((i: any) => i.str).join(' '));
    }
    return parts.join('\n');
  }
  return file.text();
}

export class LlmParser implements BankParser {
  readonly name = 'AI (LLM)';

  /** LLM parser is never auto-selected — user must explicitly approve. */
  async detect(_file: File): Promise<boolean> {
    return false;
  }

  async parse(file: File): Promise<ParsedStatement> {
    const model = createLanguageModel();
    const text = await fileToText(file);


    const { text: responseText } = await generateText({
      model,
      messages: [{
        role: 'user',
        content: `Parse this bank statement. Return ONLY a valid JSON object matching this schema — no markdown, no explanation:
{
  "period": "YYYY-MM",
  "accountNumber": "string",
  "openingBalance": 0,
  "closingBalance": 0,
  "totalIncome": 0,
  "totalDebits": 0,
  "transactions": [{
    "datePosted": "YYYY-MM-DD",
    "dateExecuted": "YYYY-MM-DD",
    "type": "platba_kartou|prichozi_uhrada|odchozi_uhrada|trvaly_prikaz|other",
    "cardholderName": "",
    "accountIdentifier": "",
    "merchantName": "",
    "details": "",
    "amount": 0,
    "fees": 0
  }]
}
Rules: negative amount = money leaving, positive = money arriving.

Statement text:
${text.slice(0, 60_000)}`,
      }],
    });

    const json = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(json) as ParsedStatement;
  }
}
