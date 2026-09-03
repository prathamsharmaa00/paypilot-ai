export type ShoppingIntent = {
  originalQuery: string;
  budget?: number;
  useCases: string[];
  keywords: string[];
};

export function parseShoppingIntent(
  query: string
): ShoppingIntent {
  const normalized = query.toLowerCase();

  const budgetMatch = normalized.match(
    /(?:₹|rs\.?|inr)\s?(\d[\d,]*)/i
  );

  let budget: number | undefined;

  if (budgetMatch) {
    budget = Number(
      budgetMatch[1].replace(/,/g, "")
    );
  }

  const useCases: string[] = [];

  if (
    normalized.includes("coding") ||
    normalized.includes("programming") ||
    normalized.includes("developer")
  ) {
    useCases.push("coding");
  }

  if (
    normalized.includes("gaming") ||
    normalized.includes("game")
  ) {
    useCases.push("gaming");
  }

  if (
    normalized.includes("ai") ||
    normalized.includes("machine learning") ||
    normalized.includes("ml")
  ) {
    useCases.push("ai");
  }

  if (
    normalized.includes("college") ||
    normalized.includes("student")
  ) {
    useCases.push("college");
  }

  if (
    normalized.includes("portable") ||
    normalized.includes("lightweight")
  ) {
    useCases.push("portable");
  }

  const keywords = normalized
    .split(/\s+/)
    .filter((word) => word.length > 2);

  return {
    originalQuery: query,
    budget,
    useCases,
    keywords,
  };
}
