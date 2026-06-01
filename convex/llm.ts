"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { generateObject, generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { getAllCategoryValues } from "../src/config/categories";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4.1-mini",
  google: "gemini-2.5-flash",
};

function createModel(): LanguageModel {
  const providerName = process.env.LLM_PROVIDER || "anthropic";
  const modelName =
    process.env.LLM_MODEL ||
    DEFAULT_MODELS[providerName] ||
    DEFAULT_MODELS.anthropic;
  switch (providerName) {
    case "anthropic":
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(
        modelName,
      );
    case "openai":
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(modelName);
    case "google":
      return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })(
        modelName,
      );
    default:
      throw new Error(
        `Unknown LLM provider: "${providerName}". Supported: anthropic, openai, google`,
      );
  }
}

function buildResponseSchema(validCategoryValues: [string, ...string[]]) {
  const categoryEnum = z.enum(validCategoryValues);
  return z.object({
    categories: z.array(
      z.object({
        index: z.number(),
        type: z.enum(["MUST", "WANT", "MUST/WANT", "INCOME"]),
        category: categoryEnum,
        subcategory: z.string(),
      }),
    ),
    rules: z.array(
      z.object({
        pattern: z.string(),
        field: z.enum(["merchantName", "details"]),
        matchType: z.enum([
          "contains",
          "exact",
          "startsWith",
          "word",
          "regex",
        ]),
        type: z.enum(["MUST", "WANT", "MUST/WANT", "INCOME"]),
        category: categoryEnum,
        subcategory: z.string(),
      }),
    ),
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
  validSubcategoryValues: string[],
) {
  const validCategoryValues = getAllCategoryValues() as [string, ...string[]];
  const responseSchema = buildResponseSchema(validCategoryValues);

  const transactionList = batch
    .map(
      (r, i) =>
        `${i + 1}. Merchant: "${r.merchantName}" | Details: "${r.details}" | Amount: ${r.amount} | Type: ${r.transactionType}`,
    )
    .join("\n");

  const { object } = await generateObject({
    model,
    schema: responseSchema,
    system: `You are a financial transaction categorizer for Czech bank statements (Czech Republic). Merchant names and details are in Czech or are Czech-market brands. Assign type, category, and subcategory for every transaction.

type rules (no exceptions):
- Negative amounts (money leaving) → MUST, WANT, or MUST/WANT
- Positive amounts (money arriving) → INCOME
- MUST = non-negotiable recurring expenses (rent, groceries, utilities, health, transport essentials, child essentials, pet essentials)
- WANT = discretionary spending (restaurants, entertainment, clothes, subscriptions, gadgets, etc.)
- MUST/WANT = expenses that are partially necessary and partially discretionary; split 50/50 between MUST and WANT in reporting. Primary use case: restaurant meals and takeout/delivery (eating is necessary, but choosing a restaurant is discretionary). Also applies to other mixed-necessity purchases where the same transaction covers both a need and a want.

category is the sub-group. You MUST use ONLY one of these exact values (case-sensitive): ${validCategoryValues.join(", ")}.
Do NOT invent new category values. If unsure, use "Other".

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
- furniture: furniture — IKEA (furniture orders), Jysk, Kika, Möbelix, sofa/bed/table purchases
- appliances: household appliances — vacuum cleaner, washing machine, dishwasher, coffee maker, Alza/Datart appliance orders
- supplies: everyday home consumables and small items — cleaning products, detergents, candles, Hornbach, OBI, Baumax, Orion
- electronics: Alza, Datart, CZC, Electro World, Apple Store
- clothes: H&M, Zara, C&A, Pepco, Primark, Next, Reserved
- clothes_discount: outlet, second-hand, Vinted
- pet_food / pet_supplies: Super Zoo, Maxi Zoo, Zásilkovna (if pet context), Plaček
- vet: veterinary clinics
- dog_fee: municipal dog registration fee
- child_supplies: Mothercare, Baby Direkt, drogerie baby items
- child_toys: Pompo, Sparkys, toy stores
- child_education: school fees, nursery/daycare (školka, jesle)
- accommodation: hotels, Airbnb, Booking.com, pensions, hostels
- travel: flights (Ryanair, Wizzair), long-distance buses (FlixBus for vacation), ferries; note: RegioJet is usually regular public_transport, not vacation travel
- activities: tourist attractions, tours, theme parks, museums (vacation context)
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
        role: "user",
        content: `Valid subcategory values: ${JSON.stringify(validSubcategoryValues)}

Transactions to categorize:
${transactionList}`,
      },
    ],
  });

  const responses = batch.map((_, i) => {
    const entry = object.categories.find((p) => p.index === i + 1);
    const subcategory = entry?.subcategory ?? "uncategorized";
    const isValid = validSubcategoryValues.includes(subcategory);
    return {
      type: entry?.type ?? "WANT",
      category: entry?.category ?? "Other",
      subcategory: isValid ? subcategory : "uncategorized",
      confidence: isValid ? 0.8 : 0,
    };
  });

  const MATCH_TYPE_KEYWORDS = new Set([
    "contains",
    "exact",
    "startsWith",
    "word",
    "regex",
  ]);
  const ruleSuggestions = (object.rules ?? [])
    .filter(
      (r) =>
        r.pattern.trim() &&
        validSubcategoryValues.includes(r.subcategory) &&
        !MATCH_TYPE_KEYWORDS.has(r.pattern.trim()),
    )
    .map((r) => ({ ...r, pattern: r.pattern.trim() }));

  return { responses, ruleSuggestions };
}

async function parseStatementText(
  model: LanguageModel,
  text: string,
): Promise<unknown> {
  const { text: responseText } = await generateText({
    model,
    messages: [
      {
        role: "user",
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
      },
    ],
  });
  const json = responseText
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  return JSON.parse(json);
}

// ── Actions ──────────────────────────────────────────────────────────────────

export const categorize = action({
  args: {
    requests: v.array(
      v.object({
        merchantName: v.string(),
        details: v.string(),
        amount: v.number(),
        transactionType: v.string(),
      }),
    ),
    validSubcategoryValues: v.array(v.string()),
  },
  handler: async (_ctx, { requests, validSubcategoryValues }) => {
    const model = createModel();
    return await categorizeBatch(model, requests, validSubcategoryValues);
  },
});

export const parseStatement = action({
  args: {
    text: v.string(),
  },
  handler: async (_ctx, { text }) => {
    const model = createModel();
    return await parseStatementText(model, text);
  },
});
