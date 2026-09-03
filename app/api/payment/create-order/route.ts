import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";

import { products } from "@/data/products";
import { evaluateCartPolicy } from "@/lib/policy";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type RequestBody = {
  cart: {
    id: string;
  }[];
  approvalToken: string;
};

function verifyApprovalToken(
  token: string,
  cart: { id: string }[],
  expectedAmount: number
) {
  const secret =
    process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [
    encodedPayload,
    receivedSignature,
  ] = parts;

  const expectedSignature =
    crypto
      .createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

  if (
    receivedSignature.length !==
    expectedSignature.length
  ) {
    return false;
  }

  const signaturesMatch =
    crypto.timingSafeEqual(
      Buffer.from(
        receivedSignature
      ),
      Buffer.from(
        expectedSignature
      )
    );

  if (!signaturesMatch) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url"
      ).toString("utf8")
    );

    const cartHash =
      crypto
        .createHash("sha256")
        .update(
          JSON.stringify(
            cart
              .map((item) => item.id)
              .sort()
          )
        )
        .digest("hex");

    if (payload.cartHash !== cartHash) {
      return false;
    }

    if (
      payload.amount !== expectedAmount
    ) {
      return false;
    }

    if (
      typeof payload.expiresAt !==
        "number" ||
      Date.now() > payload.expiresAt
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // --------------------------------------------------
    // 1. Validate environment configuration
    // --------------------------------------------------

    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay server configuration is missing.",
        },
        { status: 500 }
      );
    }

    // --------------------------------------------------
    // 2. Read request
    // --------------------------------------------------

    const body = (await request.json()) as RequestBody;

    if (!body.cart || !Array.isArray(body.cart)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid cart.",
        },
        { status: 400 }
      );
    }

    if (!body.approvalToken || typeof body.approvalToken !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Customer authorization token is required.",
        },
        { status: 403 }
      );
    }

    // --------------------------------------------------
    // 3. Rebuild cart from trusted server-side catalog
    // --------------------------------------------------

    const trustedCart = [];

    for (const item of body.cart) {
      const product = products.find(
        (product) => product.id === item.id
      );

      if (!product) {
        return NextResponse.json(
          {
            success: false,
            error: `Unknown product: ${item.id}`,
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

    // --------------------------------------------------
    // 4. Run PayPilot policy AGAIN on the server
    // --------------------------------------------------

    const policy = evaluateCartPolicy({
      cart: trustedCart,
      customerApproved: true,
    });

    if (!policy.allowed || policy.requiresApproval) {
      return NextResponse.json(
        {
          success: false,
          error: policy.reason,
          policy,
        },
        { status: 403 }
      );
    }

    // --------------------------------------------------
    // 5. Convert INR → paise & Verify approval token
    // --------------------------------------------------

    const amountInRupees = policy.maxAuthorizedAmount;

    const approvalValid = verifyApprovalToken(
      body.approvalToken,
      body.cart,
      amountInRupees
    );

    if (!approvalValid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Customer authorization is missing, expired, or does not match this cart.",
        },
        { status: 403 }
      );
    }

    const amountInPaise = Math.round(amountInRupees * 100);

    // --------------------------------------------------
    // 6. Create a unique internal receipt
    // --------------------------------------------------

    const receipt = `paypilot_${Date.now()}`;

    // --------------------------------------------------
    // 7. Create Razorpay Test Mode Order
    // --------------------------------------------------

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        source: "PayPilot AI",
        policy: "approved",
      },
    });

    // --------------------------------------------------
    // 8. Return ONLY safe information to the browser
    // --------------------------------------------------

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      keyId: process.env.RAZORPAY_KEY_ID,
      policy: {
        authorizedAmount: amountInRupees,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to create Razorpay order.",
      },
      { status: 500 }
    );
  }
}
