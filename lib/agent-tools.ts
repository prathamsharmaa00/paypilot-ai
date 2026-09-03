import { searchCatalog, ProductMatch } from "@/lib/catalog";

export type SearchCatalogToolInput = {
  query: string;
  maxBudget?: number;
  requiredTags?: string[];
  preferredTags?: string[];
};

export function searchCatalogTool(
  input: SearchCatalogToolInput
): ProductMatch[] {
  return searchCatalog({
    query: input.query,
    maxBudget: input.maxBudget,
    requiredTags: input.requiredTags,
    preferredTags: input.preferredTags,
  });
}
