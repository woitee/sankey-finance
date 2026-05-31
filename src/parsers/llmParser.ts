import type { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api';
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
  private client: ConvexReactClient | null = null;

  setClient(client: ConvexReactClient) {
    this.client = client;
  }

  async detect(_file: File): Promise<boolean> {
    return false;
  }

  async parse(file: File): Promise<ParsedStatement> {
    if (!this.client) throw new Error('Convex client not set on LlmParser — call setClient() first');
    const text = await fileToText(file);
    return await this.client.action(api.llm.parseStatement, { text }) as ParsedStatement;
  }
}
