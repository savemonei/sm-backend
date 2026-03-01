/**
 * Merge imported categories with existing (alias + name matching).
 * Used by POST /import/merge-categories. Does not mutate input.
 */
import type { CategoryAliasProvider } from "./category-aliases";
import { getDefaultCategoryAliasProvider } from "./category-aliases";

export interface CategoryLike {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  [k: string]: unknown;
}

export interface BackupDataLike {
  version?: string;
  createdAt?: string;
  appVersion?: string;
  backupType?: string;
  data: {
    transactions?: Array<{ id: string; category_id?: string | null; [k: string]: unknown }>;
    transaction_splits?: Array<{ id: string; category_id?: string | null; [k: string]: unknown }>;
    categories: CategoryLike[];
    [k: string]: unknown;
  };
}

function normalizeCategoryNameForMatch(name: string): string {
  if (!name || !name.trim()) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*[&\u2013\u2014\-]\s*|\s+and\s+/gi, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedNamesMatch(normA: string, normB: string): boolean {
  if (!normA || !normB) return normA === normB;
  if (normA === normB) return true;
  if (normA.startsWith(normB + " ")) return true;
  if (normB.startsWith(normA + " ")) return true;
  if (normA + "s" === normB) return true;
  if (normB + "s" === normA) return true;
  if (normA.endsWith("s") && normA.slice(0, -1) === normB) return true;
  if (normB.endsWith("s") && normB.slice(0, -1) === normA) return true;
  return false;
}

/** Deep-clone backup data so we never mutate the request body. */
function cloneBackupData(backupData: BackupDataLike): BackupDataLike {
  return JSON.parse(JSON.stringify(backupData));
}

/**
 * Merge imported categories with existing; remap transaction category_id.
 * Returns a new backupData (does not mutate input).
 * @param aliasProvider - Optional; defaults to default locale aliases. Use for region/locale or tests.
 */
export function mergeImportedCategoriesWithExisting(
  backupData: BackupDataLike,
  existingCategories: CategoryLike[],
  aliasProvider?: CategoryAliasProvider
): BackupDataLike {
  const data = backupData.data;
  if (!data?.categories?.length || !existingCategories.length) {
    return backupData;
  }

  const provider = aliasProvider ?? getDefaultCategoryAliasProvider();
  const TOP_LEVEL_ALIASES = provider.getTopLevelAliases();
  const SUB_ALIASES = provider.getSubAliases();

  const working = cloneBackupData(backupData);
  const workData = working.data;

  const existingByFullKey = new Map<string, CategoryLike>();
  const existingByNameAndType = new Map<string, CategoryLike>();
  const existingTopLevelByNormNameType = new Map<string, CategoryLike>();
  const existingTopLevelListByType = new Map<string, Array<{ normName: string; cat: CategoryLike }>>();
  const existingSubsByNormNameType = new Map<string, CategoryLike[]>();

  for (const c of existingCategories) {
    const nameKey = (c.name || "").trim().toLowerCase();
    const normName = normalizeCategoryNameForMatch(c.name || "");
    const typeKey = c.type === "both" ? "both" : c.type;
    const parentKey = c.parent_id ?? "";
    const fullKey = `${parentKey}_${nameKey}_${typeKey}`;
    existingByFullKey.set(fullKey, c);
    const nameTypeKey = `${nameKey}_${typeKey}`;
    if (!existingByNameAndType.has(nameTypeKey)) existingByNameAndType.set(nameTypeKey, c);
    if (!parentKey) {
      const normKey = `${normName}_${typeKey}`;
      if (!existingTopLevelByNormNameType.has(normKey)) existingTopLevelByNormNameType.set(normKey, c);
      for (const t of typeKey === "both" ? (["both", "income", "expense"] as const) : [typeKey]) {
        const list = existingTopLevelListByType.get(t) ?? [];
        if (!list.some((x) => x.cat.id === c.id)) list.push({ normName, cat: c });
        existingTopLevelListByType.set(t, list);
      }
      if (typeKey === "both") {
        if (!existingTopLevelByNormNameType.has(`${normName}_income`)) existingTopLevelByNormNameType.set(`${normName}_income`, c);
        if (!existingTopLevelByNormNameType.has(`${normName}_expense`)) existingTopLevelByNormNameType.set(`${normName}_expense`, c);
      }
    } else {
      const subNormKey = `${normName}_${typeKey}`;
      const arr = existingSubsByNormNameType.get(subNormKey) ?? [];
      if (!arr.includes(c)) arr.push(c);
      existingSubsByNormNameType.set(subNormKey, arr);
      if (typeKey === "both") {
        for (const t of ["income", "expense"] as const) {
          const k = `${normName}_${t}`;
          const a = existingSubsByNormNameType.get(k) ?? [];
          if (!a.includes(c)) a.push(c);
          existingSubsByNormNameType.set(k, a);
        }
      }
    }
    if (typeKey === "both") {
      existingByFullKey.set(`${parentKey}_${nameKey}_income`, c);
      existingByFullKey.set(`${parentKey}_${nameKey}_expense`, c);
      if (!existingByNameAndType.has(`${nameKey}_income`)) existingByNameAndType.set(`${nameKey}_income`, c);
      if (!existingByNameAndType.has(`${nameKey}_expense`)) existingByNameAndType.set(`${nameKey}_expense`, c);
    }
  }

  const importedById = new Map<string, CategoryLike>();
  for (const c of workData.categories) {
    importedById.set(c.id, c);
  }

  const typesToTry = (t: string) => (t === "both" ? (["both", "income", "expense"] as const) : [t] as const);
  const findExistingTopLevelByNormName = (normName: string, typeKey: string): CategoryLike | undefined => {
    const exact =
      existingTopLevelByNormNameType.get(`${normName}_${typeKey}`) ??
      (typeKey === "both" ? existingTopLevelByNormNameType.get(`${normName}_income`) ?? existingTopLevelByNormNameType.get(`${normName}_expense`) : undefined);
    if (exact) return exact;
    for (const t of typesToTry(typeKey)) {
      const list = existingTopLevelListByType.get(t) ?? [];
      const found = list.find((x) => normalizedNamesMatch(normName, x.normName));
      if (found) return found.cat;
    }
    return undefined;
  };

  const oldIdToExistingId = new Map<string, string>();
  const existingCategoriesToReInsert = new Map<string, CategoryLike>();

  for (const imp of workData.categories) {
    const nameKey = (imp.name || "").trim().toLowerCase();
    const normName = normalizeCategoryNameForMatch(imp.name || "");
    const typeKey = imp.type === "both" ? "both" : imp.type;
    const nameTypeKey = `${nameKey}_${typeKey}`;
    const normNameTypeKey = `${normName}_${typeKey}`;
    const parentKey = imp.parent_id ?? "";

    let existing: CategoryLike | undefined;

    if (!parentKey) {
      const canonicalTop = TOP_LEVEL_ALIASES[normName];
      existing =
        existingByFullKey.get(`_${nameKey}_${typeKey}`) ??
        findExistingTopLevelByNormName(normName, typeKey) ??
        (canonicalTop ? findExistingTopLevelByNormName(canonicalTop, typeKey) : undefined) ??
        existingByNameAndType.get(nameTypeKey);
    } else {
      const importedParent = importedById.get(parentKey);
      const importedParentNormName = normalizeCategoryNameForMatch(importedParent?.name ?? "");
      const canonicalParent = importedParentNormName ? TOP_LEVEL_ALIASES[importedParentNormName] : undefined;
      let existingParent = importedParentNormName ? findExistingTopLevelByNormName(importedParentNormName, typeKey) : undefined;
      if (!existingParent && canonicalParent) {
        existingParent = findExistingTopLevelByNormName(canonicalParent, typeKey);
      }
      if (existingParent) {
        existing = existingByFullKey.get(`${existingParent.id}_${nameKey}_${typeKey}`);
      }
      if (!existing) {
        const subsWithSameName =
          existingSubsByNormNameType.get(normNameTypeKey) ??
          existingSubsByNormNameType.get(`${normName}_income`) ??
          existingSubsByNormNameType.get(`${normName}_expense`);
        if (subsWithSameName?.length === 1) {
          existing = subsWithSameName[0];
        } else if (subsWithSameName && subsWithSameName.length > 1 && importedParentNormName) {
          const byParentMatch = subsWithSameName.find((sub) => {
            const p = existingCategories.find((x) => x.id === sub.parent_id);
            return p && normalizedNamesMatch(importedParentNormName, normalizeCategoryNameForMatch(p.name || ""));
          });
          existing = byParentMatch ?? subsWithSameName[0];
        } else if (subsWithSameName?.length) {
          existing = subsWithSameName[0];
        }
      }
      if (!existing && existingParent) {
        const trySubNorms = [normName, ...(SUB_ALIASES[normName] ?? [])];
        for (const subNorm of trySubNorms) {
          const candidates =
            existingSubsByNormNameType.get(`${subNorm}_${typeKey}`) ??
            existingSubsByNormNameType.get(`${subNorm}_income`) ??
            existingSubsByNormNameType.get(`${subNorm}_expense`) ??
            [];
          const underParent = candidates.filter((s) => s.parent_id === existingParent!.id);
          if (underParent.length >= 1) {
            existing = underParent[0];
            break;
          }
        }
        if (!existing && canonicalParent) {
          const parentCat = findExistingTopLevelByNormName(canonicalParent, typeKey);
          if (parentCat) {
            const trySubNorms2 = [normName, ...(SUB_ALIASES[normName] ?? [])];
            for (const subNorm of trySubNorms2) {
              const candidates =
                existingSubsByNormNameType.get(`${subNorm}_${typeKey}`) ??
                existingSubsByNormNameType.get(`${subNorm}_income`) ??
                existingSubsByNormNameType.get(`${subNorm}_expense`) ??
                [];
              const underParent = candidates.filter((s) => s.parent_id === parentCat.id);
              if (underParent.length >= 1) {
                existing = underParent[0];
                break;
              }
            }
          }
        }
      }
      if (!existing) {
        existing = existingByNameAndType.get(nameTypeKey);
      }
    }

    if (existing) {
      oldIdToExistingId.set(imp.id, existing.id);
      existingCategoriesToReInsert.set(existing.id, existing);
    }
  }

  const keptImported = workData.categories.filter((c) => !oldIdToExistingId.has(c.id));
  for (const c of keptImported) {
    if (c.parent_id && oldIdToExistingId.has(c.parent_id)) {
      c.parent_id = oldIdToExistingId.get(c.parent_id)!;
    }
  }

  const categoriesToInsert: CategoryLike[] = [...existingCategoriesToReInsert.values(), ...keptImported];

  const transactions = workData.transactions ?? [];
  for (const t of transactions) {
    if (t.category_id && oldIdToExistingId.has(t.category_id)) {
      t.category_id = oldIdToExistingId.get(t.category_id)!;
    }
  }
  const transaction_splits = workData.transaction_splits ?? [];
  for (const s of transaction_splits) {
    if (s.category_id && oldIdToExistingId.has(s.category_id)) {
      s.category_id = oldIdToExistingId.get(s.category_id)!;
    }
  }

  return {
    ...working,
    data: {
      ...workData,
      categories: categoriesToInsert,
      transactions,
      transaction_splits,
    },
  };
}

/**
 * Optimized merge: compute only the category id map and list of backup categories to insert.
 * Client sends only categories (no full backup); server returns map + list; client applies locally.
 * Does not mutate inputs.
 */
export function computeCategoryMerge(
  backupCategories: CategoryLike[],
  existingCategories: CategoryLike[],
  aliasProvider?: CategoryAliasProvider
): { categoryIdMap: Record<string, string>; categoriesToInsert: CategoryLike[] } {
  if (!backupCategories.length || !existingCategories.length) {
    return { categoryIdMap: {}, categoriesToInsert: backupCategories.map((c) => ({ ...c })) };
  }

  const provider = aliasProvider ?? getDefaultCategoryAliasProvider();
  const TOP_LEVEL_ALIASES = provider.getTopLevelAliases();
  const SUB_ALIASES = provider.getSubAliases();

  const existingByFullKey = new Map<string, CategoryLike>();
  const existingByNameAndType = new Map<string, CategoryLike>();
  const existingTopLevelByNormNameType = new Map<string, CategoryLike>();
  const existingTopLevelListByType = new Map<string, Array<{ normName: string; cat: CategoryLike }>>();
  const existingSubsByNormNameType = new Map<string, CategoryLike[]>();

  for (const c of existingCategories) {
    const nameKey = (c.name || "").trim().toLowerCase();
    const normName = normalizeCategoryNameForMatch(c.name || "");
    const typeKey = c.type === "both" ? "both" : c.type;
    const parentKey = c.parent_id ?? "";
    const fullKey = `${parentKey}_${nameKey}_${typeKey}`;
    existingByFullKey.set(fullKey, c);
    const nameTypeKey = `${nameKey}_${typeKey}`;
    if (!existingByNameAndType.has(nameTypeKey)) existingByNameAndType.set(nameTypeKey, c);
    if (!parentKey) {
      const normKey = `${normName}_${typeKey}`;
      if (!existingTopLevelByNormNameType.has(normKey)) existingTopLevelByNormNameType.set(normKey, c);
      for (const t of typeKey === "both" ? (["both", "income", "expense"] as const) : [typeKey]) {
        const list = existingTopLevelListByType.get(t) ?? [];
        if (!list.some((x) => x.cat.id === c.id)) list.push({ normName, cat: c });
        existingTopLevelListByType.set(t, list);
      }
      if (typeKey === "both") {
        if (!existingTopLevelByNormNameType.has(`${normName}_income`)) existingTopLevelByNormNameType.set(`${normName}_income`, c);
        if (!existingTopLevelByNormNameType.has(`${normName}_expense`)) existingTopLevelByNormNameType.set(`${normName}_expense`, c);
      }
    } else {
      const subNormKey = `${normName}_${typeKey}`;
      const arr = existingSubsByNormNameType.get(subNormKey) ?? [];
      if (!arr.includes(c)) arr.push(c);
      existingSubsByNormNameType.set(subNormKey, arr);
      if (typeKey === "both") {
        for (const t of ["income", "expense"] as const) {
          const k = `${normName}_${t}`;
          const a = existingSubsByNormNameType.get(k) ?? [];
          if (!a.includes(c)) a.push(c);
          existingSubsByNormNameType.set(k, a);
        }
      }
    }
    if (typeKey === "both") {
      existingByFullKey.set(`${parentKey}_${nameKey}_income`, c);
      existingByFullKey.set(`${parentKey}_${nameKey}_expense`, c);
      if (!existingByNameAndType.has(`${nameKey}_income`)) existingByNameAndType.set(`${nameKey}_income`, c);
      if (!existingByNameAndType.has(`${nameKey}_expense`)) existingByNameAndType.set(`${nameKey}_expense`, c);
    }
  }

  const importedById = new Map<string, CategoryLike>();
  for (const c of backupCategories) {
    importedById.set(c.id, c);
  }

  const typesToTry = (t: string) => (t === "both" ? (["both", "income", "expense"] as const) : [t] as const);
  const findExistingTopLevelByNormName = (normName: string, typeKey: string): CategoryLike | undefined => {
    const exact =
      existingTopLevelByNormNameType.get(`${normName}_${typeKey}`) ??
      (typeKey === "both" ? existingTopLevelByNormNameType.get(`${normName}_income`) ?? existingTopLevelByNormNameType.get(`${normName}_expense`) : undefined);
    if (exact) return exact;
    for (const t of typesToTry(typeKey)) {
      const list = existingTopLevelListByType.get(t) ?? [];
      const found = list.find((x) => normalizedNamesMatch(normName, x.normName));
      if (found) return found.cat;
    }
    return undefined;
  };

  const oldIdToExistingId = new Map<string, string>();

  for (const imp of backupCategories) {
    const nameKey = (imp.name || "").trim().toLowerCase();
    const normName = normalizeCategoryNameForMatch(imp.name || "");
    const typeKey = imp.type === "both" ? "both" : imp.type;
    const nameTypeKey = `${nameKey}_${typeKey}`;
    const parentKey = imp.parent_id ?? "";

    let existing: CategoryLike | undefined;

    if (!parentKey) {
      const canonicalTop = TOP_LEVEL_ALIASES[normName];
      existing =
        existingByFullKey.get(`_${nameKey}_${typeKey}`) ??
        findExistingTopLevelByNormName(normName, typeKey) ??
        (canonicalTop ? findExistingTopLevelByNormName(canonicalTop, typeKey) : undefined) ??
        existingByNameAndType.get(nameTypeKey);
    } else {
      const importedParent = importedById.get(parentKey);
      const importedParentNormName = normalizeCategoryNameForMatch(importedParent?.name ?? "");
      const canonicalParent = importedParentNormName ? TOP_LEVEL_ALIASES[importedParentNormName] : undefined;
      let existingParent = importedParentNormName ? findExistingTopLevelByNormName(importedParentNormName, typeKey) : undefined;
      if (!existingParent && canonicalParent) {
        existingParent = findExistingTopLevelByNormName(canonicalParent, typeKey);
      }
      if (existingParent) {
        existing = existingByFullKey.get(`${existingParent.id}_${nameKey}_${typeKey}`);
      }
      if (!existing) {
        const subsWithSameName =
          existingSubsByNormNameType.get(`${normName}_${typeKey}`) ??
          existingSubsByNormNameType.get(`${normName}_income`) ??
          existingSubsByNormNameType.get(`${normName}_expense`);
        if (subsWithSameName?.length === 1) {
          existing = subsWithSameName[0];
        } else if (subsWithSameName && subsWithSameName.length > 1 && importedParentNormName) {
          const byParentMatch = subsWithSameName.find((sub) => {
            const p = existingCategories.find((x) => x.id === sub.parent_id);
            return p && normalizedNamesMatch(importedParentNormName, normalizeCategoryNameForMatch(p.name || ""));
          });
          existing = byParentMatch ?? subsWithSameName[0];
        } else if (subsWithSameName?.length) {
          existing = subsWithSameName[0];
        }
      }
      if (!existing && existingParent) {
        const trySubNorms = [normName, ...(SUB_ALIASES[normName] ?? [])];
        for (const subNorm of trySubNorms) {
          const candidates =
            existingSubsByNormNameType.get(`${subNorm}_${typeKey}`) ??
            existingSubsByNormNameType.get(`${subNorm}_income`) ??
            existingSubsByNormNameType.get(`${subNorm}_expense`) ??
            [];
          const underParent = candidates.filter((s) => s.parent_id === existingParent!.id);
          if (underParent.length >= 1) {
            existing = underParent[0];
            break;
          }
        }
        if (!existing && canonicalParent) {
          const parentCat = findExistingTopLevelByNormName(canonicalParent, typeKey);
          if (parentCat) {
            const trySubNorms2 = [normName, ...(SUB_ALIASES[normName] ?? [])];
            for (const subNorm of trySubNorms2) {
              const candidates =
                existingSubsByNormNameType.get(`${subNorm}_${typeKey}`) ??
                existingSubsByNormNameType.get(`${subNorm}_income`) ??
                existingSubsByNormNameType.get(`${subNorm}_expense`) ??
                [];
              const underParent = candidates.filter((s) => s.parent_id === parentCat.id);
              if (underParent.length >= 1) {
                existing = underParent[0];
                break;
              }
            }
          }
        }
      }
      if (!existing) {
        existing = existingByNameAndType.get(nameTypeKey);
      }
    }

    if (existing) {
      oldIdToExistingId.set(imp.id, existing.id);
    }
  }

  const keptImported = backupCategories
    .filter((c) => !oldIdToExistingId.has(c.id))
    .map((c) => {
      const copy = { ...c };
      if (copy.parent_id && oldIdToExistingId.has(copy.parent_id)) {
        copy.parent_id = oldIdToExistingId.get(copy.parent_id)!;
      }
      return copy;
    });

  return {
    categoryIdMap: Object.fromEntries(oldIdToExistingId),
    categoriesToInsert: keptImported,
  };
}
