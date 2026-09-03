export type AgentIntent =
  | "product_discovery"
  | "compare_products"
  | "cart_action"
  | "checkout"
  | "unknown";

export type AgentDecision = {
  intent: AgentIntent;

  summary: string;

  constraints: {
    budget?: number;
    useCases: string[];
    keywords: string[];
  };

  nextAction:
    | "SEARCH_CATALOG"
    | "SHOW_RECOMMENDATIONS"
    | "ADD_TO_CART"
    | "SUGGEST_UPSELL"
    | "REQUEST_APPROVAL"
    | "CLARIFY";

  reasoning: string;

  confidence: number;
};
