export type PolicyDecision = {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  maxAuthorizedAmount: number;
};

type CartItem = {
  id: string;
  name: string;
  price: number;
};

type PolicyInput = {
  cart: CartItem[];
  customerApproved: boolean;
};

const MAX_SINGLE_ITEM_VALUE = 60000;
const MAX_CART_VALUE = 65000;

export function evaluateCartPolicy(
  input: PolicyInput
): PolicyDecision {
  const { cart, customerApproved } = input;

  if (cart.length === 0) {
    return {
      allowed: false,
      reason: "Cart is empty.",
      requiresApproval: false,
      maxAuthorizedAmount: 0,
    };
  }

  const total = cart.reduce(
    (sum, item) => sum + item.price,
    0
  );

  const expensiveItem = cart.find(
    (item) => item.price > MAX_SINGLE_ITEM_VALUE
  );

  if (expensiveItem) {
    return {
      allowed: false,
      reason:
        "This item exceeds the maximum authorized item value.",
      requiresApproval: true,
      maxAuthorizedAmount: MAX_SINGLE_ITEM_VALUE,
    };
  }

  if (total > MAX_CART_VALUE) {
    return {
      allowed: false,
      reason:
        "Cart value exceeds the configured financial boundary.",
      requiresApproval: true,
      maxAuthorizedAmount: MAX_CART_VALUE,
    };
  }

  if (!customerApproved) {
    return {
      allowed: true,
      reason:
        "Cart is within policy, but explicit customer approval is required before payment.",
      requiresApproval: true,
      maxAuthorizedAmount: total,
    };
  }

  return {
    allowed: true,
    reason:
      "Cart satisfies policy and customer approval has been received.",
    requiresApproval: false,
    maxAuthorizedAmount: total,
  };
}
