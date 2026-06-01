import type { CategoryHierarchy } from '../types/category';

export const CATEGORY_HIERARCHY: CategoryHierarchy = {
  // --- MUST / Living ---
  rent:              { category: 'Living', type: 'MUST' },
  utilities_gas:     { category: 'Living', type: 'MUST' },
  utilities_electric:{ category: 'Living', type: 'MUST' },
  internet:          { category: 'Living', type: 'MUST' },
  mobile_plan:       { category: 'Living', type: 'MUST' },
  municipal_fee:     { category: 'Living', type: 'MUST' },

  // --- MUST / Food ---
  groceries:         { category: 'Food', type: 'MUST' },

  // --- WANT / Food ---
  restaurant:        { category: 'Food', type: 'WANT' },
  food_delivery:     { category: 'Food', type: 'WANT' },
  fast_food:         { category: 'Food', type: 'WANT' },
  cafe:              { category: 'Food', type: 'WANT' },
  snacks_vending:    { category: 'Food', type: 'WANT' },

  // --- MUST / Health ---
  pharmacy:          { category: 'Health', type: 'MUST' },
  doctor:            { category: 'Health', type: 'MUST' },
  maternity_care:    { category: 'Health', type: 'MUST' },

  // --- MUST / Transport ---
  fuel:              { category: 'Transport', type: 'MUST' },
  public_transport:  { category: 'Transport', type: 'MUST' },
  highway_toll:      { category: 'Transport', type: 'MUST' },
  car_wash:          { category: 'Transport', type: 'WANT' },
  car_maintenance:   { category: 'Transport', type: 'MUST' },
  rest_stop:         { category: 'Transport', type: 'WANT' },

  // --- WANT / Subscriptions ---
  streaming:         { category: 'Subscriptions', type: 'WANT' },
  app_subscription:  { category: 'Subscriptions', type: 'WANT' },
  music_subscription:{ category: 'Subscriptions', type: 'WANT' },

  // --- WANT / Entertainment ---
  cinema:            { category: 'Entertainment', type: 'WANT' },
  board_games:       { category: 'Entertainment', type: 'WANT' },
  concerts_events:   { category: 'Entertainment', type: 'WANT' },
  books:             { category: 'Entertainment', type: 'WANT' },

  // --- Clothes ---
  clothes:           { category: 'Clothes', type: 'WANT' },
  clothes_discount:  { category: 'Clothes', type: 'WANT' },

  // --- Child ---
  child_supplies:    { category: 'Child', type: 'MUST' },
  child_education:   { category: 'Child', type: 'MUST' },
  child_toys:        { category: 'Child', type: 'WANT' },
  child_magazine:    { category: 'Child', type: 'WANT' },

  // --- Pet ---
  pet_food:          { category: 'Pet', type: 'MUST' },
  pet_supplies:      { category: 'Pet', type: 'MUST' },
  vet:               { category: 'Pet', type: 'MUST' },
  dog_fee:           { category: 'Pet', type: 'MUST' },

  // --- Vacation ---
  accommodation:     { category: 'Vacation', type: 'WANT' },
  travel:            { category: 'Vacation', type: 'WANT' },
  activities:        { category: 'Vacation', type: 'WANT' },

  // --- Gifts ---
  gifts:             { category: 'Gifts', type: 'WANT' },

  // --- Household ---
  furniture:         { category: 'Household', type: 'WANT' },
  appliances:        { category: 'Household', type: 'WANT' },
  supplies:          { category: 'Household', type: 'WANT' },

  // --- Personal ---
  electronics:       { category: 'Personal', type: 'WANT' },

  // --- INCOME ---
  salary:            { category: 'Salary', type: 'INCOME' },
  transfer_in:       { category: 'OtherIncome', type: 'INCOME' },
  refund:            { category: 'OtherIncome', type: 'INCOME' },
  cashback:          { category: 'OtherIncome', type: 'INCOME' },
  reimbursement:     { category: 'OtherIncome', type: 'INCOME' },

  // --- Other ---
  uncategorized:     { category: 'Other', type: 'WANT' },
};

export function resolveCategory(subcategory: string): { category: string; type: string } | null {
  return CATEGORY_HIERARCHY[subcategory] ?? null;
}

export function getAllSubcategoryValues(): string[] {
  return Object.keys(CATEGORY_HIERARCHY);
}

export function getAllCategoryValues(): string[] {
  return [...new Set(Object.values(CATEGORY_HIERARCHY).map(v => v.category))];
}

export function getAllTypeValues(): string[] {
  return [...new Set(Object.values(CATEGORY_HIERARCHY).map(v => v.type))];
}
