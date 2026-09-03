import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type VerifyRequest = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export async function POST(request: Request) {
  try {
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

    const body = (await request.json()) as VerifyRequest;

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = body;

    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Razorpay payment verification fields.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 1. Generate expected Razorpay signature
    // --------------------------------------------------

    const generatedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    // --------------------------------------------------
    // 2. Compare signatures
    // --------------------------------------------------

    const signatureMatches =
      generatedSignature === razorpay_signature;

    if (!signatureMatches) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: "Payment signature verification failed.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 3. Fetch payment from Razorpay
    // --------------------------------------------------

    const payment =
      await razorpay.payments.fetch(
        razorpay_payment_id
      );

    // --------------------------------------------------
    // 4. Verify payment belongs to this order
    // --------------------------------------------------

    if (
      payment.order_id !==
      razorpay_order_id
    ) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error:
            "Payment does not belong to the expected order.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. Verify payment status
    // --------------------------------------------------

    if (payment.status !== "captured") {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          paymentStatus: payment.status,
          error:
            "Payment is not captured yet.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Payment verified
    // --------------------------------------------------

    return NextResponse.json({
      success: true,
      verified: true,
      payment: {
        id: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      },
    });
  } catch (error) {
    console.error(
      "Razorpay payment verification failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        verified: false,
        error:
          "Unable to verify Razorpay payment.",
      },
      { status: 500 }
    );
  }
}
