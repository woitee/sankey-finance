import { generateObject, generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import type { Plugin } from 'vite';
import type { LanguageModel } from 'ai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAllCat2Values } from './src/config/categories';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4.1-mini',
  google: 'gemini-2.5-flash',
};

function createModel(env: Record<string, string>): LanguageModel {
  const providerName = env.LLM_PROVIDER || 'anthropic';
  const modelName = env.LLM_MODEL || DEFAULT_MODELS[providerName] || DEFAULT_MODELS.anthropic;
  switch (providerName) {
    case 'anthropic':
      return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelName);
    case 'openai':
      return createOpenAI({ apiKey: env.OPENAI_API_KEY })(modelName);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })(modelName);
    default:
      throw new Error(`Unknown LLM provider: "${providerName}". Supported: anthropic, openai, google`);
  }
}

function buildResponseSchema(validCat2Values: [string, ...string[]]) {
  const cat2Enum = z.enum(validCat2Values);
  return z.object({
    categories: z.array(z.object({
      index: z.number(),
      cat1: z.enum(['MUST', 'WANT', 'MUST/WANT', 'INCOME']),
      cat2: cat2Enum,
      cat3: z.string(),
    })),
    rules: z.array(z.object({
      pattern: z.string(),
      field: z.enum(['merchantName', 'details']),
      matchType: z.enum(['contains', 'exact', 'startsWith', 'word', 'regex']),
      cat1: z.enum(['MUST', 'WANT', 'MUST/WANT', 'INCOME']),
      cat2: cat2Enum,
      cat3: z.string(),
    })),
  });
}

interface CategorizationRequest {
  merchantName: string;
  details: string;
  amount: number;
  transactionType: string;
}

