import type { CategoryHierarchy } from '../types/category';

export const CATEGORY_HIERARCHY: CategoryHierarchy = {
  // --- MUST / Living ---
  rent:              { cat2: 'Living', cat1: 'MUST' },
  utilities_gas:     { cat2: 'Living', cat1: 'MUST' },
  utilities_electric:{ cat2: 'Living', cat1: 'MUST' },
  internet:          { cat2: 'Living', cat1: 'MUST' },
  mobile_plan:       { cat2: 'Living', cat1: 'MUST' },
  municipal_fee:     { cat2: 'Living', cat1: 'MUST' },

  // --- MUST / Food ---
  groceries:         { cat2: 'Food', cat1: 'MUST' },

  // --- WANT / Food ---
  restaurant:        { cat2: 'Food', cat1: 'WANT' },
  food_delivery:     { cat2: 'Food', cat1: 'WANT' },
  fast_food:         { cat2: 'Food', cat1: 'WANT' },
  cafe:              { cat2: 'Food', cat1: 'WANT' },
  snacks_vending:    { cat2: 'Food', cat1: 'WANT' },

  // --- MUST / Health ---
  pharmacy:          { cat2: 'Health', cat1: 'MUST' },
  doctor:            { cat2: 'Health', cat1: 'MUST' },
  maternity_care:    { cat2: 'Health', cat1: 'MUST' },

  // --- MUST / Transport ---
  fuel:              { cat2: 'Transport', cat1: 'MUST' },
  public_transport:  { cat2: 'Transport', cat1: 'MUST' },
  highway_toll:      { cat2: 'Transport', cat1: 'MUST' },
  car_wash:          { cat2: 'Transport', cat1: 'WANT' },
  car_maintenance:   { cat2: 'Transport', cat1: 'MUST' },
  rest_stop:         { cat2: 'Transport', cat1: 'WANT' },

  // --- WANT / Subscriptions ---
  streaming:         { cat2: 'Subscriptions', cat1: 'WANT' },
  app_subscription:  { cat2: 'Subscriptions', cat1: 'WANT' },
  music_subscription:{ cat2: 'Subscriptions', cat1: 'WANT' },

  // --- WANT / Entertainment ---
  cinema:            { cat2: 'Entertainment', cat1: 'WANT' },
  board_games:       { cat2: 'Entertainment', cat1: 'WANT' },
  concerts_events:   { cat2: 'Entertainment', cat1: 'WANT' },
  books:             { cat2: 'Entertainment', cat1: 'WANT' },
  eating_out:        { cat2: 'Entertainment', cat1: 'WANT' },

  // --- Clothes ---
  clothes:           { cat2: 'Clothes', cat1: 'WANT' },
  clothes_discount:  { cat2: 'Clothes', cat1: 'WANT' },

  // --- Child ---
  child_supplies:    { cat2: 'Child', cat1: 'MUST' },
  child_education:   { cat2: 'Child', cat1: 'MUST' },
  child_toys:        { cat2: 'Child', cat1: 'WANT' },
  child_magazine:    { cat2: 'Child', cat1: 'WANT' },

  // --- Pet ---
  pet_food:          { cat2: 'Pet', cat1: 'MUST' },
  pet_supplies:      { cat2: 'Pet', cat1: 'MUST' },
  vet:               { cat2: 'Pet', cat1: 'MUST' },
  dog_fee:           { cat2: 'Pet', cat1: 'MUST' },

  // --- Gifts ---
  gifts:             { cat2: 'Gifts', cat1: 'WANT' },

  // --- Personal ---
  electronics:       { cat2: 'Personal', cat1: 'WANT' },
  household:         { cat2: 'Personal', cat1: 'WANT' },

  // --- INCOME ---
  salary:            { cat2: 'Salary', cat1: 'INCOME' },
  transfer_in:       { cat2: 'OtherIncome', cat1: 'INCOME' },
  refund:            { cat2: 'OtherIncome', cat1: 'INCOME' },
  cashback:          { cat2: 'OtherIncome', cat1: 'INCOME' },
  reimbursement:     { cat2: 'OtherIncome', cat1: 'INCOME' },

  // --- Other ---
  uncategorized:     { cat2: 'Other', cat1: 'WANT' },
};

export function resolveCategory(cat3: string): { cat2: string; cat1: string } | null {
  return CATEGORY_HIERARCHY[cat3] ?? null;
}

export function getAllCat3Values(): string[] {
  return Object.keys(CATEGORY_HIERARCHY);
}

export function getAllCat2Values(): string[] {
  return [...new Set(Object.values(CATEGORY_HIERARCHY).map(v => v.cat2))];
}

export function getAllCat1Values(): string[] {
  return [...new Set(Object.values(CATEGORY_HIERARCHY).map(v => v.cat1))];
}
