"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Product,
  products,
  upsellProducts,
} from "@/data/products";

import { parseShoppingIntent, ShoppingIntent } from "@/lib/intent";
import { searchCatalog, ProductMatch } from "@/lib/catalog";
import {
  evaluateCartPolicy,
  type PolicyDecision,
} from "@/lib/policy";

declare global {
  interface Window {
    Razorpay: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      order_id: string;
      handler: (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => void;
      theme?: {
        color?: string;
      };
    }) => {
      open: () => void;
    };
  }
}

type AuditEvent = {
  id: number;
  label: string;
  detail: string;
  status: "info" | "success" | "warning";
  step?: string;
  duration?: number;
};

type CartItem = {
  id: string;
  name: string;
  price: number;
};

const starterEvents: AuditEvent[] = [
  {
    id: 1,
    label: "Session initialized",
    detail: "No financial permissions granted.",
    status: "info",
  },
  {
    id: 2,
    label: "Policy engine active",
    detail: "Checkout requires explicit customer approval.",
    status: "success",
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AgentWorkbench() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [recommendations, setRecommendations] =
    useState<Product[]>([]);
  const [policyDecision, setPolicyDecision] =
    useState<PolicyDecision | null>(null);
  const [agentConfidence, setAgentConfidence] =
    useState<number | null>(null);
  const [activeIntent, setActiveIntent] = useState<ShoppingIntent | null>(null);
  const [searchMatches, setSearchMatches] = useState<ProductMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [auditEvents, setAuditEvents] =
    useState<AuditEvent[]>(starterEvents);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [orderApproved, setOrderApproved] = useState(false);
  const [approvalToken, setApprovalToken] =
    useState<string | null>(null);

  const [paymentStatus, setPaymentStatus] =
    useState<
      | "IDLE"
      | "AUTHORIZED"
      | "PROCESSING"
      | "CAPTURED"
      | "FAILED"
      | "UNKNOWN"
    >("IDLE");

  const [razorpayOrderId, setRazorpayOrderId] =
    useState<string | null>(null);

  const [razorpayPaymentId, setRazorpayPaymentId] =
    useState<string | null>(null);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price, 0),
    [cart]
  );

  function addAuditEvent(
    label: string,
    detail: string,
    status: AuditEvent["status"] = "info",
    step?: string,
    duration?: number
  ) {
    setAuditEvents((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        label,
        detail,
        status,
        step,
        duration,
      },
    ]);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuery = query.trim();

    if (!cleanQuery) return;

    const requestStartedAt = performance.now();

    setSubmittedQuery(cleanQuery);

    // IMPORTANT:
    // Do NOT hide the UI while the local AI is running.
    // First render deterministic catalog results immediately.
    setHasSearched(false);
    setAgentConfidence(null);

    // STEP 01 — User request
    addAuditEvent(
      "User request received",
      `"${cleanQuery}"`,
      "info",
      "01"
    );

    // ---------------------------------------------------------
    // FAST PATH — deterministic intent + catalog
    // ---------------------------------------------------------

    const fastPathStart = performance.now();

    const fastIntent = parseShoppingIntent(cleanQuery);

    const fastResults = searchCatalog({
      query: cleanQuery,
      maxBudget: fastIntent.budget,
      requiredTags: fastIntent.useCases,
      preferredTags: ["performance"],
    });

    const fastPathDuration = Math.round(
      performance.now() - fastPathStart
    );

    // Immediately populate the UI.
    setActiveIntent(fastIntent);
    setSearchMatches(fastResults);
    setRecommendations(
      fastResults.map((result) => result.product)
    );

    setHasSearched(true);

    addAuditEvent(
      "Fast catalog path",
      `${fastResults.length} products found using deterministic intent parsing and catalog search.`,
      "success",
      "01A",
      fastPathDuration
    );

    addAuditEvent(
      "Recommendations rendered",
      `Products displayed immediately while the local AI decision runs in the background.`,
      "success",
      "01B",
      Math.round(performance.now() - requestStartedAt)
    );

    // ---------------------------------------------------------
    // AI PATH — runs after the UI is already visible
    // ---------------------------------------------------------

    try {
      const agentStartTime = performance.now();

      addAuditEvent(
        "Local AI started",
        "Qwen is analyzing the request and validating the commerce decision.",
        "info",
        "02"
      );

      const agentResponse = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanQuery,
        }),
      });

      const agentData = await agentResponse.json();

      const agentDuration = Math.round(
        performance.now() - agentStartTime
      );

      if (!agentResponse.ok || !agentData.success) {
        throw new Error(
          agentData.error || "Local AI agent failed."
        );
      }

      const decision = agentData.decision;

      if (!decision) {
        throw new Error("Agent returned no decision.");
      }

      setAgentConfidence(
        typeof decision.confidence === "number"
          ? decision.confidence
          : null
      );

      // STEP 02 — Agent decision
      addAuditEvent(
        "Local AI decision",
        `${decision.intent} · confidence ${Math.round(
          (decision.confidence ?? 0) * 100
        )}%`,
        "success",
        "02",
        agentDuration
      );

      // STEP 03 — Extract constraints
      const budget =
        typeof decision.constraints?.budget === "number"
          ? decision.constraints.budget
          : undefined;

      const useCases =
        Array.isArray(decision.constraints?.useCases)
          ? decision.constraints.useCases
          : [];

      const keywords =
        Array.isArray(decision.constraints?.keywords)
          ? decision.constraints.keywords
          : [];

      addAuditEvent(
        "Constraints extracted",
        `Budget: ${
          budget
            ? formatCurrency(budget)
            : "Not specified"
        } · Use cases: ${
          useCases.length
            ? useCases.join(", ")
            : "None"
        }`,
        "success",
        "03"
      );

      const aiIntent: ShoppingIntent = {
        originalQuery: cleanQuery,
        budget,
        useCases,
        keywords,
      };

      setActiveIntent(aiIntent);

      // ---------------------------------------------------------
      // AI catalog results
      // ---------------------------------------------------------

      const toolResult = agentData.toolResult;

      if (
        toolResult &&
        toolResult.tool === "search_catalog" &&
        Array.isArray(toolResult.results)
      ) {
        const results: ProductMatch[] =
          toolResult.results;

        addAuditEvent(
          "Catalog tool executed",
          "search_catalog returned verified products from the deterministic catalog.",
          "success",
          "04"
        );

        setSearchMatches(results);

        setRecommendations(
          results.map((result) => result.product)
        );

        addAuditEvent(
          "Catalog results verified",
          `${results.length} verified catalog products returned.`,
          "success",
          "05"
        );
      } else {
        // Keep the fast-path results if AI did not return
        // catalog results.
        addAuditEvent(
          "AI catalog result unavailable",
          "Keeping the already-rendered deterministic catalog results.",
          "warning",
          "04"
        );
      }

      // STEP 06 — Financial boundary
      addAuditEvent(
        "Financial boundary enforced",
        "No payment authority granted. Checkout remains human-gated.",
        "success",
        "06"
      );

      addAuditEvent(
        "Recommendation generated",
        `AI decision completed. Recommendations were already visible before AI completion.`,
        "success"
      );

    } catch (error) {
      console.error("PayPilot agent error:", error);

      // IMPORTANT:
      // Do NOT replace the already visible products.
      // Just record that AI failed.
      addAuditEvent(
        "Local AI unavailable",
        "The local model failed. Deterministic recommendations remain available.",
        "warning",
        "02"
      );

      addAuditEvent(
        "Deterministic fallback active",
        `${fastResults.length} products remain available without AI.`,
        "success"
      );
    }
  }

  function addProduct(product: Product) {
    if (cart.some((item) => item.id === product.id)) return;

    const nextCart: CartItem[] = [
      ...cart,
      {
        id: product.id,
        name: product.name,
        price: product.price,
      },
    ];

    const policy = evaluateCartPolicy({
      cart: nextCart,
      customerApproved: false,
    });

    setPolicyDecision(policy);

    if (!policy.allowed) {
      addAuditEvent(
        "Policy blocked cart update",
        policy.reason,
        "warning",
        "POLICY"
      );

      return;
    }

    setCart(nextCart);

    addAuditEvent(
      "Policy engine evaluated",
      `Cart value ${formatCurrency(
        policy.maxAuthorizedAmount
      )}. Customer approval required.`,
      "success",
      "POLICY"
    );

    addAuditEvent(
      "Cart updated",
      `${product.name} added after explicit customer action.`,
      "success"
    );
  }

  function addUpsell() {
    const upsell = upsellProducts[0];

    if (cart.some((item) => item.id === upsell.id)) return;

    setCart((current) => [
      ...current,
      {
        id: upsell.id,
        name: upsell.name,
        price: upsell.price,
      },
    ]);

    addAuditEvent(
      "Upsell accepted",
      `${upsell.name} added. Agent did not auto-add the product.`,
      "success"
    );
  }

  function removeItem(id: string) {
    const item = cart.find((cartItem) => cartItem.id === id);

    setCart((current) =>
      current.filter((cartItem) => cartItem.id !== id)
    );

    if (item) {
      addAuditEvent(
        "Cart item removed",
        `${item.name} removed by customer.`,
        "info"
      );
    }
  }

  function requestCheckout() {
    if (cart.length === 0) return;

    const policy = evaluateCartPolicy({
      cart,
      customerApproved: false,
    });

    setPolicyDecision(policy);

    if (!policy.allowed) {
      addAuditEvent(
        "Checkout blocked by policy",
        policy.reason,
        "warning",
        "POLICY"
      );

      return;
    }

    addAuditEvent(
      "Policy approval required",
      `Cart total ${formatCurrency(
        policy.maxAuthorizedAmount
      )}. Explicit customer approval required.`,
      "warning",
      "POLICY"
    );

    setApprovalOpen(true);
  }

  async function refreshPaymentStatus(
    orderId: string
  ) {
    try {
      const response = await fetch(
        `/api/payment/status?orderId=${encodeURIComponent(
          orderId
        )}`,
        {
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Payment status unavailable."
        );
      }

      const status =
        data.transaction.status;

      setPaymentStatus(status);

      if (
        data.transaction.payment?.id
      ) {
        setRazorpayPaymentId(
          data.transaction.payment.id
        );
      }

      if (status === "CAPTURED") {
        addAuditEvent(
          "Payment status confirmed",
          "Razorpay confirms the payment as captured.",
          "success",
          "VERIFIED"
        );
      }

      if (status === "FAILED") {
        addAuditEvent(
          "Payment failed",
          "Razorpay reports that the payment attempt failed. No automatic retry was performed.",
          "warning",
          "PAYMENT"
        );
      }

      return data.transaction;
    } catch (error) {
      console.error(
        "Payment status refresh failed:",
        error
      );

      setPaymentStatus(
        "UNKNOWN"
      );

      return null;
    }
  }

  useEffect(() => {
    if (
      !razorpayOrderId ||
      paymentStatus === "CAPTURED" ||
      paymentStatus === "FAILED"
    ) {
      return;
    }

    const interval =
      window.setInterval(() => {
        refreshPaymentStatus(
          razorpayOrderId
        );
      }, 3000);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    razorpayOrderId,
    paymentStatus,
  ]);

  async function approveCheckout() {
    try {
      const policy = evaluateCartPolicy({
        cart,
        customerApproved: true,
      });

      setPolicyDecision(policy);

      if (
        !policy.allowed ||
        policy.requiresApproval
      ) {
        addAuditEvent(
          "Approval rejected by policy",
          policy.reason,
          "warning",
          "POLICY"
        );

        return;
      }

      addAuditEvent(
        "Customer approval requested",
        `Requesting server authorization for exactly ${formatCurrency(
          policy.maxAuthorizedAmount
        )}.`,
        "info",
        "APPROVAL"
      );

      const response = await fetch(
        "/api/payment/authorize",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            cart: cart.map((item) => ({
              id: item.id,
            })),
          }),
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        addAuditEvent(
          "Server authorization rejected",
          data.error ||
            "Payment authorization could not be created.",
          "warning",
          "APPROVAL"
        );

        return;
      }

      /*
       * Store only the short-lived authorization
       * token in memory.
       */
      setApprovalToken(
        data.authorization.token
      );

      setApprovalOpen(false);
      setOrderApproved(true);
      setPaymentStatus("AUTHORIZED");

      addAuditEvent(
        "Customer authorization received",
        `Server authorization recorded for exactly ${formatCurrency(
          data.authorization.amount
        )}.`,
        "success",
        "APPROVAL"
      );

      addAuditEvent(
        "Execution bounded",
        "Only the server-authorized cart and amount can be sent to Razorpay.",
        "success",
        "BOUNDARY"
      );
    } catch (error) {
      console.error(
        "Customer authorization failed:",
        error
      );

      addAuditEvent(
        "Authorization unavailable",
        "The payment authorization service could not be reached. No payment was created.",
        "warning",
        "APPROVAL"
      );
    }
  }

  const openRazorpayCheckout = async () => {
    try {
      if (!cart.length) {
        return;
      }

      if (!approvalToken) {
        addAuditEvent(
          "Payment blocked",
          "A valid customer authorization is required before creating a Razorpay order.",
          "warning",
          "APPROVAL"
        );

        return;
      }

      const response = await fetch(
        "/api/payment/create-order",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cart: cart.map((item) => ({
              id: item.id,
            })),
            approvalToken,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error(
          "Razorpay order creation failed:",
          data
        );

        return;
      }

      setRazorpayOrderId(data.order.id);
      setPaymentStatus("PROCESSING");

      addAuditEvent(
        "Razorpay order created",
        `Test Mode order created for ${formatCurrency(
          data.order.amount / 100
        )}.`,
        "success",
        "PAYMENT"
      );

      if (!window.Razorpay) {
        console.error(
          "Razorpay Checkout has not loaded yet."
        );

        return;
      }

      const options = {
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        name: "PayPilot AI",
        description:
          "PayPilot AI Test Mode Checkout",
        order_id: data.order.id,

        handler: async (paymentResponse: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          addAuditEvent(
            "Payment submitted",
            "Customer completed the Razorpay Test Mode checkout flow.",
            "success",
            "PAYMENT"
          );

          try {
            console.log(
              "Razorpay Test Payment Response:",
              paymentResponse
            );

            const response = await fetch(
              "/api/payment/verify",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(
                  paymentResponse
                ),
              }
            );

            const data = await response.json();

            if (!response.ok || !data.verified) {
              setPaymentStatus("UNKNOWN");

              addAuditEvent(
                "Payment confirmation unavailable",
                "The browser could not confirm the final payment state. PayPilot will query Razorpay before considering the payment complete.",
                "warning",
                "PAYMENT"
              );

              await refreshPaymentStatus(
                paymentResponse.razorpay_order_id
              );

              return;
            }

            setRazorpayPaymentId(data.payment.id);
            setPaymentStatus("CAPTURED");

            addAuditEvent(
              "Payment verified",
              `Razorpay payment ${data.payment.id} was captured and server-side verification succeeded for ${formatCurrency(
                data.payment.amount / 100
              )}.`,
              "success",
              "VERIFIED"
            );

            addAuditEvent(
              "Execution completed",
              "Payment was verified server-side. No autonomous retry was performed.",
              "success",
              "PAYMENT"
            );

            console.log(
              "✅ Razorpay payment verified:",
              data.payment
            );
          } catch (error) {
            console.error(
              "Payment verification request failed:",
              error
            );

            setPaymentStatus("UNKNOWN");

            await refreshPaymentStatus(
              paymentResponse.razorpay_order_id
            );
          }
        },

        theme: {
          color: "#22d3ee",
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.open();
    } catch (error) {
      console.error("Razorpay Checkout Error:", error);
    }
  };

  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute right-[4%] top-[8rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/10 blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-5 py-5 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 font-black text-black">
                P
              </div>

              <div>
                <p className="text-lg font-semibold tracking-tight">
                  PayPilot AI
                </p>
                <p className="text-xs text-zinc-500">
                  Agentic Commerce Control Room
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill label="Catalog" value="Connected" />
            <StatusPill label="Policy Engine" value="Enforced" />
            <StatusPill label="Payments" value="Test Mode" />
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035]">
          <div className="grid lg:grid-cols-[1.25fr_.75fr]">
            <div className="p-7 md:p-10">
              <p className="mb-4 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                Commerce intelligence, with human control.
              </p>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                Don&apos;t search products.
                <span className="block bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Delegate the decision.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                PayPilot understands intent, evaluates products,
                explains recommendations, proposes relevant upsells and
                never crosses the payment boundary without approval.
              </p>

              <form
                onSubmit={handleSearch}
                className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-2"
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Try: I need a laptop under ₹60,000 for coding and gaming"
                    className="min-h-12 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-zinc-600"
                  />

                  <button
                    type="submit"
                    className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-200"
                  >
                    Ask PayPilot →
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Laptop under ₹60k for coding",
                  "Best laptop for AI + gaming",
                  "Portable laptop for college",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setQuery(prompt)}
                    className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-400 transition hover:border-white/20 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 bg-black/20 p-7 lg:border-l lg:border-t-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Live system contract
              </p>

              <div className="mt-6 space-y-3">
                <ContractRow
                  number="01"
                  title="Explain"
                  text="Every recommendation includes its reasoning."
                />
                <ContractRow
                  number="02"
                  title="Bound"
                  text="Tools operate only within declared limits."
                />
                <ContractRow
                  number="03"
                  title="Gate"
                  text="Money movement requires customer approval."
                />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            {hasSearched ? (
              <>
                <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-6 md:p-8">
                  <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-cyan-400">
                        Agent response
                      </p>

                      <h2 className="mt-2 text-2xl font-semibold">
                        I found {recommendations.length} strong matches.
                      </h2>

                      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                        For &quot;{submittedQuery}&quot;, I prioritized{" "}
                        {activeIntent?.useCases.length
                          ? activeIntent.useCases.join(", ")
                          : "overall relevance"}
                        {activeIntent?.budget
                          ? ` and your ₹${activeIntent.budget.toLocaleString("en-IN")} budget`
                          : ""}
                        .
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
                      Confidence{" "}
                      {agentConfidence !== null
                        ? `${Math.round(agentConfidence * 100)}%`
                        : "—"}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    {recommendations.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        rank={index + 1}
                        added={cart.some(
                          (item) => item.id === product.id
                        )}
                        onAdd={() => addProduct(product)}
                      />
                    ))}
                  </div>
                </section>

                <section className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-[26px] border border-white/10 bg-white/[0.035] p-6">
                    <p className="text-xs uppercase tracking-[0.16em] text-violet-400">
                      Why this recommendation?
                    </p>

                    <h3 className="mt-2 text-xl font-semibold">
                      Decision trace
                    </h3>

                    <div className="mt-5 space-y-3">
                      <DecisionLine
                        label="Intent"
                        value={
                          activeIntent?.useCases.length
                            ? activeIntent.useCases.join(" + ")
                            : "General discovery"
                        }
                      />
                      <DecisionLine
                        label="Budget limit"
                        value={
                          activeIntent?.budget
                            ? `≤ ₹${activeIntent.budget.toLocaleString("en-IN")}`
                            : "No limit specified"
                        }
                      />
                      <DecisionLine
                        label="Tool executed"
                        value="catalog.search"
                      />
                      <DecisionLine
                        label="Top match score"
                        value={
                          searchMatches[0]
                            ? `${searchMatches[0].score} pts`
                            : "N/A"
                        }
                      />
                      <DecisionLine
                        label="Primary reason"
                        value={
                          searchMatches[0]?.reasons[0] ??
                          "Matches query intent"
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-violet-400/15 bg-violet-400/[0.045] p-6">
                    <p className="text-xs uppercase tracking-[0.16em] text-violet-300">
                      Contextual upsell
                    </p>

                    <h3 className="mt-2 text-xl font-semibold">
                      One useful addition. Not five random ones.
                    </h3>

                    <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">
                            {upsellProducts[0].name}
                          </p>

                          <p className="mt-1 text-sm text-zinc-400">
                            {formatCurrency(
                              upsellProducts[0].price
                            )}
                          </p>
                        </div>

                        <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] text-violet-300">
                          Relevant
                        </span>
                      </div>

                      <p className="mt-4 text-xs leading-5 text-zinc-500">
                        {upsellProducts[0].reason}
                      </p>

                      <button
                        onClick={addUpsell}
                        className="mt-4 w-full rounded-xl border border-white/10 py-2.5 text-sm transition hover:bg-white hover:text-black"
                      >
                        Add suggested accessory
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <EmptyAgentState />
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                    Cart
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Controlled checkout
                  </h2>
                </div>

                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400">
                  {cart.length} items
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-600">
                    Your agent has not added anything.
                    <br />
                    It cannot do so without you.
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3"
                    >
                      <div>
                        <p className="text-sm">{item.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatCurrency(item.price)}
                        </p>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-xs text-zinc-600 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="my-5 border-t border-white/10" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">
                  {orderApproved ? "Approved amount" : "Cart total"}
                </span>
                <span className="text-lg font-semibold">
                  {formatCurrency(cartTotal)}
                </span>
              </div>

              {orderApproved ? (
                <button
                  onClick={openRazorpayCheckout}
                  disabled={cart.length === 0}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 py-3 text-sm font-semibold text-black shadow-lg shadow-cyan-500/20 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Pay with Razorpay Test Mode →
                </button>
              ) : (
                <button
                  onClick={requestCheckout}
                  disabled={cart.length === 0}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Continue to approval gate
                </button>
              )}

              <p className="mt-3 text-center text-[11px] leading-5 text-zinc-600">
                PayPilot cannot execute a charge directly.
              </p>

              {orderApproved && (
                <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-300">
                  ✓ Customer authorization recorded for {formatCurrency(cartTotal)}.
                  <br />
                  No payment has been executed. Razorpay Test Mode is the next execution layer.
                </div>
              )}
            </section>

            <section className="panel policy-engine-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">FINANCIAL CONTROL</p>
                  <h2 className="text-xl font-semibold">Policy Engine</h2>
                  <p className="panel-subtitle">
                    Deterministic authorization boundary
                  </p>
                </div>

                <span className="policy-live">
                  <span className="policy-live-dot" />
                  LIVE
                </span>
              </div>

              <div className="policy-checks">
                <div className="policy-check">
                  <div className="policy-icon success">✓</div>

                  <div>
                    <strong>Single item limit</strong>
                    <span>₹60,000 maximum</span>
                  </div>
                </div>

                <div className="policy-check">
                  <div className="policy-icon success">✓</div>

                  <div>
                    <strong>Cart limit</strong>
                    <span>₹65,000 maximum</span>
                  </div>
                </div>

                <div className="policy-check">
                  <div
                    className={`policy-icon ${
                      policyDecision?.requiresApproval
                        ? "warning"
                        : "success"
                    }`}
                  >
                    {policyDecision?.requiresApproval ? "!" : "✓"}
                  </div>

                  <div>
                    <strong>Customer approval</strong>

                    <span>
                      {policyDecision?.requiresApproval
                        ? "Required before payment"
                        : "Received"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="policy-amount">
                <span>AUTHORIZED LIMIT</span>

                <strong>
                  {formatCurrency(
                    policyDecision?.maxAuthorizedAmount ?? 0
                  )}
                </strong>
              </div>

              <div className="policy-authority">
                <span>PAYMENT STATUS</span>

                <strong
                  className={
                    paymentStatus === "CAPTURED"
                      ? "payment-status-success text-emerald-400"
                      : paymentStatus === "FAILED"
                      ? "payment-status-failed text-red-400"
                      : paymentStatus === "PROCESSING"
                      ? "payment-status-processing text-amber-400"
                      : paymentStatus === "AUTHORIZED"
                      ? "payment-status-authorized text-cyan-400"
                      : ""
                  }
                >
                  {paymentStatus === "CAPTURED"
                    ? "✓ CAPTURED"
                    : paymentStatus === "FAILED"
                    ? "FAILED"
                    : paymentStatus === "PROCESSING"
                    ? "PROCESSING"
                    : paymentStatus === "AUTHORIZED"
                    ? "AUTHORIZED"
                    : orderApproved
                    ? "READY FOR PAYMENT"
                    : "NOT STARTED"}
                </strong>
              </div>

              <p className="policy-footer">
                The AI can recommend and prepare actions, but cannot
                execute a payment without explicit customer approval.
              </p>
            </section>
          </aside>
        </div>

        <section className="mt-8 rounded-[28px] border border-white/10 bg-[#0b0e16] p-6 md:p-8">
          <p className="eyebrow">AGENT OBSERVABILITY</p>

          <div className="flight-recorder-heading flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Agent Flight Recorder</h3>
              <p className="text-xs text-zinc-500">Live execution trace across agent decision loop and deterministic tools</p>
            </div>

            <span className="flight-live self-start sm:self-auto">
              <span className="flight-live-dot" />
              LIVE
            </span>
          </div>

          {/* Compact Summary Metrics Row */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-white/10 py-3 text-xs">
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 font-medium text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span>{auditEvents.length} EVENTS</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-3 py-1.5 font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{auditEvents.filter((e) => e.status === "success").length} PASSED</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-1.5 font-medium text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>{orderApproved ? "1 APPROVAL GATE" : "0 APPROVAL GATES"}</span>
            </div>

            <div className="ml-auto flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-cyan-300">
              <span>AUTHORIZED: {formatCurrency(orderApproved ? cartTotal : 0)}</span>
            </div>
          </div>

          {/* Compact 2-column Desktop Grid */}
          <div className="mt-5 grid gap-x-6 gap-y-3 md:grid-cols-2">
            {auditEvents.map((event) => (
              <div
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/10"
                key={event.id}
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-bold ${
                    event.status === "success"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                      : event.status === "warning"
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                      : "border-cyan-400/40 bg-cyan-400/10 text-cyan-400"
                  }`}
                >
                  {event.status === "success" ? "✓" : "•"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {event.step && (
                        <span className="font-mono text-[10px] font-bold text-zinc-500 uppercase">
                          STEP {event.step}
                        </span>
                      )}
                      <h4 className="text-xs font-semibold text-white truncate">
                        {event.label}
                      </h4>
                    </div>

                    {event.duration !== undefined && (
                      <span className="font-mono text-[10px] text-zinc-500 flex-none">
                        {event.duration} ms
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    {event.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {approvalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#10131c] p-6 shadow-2xl">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-xl">
              🔐
            </div>

            <p className="text-xs uppercase tracking-[0.16em] text-amber-300">
              Human approval gate
            </p>

            <h2 className="mt-2 text-2xl font-semibold">
              PayPilot is requesting permission to continue.
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The agent has prepared the checkout but cannot execute
              any financial action until you explicitly approve the
              amount.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">
                  Maximum authorized charge
                </span>
                <span className="font-semibold">
                  {formatCurrency(cartTotal)}
                </span>
              </div>

              <div className="mt-3 flex justify-between text-sm">
                <span className="text-zinc-500">
                  Autonomous amount changes
                </span>
                <span className="text-emerald-300">Blocked</span>
              </div>

              <div className="mt-3 flex justify-between text-sm">
                <span className="text-zinc-500">
                  Automatic payment retry
                </span>
                <span className="text-emerald-300">Blocked</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setApprovalOpen(false)}
                className="rounded-xl border border-white/10 py-3 text-sm text-zinc-300"
              >
                Cancel
              </button>

              <button
                onClick={approveCheckout}
                className="rounded-xl bg-white py-3 text-sm font-semibold text-black"
              >
                Approve {formatCurrency(cartTotal)}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProductCard({
  product,
  rank,
  added,
  onAdd,
}: {
  product: Product;
  rank: number;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <article className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:-translate-y-1 hover:border-cyan-400/30">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-zinc-600">#{rank}</span>

        <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[10px] text-cyan-300">
          {product.badge}
        </span>
      </div>

      <div className="mt-8">
        <p className="text-xs text-zinc-500">{product.brand}</p>
        <h3 className="mt-1 text-lg font-semibold">
          {product.name}
        </h3>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-xl font-semibold">
            {formatCurrency(product.price)}
          </span>
          <span className="pb-0.5 text-xs text-zinc-600 line-through">
            {formatCurrency(product.originalPrice)}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {product.specs.map((spec) => (
          <span
            key={spec}
            className="rounded-lg bg-white/[0.045] px-2 py-1 text-[10px] text-zinc-400"
          >
            {spec}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between text-xs">
        <span className="text-amber-300">
          ★ {product.rating}
        </span>
        <span className="text-zinc-600">
          {product.reviews.toLocaleString("en-IN")} reviews
        </span>
      </div>

      <button
        onClick={onAdd}
        disabled={added}
        className="mt-5 w-full rounded-xl border border-white/10 py-2.5 text-sm transition hover:bg-white hover:text-black disabled:bg-emerald-400/10 disabled:text-emerald-300"
      >
        {added ? "✓ Added with approval" : "Add to cart"}
      </button>
    </article>
  );
}

function StatusPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2">
      <span className="text-zinc-600">{label}</span>
      <span className="mx-2 text-zinc-700">•</span>
      <span className="text-emerald-300">{value}</span>
    </div>
  );
}

function ContractRow({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <span className="font-mono text-xs text-cyan-400">
        {number}
      </span>

      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {text}
        </p>
      </div>
    </div>
  );
}

function DecisionLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{value}</span>
    </div>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  const dotClass =
    event.status === "success"
      ? "bg-emerald-400"
      : event.status === "warning"
        ? "bg-amber-400"
        : "bg-cyan-400";

  return (
    <div className="grid grid-cols-[12px_1fr] gap-3">
      <div className="pt-1.5">
        <div className={`h-2 w-2 rounded-full ${dotClass}`} />
      </div>

      <div>
        <p className="text-xs font-medium text-zinc-300">
          {event.label}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-600">
          {event.detail}
        </p>
      </div>
    </div>
  );
}

function EmptyAgentState() {
  return (
    <section className="flex min-h-[420px] items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-white/[0.025] p-6 text-center">
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">
          ✦
        </div>

        <h2 className="mt-5 text-xl font-semibold">
          Your agent is waiting for intent.
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
          Describe what you need naturally. PayPilot will convert your
          intent into bounded commerce actions.
        </p>
      </div>
    </section>
  );
}
