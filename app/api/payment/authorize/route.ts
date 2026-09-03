import { NextResponse } from "next/server";
import crypto from "crypto";

import { products } from "@/data/products";
import { evaluateCartPolicy } from "@/lib/policy";

type RequestBody = {
  cart: {
    id: string;
  }[];
};

function createApprovalToken(payload: {
  cartHash: string;
  amount: number;
  expiresAt: number;
}) {
  const secret =
    process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    throw new Error(
      "Server secret is not configured."
    );
  }

  const encodedPayload = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function createCartHash(
  cart: {
    id: string;
  }[]
) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        cart
          .map((item) => item.id)
          .sort()
      )
    )
    .digest("hex");
}

export async function POST(
  request: Request
) {
  try {
    if (
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Server authorization configuration is missing.",
        },
        { status: 500 }
      );
    }

    const body =
      (await request.json()) as RequestBody;

    if (
      !body.cart ||
      !Array.isArray(body.cart) ||
      body.cart.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Cart is empty.",
        },
        { status: 400 }
      );
    }

    /*
     * Rebuild the cart from the trusted catalog.
     */
    const trustedCart = [];

    for (const item of body.cart) {
      const product = products.find(
        (product) =>
          product.id === item.id
      );

      if (!product) {
        return NextResponse.json(
          {
            success: false,
            error:
              `Unknown product: ${item.id}`,
          },
          { status: 400 }
        );
      }

      trustedCart.push({
        id: product.id,
        name: product.name,
        price: product.price,
      });
    }

    /*
     * Policy is evaluated by the server.
     */
    const policy =
      evaluateCartPolicy({
        cart: trustedCart,
        customerApproved: true,
      });

    if (
      !policy.allowed ||
      policy.requiresApproval
    ) {
      return NextResponse.json(
        {
          success: false,
          error: policy.reason,
          policy,
        },
        { status: 403 }
      );
    }

    /*
     * Short-lived authorization.
     *
     * No database required.
     */
    const expiresAt =
      Date.now() + 5 * 60 * 1000;

    const cartHash =
      createCartHash(body.cart);

    const token =
      createApprovalToken({
        cartHash,
        amount:
          policy.maxAuthorizedAmount,
        expiresAt,
      });

    return NextResponse.json({
      success: true,

      authorization: {
        token,
        amount:
          policy.maxAuthorizedAmount,
        expiresAt,
      },
    });
  } catch (error) {
    console.error(
      "Payment authorization failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to authorize payment.",
      },
      { status: 500 }
    );
  }
}
