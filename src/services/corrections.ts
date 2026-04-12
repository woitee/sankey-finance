import type { CorrectionEntry, CorrectionsDB } from '../types/category';

function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findCorrection(
  merchantName: string,
  details: string,
  corrections: CorrectionEntry[],
): CorrectionEntry | null {
  const normalizedMerchant = normalizeMerchant(merchantName);
  const normalizedDetails = normalizeMerchant(details);

  // Skip corrections with empty patterns — they would match everything
  const valid = corrections.filter(c => normalizeMerchant(c.merchantPattern).length > 0);

  // Priority 1: Exact match on merchant name
  const exact = valid.find(
    c => normalizeMerchant(c.merchantPattern) === normalizedMerchant,
  );
  if (exact) return exact;

  // Priority 2: Pattern is a substring of merchant name
  const substringMerchant = valid.find(c =>
    normalizedMerchant.includes(normalizeMerchant(c.merchantPattern)),
  );
  if (substringMerchant) return substringMerchant;

  // Priority 3: Pattern is a substring of full details
  const substringDetails = valid.find(c =>
    normalizedDetails.includes(normalizeMerchant(c.merchantPattern)),
  );
  if (substringDetails) return substringDetails;

  return null;
}

export async function loadCorrections(): Promise<CorrectionsDB> {
  const res = await fetch('/api/corrections');
  return res.json();
}

export async function saveCorrections(db: CorrectionsDB): Promise<void> {
  await fetch('/api/corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(db),
  });
}

export function addCorrection(
  db: CorrectionsDB,
  merchantPattern: string,
  cats: { cat3: string; cat2?: string; cat1?: string },
  note?: string,
): CorrectionsDB {
  const normalized = normalizeMerchant(merchantPattern);
  if (!normalized) {
    console.warn('Skipping correction with empty merchant pattern');
    return db;
  }
  const existing = db.corrections.findIndex(
    c => normalizeMerchant(c.merchantPattern) === normalized,
  );

  const entry: CorrectionEntry = {
    merchantPattern: normalized,
    cat3: cats.cat3,
    cat2: cats.cat2,
    cat1: cats.cat1,
    note,
    createdAt: new Date().toISOString(),
  };

  const corrections = [...db.corrections];
  if (existing >= 0) {
    corrections[existing] = entry;
  } else {
    corrections.push(entry);
  }

  return { ...db, corrections };
}
