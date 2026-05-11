import type { BankParser, ParsedStatement } from './types';
import { authFetch } from '../auth/fetch';

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
    const text = await fileToText(file);
    const res = await authFetch('/api/parse-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`LLM parse error (${res.status}): ${err.error ?? res.statusText}`);
    }
    return res.json() as Promise<ParsedStatement>;
  }
}
