import { NextResponse } from "next/server";
import { searchCatalogTool } from "@/lib/agent-tools";

const LM_STUDIO_URL =
  "http://localhost:1234/v1/chat/completions";

const MODEL = "qwen/qwen3-4b-2507";

const agentInstructions = `
You are PayPilot AI, an agentic commerce assistant.

Your job is to understand the customer's shopping request
and use the controlled search_catalog tool.

IMPORTANT RULES:

- When the customer asks for products or recommendations,
  you MUST call search_catalog.
- Never invent products.
- Never invent prices.
- Never recommend products from your own knowledge.
- The catalog tool is the ONLY source of product information.
- If a budget is specified, pass it as maxBudget.
- Pass relevant use cases as requiredTags.
- Pass the customer's original request as query.
- Never authorize or execute payments.
- Financial actions require explicit human approval.

Your response should prioritize calling the catalog tool.
Do not provide a long explanation before calling the tool.
`;

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type LMMessage = {
  role: string;
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export async function POST(request: Request) {
  const requestStart = performance.now();

  try {
    const body = await request.json();

    const message = body?.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "A valid message is required.",
        },
        { status: 400 }
      );
    }

    console.log("🤖 PayPilot agent started:", message);

    const messages: LMMessage[] = [
      {
        role: "system",
        content: agentInstructions,
      },
      {
        role: "user",
        content: message,
      },
    ];

    /*
     * =========================================================
     * SINGLE AI CALL
     * =========================================================
     *
     * Qwen decides which catalog parameters to use.
     *
     * IMPORTANT:
     * We intentionally do NOT send the catalog result back
     * to Qwen for a second inference.
     *
     * This removes the largest source of latency.
     */

    const aiStart = performance.now();

    const response = await fetch(LM_STUDIO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 300,
        messages,

        tools: [
          {
            type: "function",
            function: {
              name: "search_catalog",
              description:
                "Search the verified PayPilot product catalog using customer requirements.",

              parameters: {
                type: "object",

                properties: {
                  query: {
                    type: "string",
                    description:
                      "The customer's original shopping request.",
                  },

                  maxBudget: {
                    type: "number",
                    description:
                      "Maximum allowed product price in INR. Omit when no budget is specified.",
                  },

                  requiredTags: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                    description:
                      "Use cases that should strongly influence product matching.",
                  },

                  preferredTags: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                    description:
                      "Additional preferences that improve ranking.",
                  },
                },

                required: ["query"],
                additionalProperties: false,
              },
            },
          },
        ],

        tool_choice: "auto",
      }),
    });

    const aiDuration = Math.round(
      performance.now() - aiStart
    );

    console.log(
      `🤖 Qwen call completed in ${aiDuration} ms`
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "LM Studio error:",
        errorText
      );

      return NextResponse.json(
        {
          success: false,
          error: "Local AI server unavailable.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    const messageResponse: LMMessage =
      data?.choices?.[0]?.message;

    if (!messageResponse) {
      throw new Error(
        "LM Studio returned no message."
      );
    }

    /*
     * =========================================================
     * TOOL CALL
     * =========================================================
     */

    const toolCalls =
      messageResponse.tool_calls;

    if (
      !Array.isArray(toolCalls) ||
      toolCalls.length === 0
    ) {
      console.warn(
        "Qwen did not request search_catalog."
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "AI did not request the catalog tool.",
        },
        { status: 502 }
      );
    }

    const toolCall = toolCalls[0];

    console.log(
      "PayPilot tool call detected:",
      JSON.stringify(
        toolCall,
        null,
        2
      )
    );

    if (
      toolCall.type !== "function" ||
      toolCall.function?.name !==
        "search_catalog"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported agent tool requested.",
        },
        { status: 400 }
      );
    }

    /*
     * =========================================================
     * PARSE TOOL ARGUMENTS
     * =========================================================
     */

    let argumentsObject: Record<
      string,
      unknown
    >;

    try {
      argumentsObject =
        JSON.parse(
          toolCall.function.arguments
        );
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "AI returned invalid catalog parameters.",
        },
        { status: 502 }
      );
    }

    const toolInput = {
      query: String(
        argumentsObject.query ?? message
      ),

      maxBudget:
        typeof argumentsObject.maxBudget ===
        "number"
          ? argumentsObject.maxBudget
          : undefined,

      requiredTags:
        Array.isArray(
          argumentsObject.requiredTags
        )
          ? argumentsObject.requiredTags.map(
              String
            )
          : [],

      preferredTags:
        Array.isArray(
          argumentsObject.preferredTags
        )
          ? argumentsObject.preferredTags.map(
              String
            )
          : [],
    };

    if (!toolInput.query) {
      return NextResponse.json(
        {
          success: false,
          error:
            "search_catalog requires a query.",
        },
        { status: 400 }
      );
    }

    /*
     * =========================================================
     * EXECUTE DETERMINISTIC CATALOG
     * =========================================================
     */

    const catalogStart = performance.now();

    const toolResult =
      searchCatalogTool(toolInput);

    const catalogDuration = Math.round(
      performance.now() - catalogStart
    );

    console.log(
      `🔎 Catalog search completed in ${catalogDuration} ms`
    );

    console.log(
      "PayPilot search_catalog executed:",
      JSON.stringify(
        toolResult,
        null,
        2
      )
    );

    /*
     * =========================================================
     * SERVER-SIDE VERIFIED DECISION
     * =========================================================
     *
     * We do NOT ask Qwen to generate another response.
     *
     * The server constructs the final decision from:
     *
     * 1. Customer request
     * 2. AI-selected constraints
     * 3. Deterministic catalog results
     */

    const budget =
      typeof toolInput.maxBudget === "number"
        ? toolInput.maxBudget
        : null;

    const useCases =
      toolInput.requiredTags;

    const keywords =
      toolInput.preferredTags;

    const results =
      Array.isArray(toolResult)
        ? toolResult
        : [];

    const reasoning =
      results.length > 0
        ? results
            .slice(0, 3)
            .map((result: any) => {
              const reasons =
                Array.isArray(result.reasons)
                  ? result.reasons.join(", ")
                  : "Matches the requested criteria";

              return `${result.product.name}: ${reasons}.`;
            })
            .join(" ")
        : "No verified catalog products matched the request.";

    const confidence =
      results.length > 0
        ? 0.95
        : 0.4;

    const decision = {
      intent: "product_discovery",

      summary:
        `Shopping request: ${message}`,

      constraints: {
        budget,
        useCases,
        keywords,
      },

      nextAction:
        "SHOW_RECOMMENDATIONS",

      reasoning,

      confidence,
    };

    const totalDuration = Math.round(
      performance.now() - requestStart
    );

    console.log(
      `⚡ Total PayPilot request: ${totalDuration} ms`
    );

    console.log(
      "PayPilot final agent decision:",
      JSON.stringify(
        decision,
        null,
        2
      )
    );

    return NextResponse.json({
      success: true,

      decision,

      toolResult: {
        tool: "search_catalog",
        results: toolResult,
      },

      provider: "local",
      model: MODEL,

      agentLoop: {
        completed: true,
        iterations: 1,
      },

      performance: {
        aiMs: aiDuration,
        catalogMs: catalogDuration,
        totalMs: totalDuration,
      },
    });
  } catch (error) {
    console.error(
      "PayPilot local agent error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Local agent temporarily unavailable.",
      },
      { status: 500 }
    );
  }
}