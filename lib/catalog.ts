import { products, Product } from "@/data/products";

export type SearchCriteria = {
  query: string;
  maxBudget?: number;
  requiredTags?: string[];
  preferredTags?: string[];
};

export type ProductMatch = {
  product: Product;
  score: number;
  reasons: string[];
};

export function searchCatalog(
  criteria: SearchCriteria
): ProductMatch[] {
  const normalizedQuery = criteria.query.toLowerCase();

  const requiredTags = criteria.requiredTags ?? [];
  const preferredTags = criteria.preferredTags ?? [];

  const results = products
    .filter((product) => {
      if (
        criteria.maxBudget &&
        product.price > criteria.maxBudget
      ) {
        return false;
      }

      return true;
    })
    .map((product) => {
      let score = 0;
      const reasons: string[] = [];

      const searchableText = [
        product.name,
        product.brand,
        product.category,
        product.description,
        ...product.specs,
        ...product.tags,
      ]
        .join(" ")
        .toLowerCase();

      // Query relevance
      const queryWords = normalizedQuery
        .split(/\s+/)
        .filter((word) => word.length > 2);

      const matchingWords = queryWords.filter((word) =>
        searchableText.includes(word)
      );

      score += matchingWords.length * 10;

      // Required tags
      for (const tag of requiredTags) {
        if (product.tags.includes(tag)) {
          score += 25;
          reasons.push(`Matches required ${tag} use case`);
        }
      }

      // Preferred tags
      for (const tag of preferredTags) {
        if (product.tags.includes(tag)) {
          score += 10;
          reasons.push(`Strong fit for ${tag}`);
        }
      }

      // Rating
      score += product.rating * 3;

      if (product.rating >= 4.5) {
        reasons.push("Highly rated by customers");
      }

      // Budget efficiency
      if (criteria.maxBudget) {
        const budgetUsage =
          product.price / criteria.maxBudget;

        if (budgetUsage <= 0.95) {
          score += 8;
          reasons.push("Leaves room within your budget");
        }
      }

      return {
        product,
        score,
        reasons,
      };
    });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
