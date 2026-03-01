/**
 * Money Manager (app export) category/subcategory name → Savemonei category IDs.
 * Used by GET /import/money-manager-category-map so the mobile app can resolve
 * Excel import categories to app defaults without duplicating the map.
 *
 * Keys: "income"|"expense" + ":" + normalized category + (":" + normalized sub)?
 * Normalize: toLowerCase().trim().replace(/\s+/g, " ")
 */

export interface CategoryMapping {
  categoryId: string;
  subcategoryId?: string;
}

function n(s: string): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function key(type: "income" | "expense", category: string, sub?: string): string {
  const c = n(category);
  if (!c) return "";
  return sub ? `${type}:${c}:${n(sub)}` : `${type}:${c}`;
}

/** Build full map: all keys (with and without sub) point to { categoryId, subcategoryId? } */
export function buildMoneyManagerCategoryMap(): Record<string, CategoryMapping> {
  const map: Record<string, CategoryMapping> = {};

  // Expense: category + subcategory pairs (Savemonei schema IDs)
  const expensePairs: [string, string, string, string?][] = [
    ["Food & Dining", "Groceries", "cat_food", "sub_groceries"],
    ["Food & Dining", "Restaurants", "cat_food", "sub_restaurants"],
    ["Food & Dining", "Coffee & Drinks", "cat_food", "sub_coffee"],
    ["Food & Dining", "Takeout", "cat_food", "sub_takeout"],
    ["Food & Dining", "Food Delivery", "cat_food", "sub_food_delivery"],
    ["Food", "Groceries", "cat_food", "sub_groceries"],
    ["Food", "Restaurants", "cat_food", "sub_restaurants"],
    ["Groceries", "", "cat_food", "sub_groceries"],
    ["Food", "", "cat_food", undefined],
    ["Shopping", "", "cat_shopping", undefined],
    ["Shopping", "Clothing", "cat_shopping", "sub_clothes"],
    ["Shopping", "Electronics", "cat_shopping", "sub_electronics"],
    ["Transportation", "Fuel", "cat_transport", "sub_fuel"],
    ["Transportation", "Taxi & Uber", "cat_transport", "sub_taxi"],
    ["Transport", "Fuel", "cat_transport", "sub_fuel"],
    ["Transportation", "", "cat_transport", undefined],
    ["Transport", "", "cat_transport", undefined],
    ["Entertainment", "", "cat_entertainment", undefined],
    ["Entertainment", "Movies", "cat_entertainment", "sub_movies"],
    ["Entertainment", "Streaming", "cat_entertainment", "sub_streaming"],
    ["Bills & Utilities", "", "cat_bills", undefined],
    ["Bills", "", "cat_bills", undefined],
    ["Utilities", "", "cat_bills", undefined],
    ["Bills & Utilities", "Rent", "cat_bills", "sub_rent"],
    ["Bills & Utilities", "Electricity", "cat_bills", "sub_electricity"],
    ["Bills & Utilities", "Internet", "cat_bills", "sub_internet"],
    ["Bills & Utilities", "Phone", "cat_bills", "sub_phone"],
    ["Health & Fitness", "", "cat_health", undefined],
    ["Health", "", "cat_health", undefined],
    ["Healthcare", "", "cat_health", undefined],
    ["Health & Fitness", "Gym", "cat_health", "sub_gym"],
    ["Health & Fitness", "Medicine", "cat_health", "sub_medicine"],
    ["Travel", "", "cat_travel", undefined],
    ["Travel", "Flights", "cat_travel", "sub_flights"],
    ["Travel", "Hotels", "cat_travel", "sub_hotels"],
    ["Education", "", "cat_education", undefined],
    ["Education", "Books", "cat_education", "sub_books"],
    ["Education", "Tuition", "cat_education", "sub_tuition"],
    ["Personal Care", "", "cat_personal", undefined],
    ["Gifts & Donations", "", "cat_gifts", undefined],
    ["Gifts", "", "cat_gifts", undefined],
    ["Donations", "", "cat_gifts", undefined],
    ["Pets", "", "cat_pets", undefined],
    ["Kids & Family", "", "cat_kids", undefined],
    ["Home Maintenance", "", "cat_home_maintenance", undefined],
    ["Household", "", "cat_household", undefined],
    ["Loans & EMI", "", "cat_loans", undefined],
    ["Loans", "", "cat_loans", undefined],
    ["EMI", "", "cat_loans", undefined],
    ["Taxes", "", "cat_taxes", undefined],
    ["Cash & ATM", "", "cat_cash", undefined],
    ["Cash", "", "cat_cash", undefined],
    ["ATM", "", "cat_cash", undefined],
    ["Subscriptions", "", "cat_subscriptions", undefined],
    ["Rent", "", "cat_bills", "sub_rent"],
    ["Festivals & Occasions", "", "cat_festivals", undefined],
    ["Other", "", "cat_other_expense", undefined],
  ];

  for (const [catName, subName, catId, subId] of expensePairs) {
    const k = key("expense", catName, subName || undefined);
    if (k) map[k] = { categoryId: catId, subcategoryId: subId };
  }

  // Income
  const incomePairs: [string, string, string, string?][] = [
    ["Salary", "", "cat_salary", undefined],
    ["Income", "", "cat_salary", undefined],
    ["Freelance", "", "cat_freelance", undefined],
    ["Investments", "", "cat_investments", undefined],
    ["Rental Income", "", "cat_rental", undefined],
    ["Rent", "", "cat_rental", undefined],
    ["Side Hustle", "", "cat_side_hustle", undefined],
    ["Cashback & Rewards", "", "cat_cashback", undefined],
    ["Government Benefits", "", "cat_government", undefined],
    ["Pocket Money", "", "cat_pocket_money", undefined],
    ["Allowance", "", "cat_pocket_money", "sub_allowance"],
    ["Gifts Received", "", "cat_gifts_received", undefined],
    ["Gifts", "", "cat_gifts_received", undefined],
    ["Refunds", "", "cat_refunds", undefined],
    ["Sale of Items", "", "cat_sale", undefined],
    ["Other", "", "cat_other_income", undefined],
  ];

  for (const [catName, subName, catId, subId] of incomePairs) {
    const k = key("income", catName, subName || undefined);
    if (k) map[k] = { categoryId: catId, subcategoryId: subId };
  }

  return map;
}

const CACHE = buildMoneyManagerCategoryMap();

/**
 * Resolve (type, categoryName, subcategoryName) to app categoryId/subcategoryId.
 * Returns null if no mapping (caller can create ad-hoc category).
 */
export function resolveMoneyManagerCategory(
  type: "income" | "expense",
  categoryName: string,
  subcategoryName?: string
): CategoryMapping | null {
  const withSub = key(type, categoryName, subcategoryName);
  if (withSub && CACHE[withSub]) return CACHE[withSub];
  const parentOnly = key(type, categoryName, undefined);
  return (parentOnly && CACHE[parentOnly]) ? CACHE[parentOnly] : null;
}

export function getFullMoneyManagerCategoryMap(): Record<string, CategoryMapping> {
  return { ...CACHE };
}