async function categorizeBatch(
  model: LanguageModel,
  batch: CategorizationRequest[],
  validCat3Values: string[],
) {
  const validCat2Values = getAllCat2Values() as [string, ...string[]];
  const responseSchema = buildResponseSchema(validCat2Values);

  const transactionList = batch
    .map(
      (r, i) =>
        `${i + 1}. Merchant: "${r.merchantName}" | Details: "${r.details}" | Amount: ${r.amount} | Type: ${r.transactionType}`,
    )
    .join('\n');

  const { object } = await generateObject({
    model,
    schema: responseSchema,
    system: `You are a financial transaction categorizer for Czech bank statements (Czech Republic). Merchant names and details are in Czech or are Czech-market brands. Assign cat1, cat2, and cat3 for every transaction.

cat1 rules (no exceptions):
- Negative amounts (money leaving) → MUST, WANT, or MUST/WANT
- Positive amounts (money arriving) → INCOME
- MUST = non-negotiable recurring expenses (rent, groceries, utilities, health, transport essentials, child essentials, pet essentials)
- WANT = discretionary spending (restaurants, entertainment, clothes, subscriptions, gadgets, etc.)
- MUST/WANT = expenses that are partially necessary and partially discretionary; split 50/50 between MUST and WANT in reporting. Primary use case: restaurant meals and takeout/delivery (eating is necessary, but choosing a restaurant is discretionary). Also applies to other mixed-necessity purchases where the same transaction covers both a need and a want.

cat2 is the sub-group. You MUST use ONLY one of these exact values (case-sensitive): ${validCat2Values.join(', ')}.
Do NOT invent new cat2 values. If unsure, use "Other".

Category reference (examples of what belongs where):
- groceries: supermarkets — Billa, Albert, Kaufland, Lidl, Tesco, Penny, Globus, Coop, Hruška
- restaurant: sit-down restaurants, bistros, pizzerias
- fast_food: McDonald's, KFC, Burger King, Subway, Bageterie, Laab
- food_delivery: Bolt Food, Wolt, Dáme jídlo
- cafe: coffee shops, Starbucks, Costa, bakery-cafes
- snacks_vending: vending machines, small kiosks, candy/snack shops
- pharmacy: Rossmann, DM, Dr.Max, lékárna (pharmacy), drugstores
- doctor: nemocnice (hospital), poliklinika (clinic), ambulance, specialist visits
- maternity_care: gynecology, maternity hospital, baby check-ups
- fuel: gas stations — OMV, Shell, Benzina, MOL, EuroOil
- public_transport: PID, DPP, Bolt/Uber/Liftago rides, train/bus tickets (IDOS, RegioJet, FlixBus)
- streaming: Netflix, Spotify, Disney+, Apple TV+, HBO Max, YouTube Premium
- app_subscription: iCloud, Google One, Adobe, software subscriptions
- household: home goods — IKEA, Orion, Jysk, Hornbach, OBI, Baumax
- electronics: Alza, Datart, CZC, Electro World, Apple Store
- clothes: H&M, Zara, C&A, Pepco, Primark, Next, Reserved
- clothes_discount: outlet, second-hand, Vinted
- pet_food / pet_supplies: Super Zoo, Maxi Zoo, Zásilkovna (if pet context), Plaček
- vet: veterinary clinics
- dog_fee: municipal dog registration fee
- child_supplies: Mothercare, Baby Direkt, drogerie baby items
- child_toys: Pompo, Sparkys, toy stores
- child_education: school fees, nursery/daycare (školka, jesle)
- gifts: flower shops, gift shops, presents
- highway_toll: dálniční known (toll stickers/charges)
- car_wash: car wash services
- car_maintenance: auto repair, tires, MOT (STK)
- books: bookstores, Luxor, Neoluxor, Kosmas, ebooks
- cinema: cinema tickets, Cinestar, Vue, Multikino
- concerts_events: event tickets, Ticketmaster, GoOut
- municipal_fee: city fees, waste collection (svoz odpadu), water (vodné/stočné)
- internet: ISP bills — O2, T-Mobile, Vodafone, UPC/Vodafone home
- mobile_plan: mobile phone bills
- rent: rent payments (nájem)
- reimbursement: company expense reimbursements, employer refunds
- uncategorized: only if truly cannot determine — do not default to this

Suggest reusable rules for recurring merchants you recognize with high confidence.
Rule structure: "pattern" must be the SHORTEST string that uniquely identifies the brand — just the brand name, nothing else. Strip location suffixes, store codes, and transaction noise. Examples: "IKEA" not "IKEA ZLICIN OD ECO", "McDonald" not "McDonald's Praha 5", "Netflix" not "NETFLIX.COM". "matchType" says how: contains/exact/startsWith/word/regex. Prefer contains or word for normal merchants; use regex only when needed. Example: { pattern: "IKEA", field: "merchantName", matchType: "contains", ... }. Omit rules for one-off or ambiguous transactions.`,
    messages: [
      {
        role: 'user',
        content: `Valid cat3 categories: ${JSON.stringify(validCat3Values)}

Transactions to categorize:
${transactionList}`,
      },
    ],
  });

  const responses = batch.map((_, i) => {
    const entry = object.categories.find(p => p.index === i + 1);
    const cat3 = entry?.cat3 ?? 'uncategorized';
    const isValid = validCat3Values.includes(cat3);
    return {
      cat1: entry?.cat1 ?? 'WANT',
      cat2: entry?.cat2 ?? 'Other',
      cat3: isValid ? cat3 : 'uncategorized',
      confidence: isValid ? 0.8 : 0,
    };
  });

  const MATCH_TYPE_KEYWORDS = new Set(['contains', 'exact', 'startsWith', 'word', 'regex']);
  const ruleSuggestions = (object.rules ?? [])
    .filter(r => r.pattern.trim() && validCat3Values.includes(r.cat3) && !MATCH_TYPE_KEYWORDS.has(r.pattern.trim()))
    .map(r => ({ ...r, pattern: r.pattern.trim() }));

  return { responses, ruleSuggestions };
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function parseStatement(model: LanguageModel, text: string): Promise<unknown> {
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
  return JSON.parse(json);
}

export function llmPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'llm-api',
    configureServer(server) {
      server.middlewares.use('/api/categorize', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'POST') return next();
        try {
          const body = (await readBody(req)) as { requests: CategorizationRequest[]; validCat3Values: string[] };
          const model = createModel(env);
          const result = await categorizeBatch(model, body.requests, body.validCat3Values);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e: any) {
          console.error('[llm-api] Error:', e?.message ?? e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e?.message ?? 'Internal error' }));
        }
      });

      server.middlewares.use('/api/parse-statement', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'POST') return next();
        try {
          const body = (await readBody(req)) as { text: string };
          const model = createModel(env);
          const result = await parseStatement(model, body.text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e: any) {
          console.error('[llm-api] parse-statement error:', e?.message ?? e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e?.message ?? 'Internal error' }));
        }
      });
    },
  };
}
