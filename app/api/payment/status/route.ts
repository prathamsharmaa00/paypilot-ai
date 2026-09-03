import {
  NextRequest,
  NextResponse,
} from "next/server";

import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id:
    process.env.RAZORPAY_KEY_ID!,
  key_secret:
    process.env.RAZORPAY_KEY_SECRET!,
});

export async function GET(
  request: NextRequest
) {
  try {
    const orderId =
      request.nextUrl.searchParams.get(
        "orderId"
      );

    if (!orderId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Razorpay order ID is required.",
        },
        { status: 400 }
      );
    }

    const order =
      await razorpay.orders.fetch(
        orderId
      );

    const payments =
      await razorpay.orders.fetchPayments(
        orderId
      );

    const paymentItems =
      payments?.items ?? [];

    /*
     * Prefer captured payment.
     */
    const capturedPayment =
      paymentItems.find(
        (payment: any) =>
          payment.status ===
          "captured"
      );

    const latestPayment =
      paymentItems.length > 0
        ? paymentItems[
            paymentItems.length - 1
          ]
        : null;

    const payment =
      capturedPayment ??
      latestPayment;

    let status:
      | "AUTHORIZED"
      | "PROCESSING"
      | "CAPTURED"
      | "FAILED"
      | "AWAITING_PAYMENT"
      | "UNKNOWN";

    if (
      payment?.status === "captured" ||
      order.status === "paid"
    ) {
      status = "CAPTURED";
    } else if (
      payment?.status ===
      "authorized"
    ) {
      status = "AUTHORIZED";
    } else if (
      payment?.status === "failed"
    ) {
      status = "FAILED";
    } else if (
      order.status === "attempted"
    ) {
      status = "PROCESSING";
    } else if (
      order.status === "created"
    ) {
      status =
        "AWAITING_PAYMENT";
    } else {
      status = "UNKNOWN";
    }

    return NextResponse.json({
      success: true,

      transaction: {
        orderId: order.id,

        receipt:
          order.receipt,

        amount:
          order.amount,

        amountPaid:
          order.amount_paid,

        amountDue:
          order.amount_due,

        currency:
          order.currency,

        status,

        razorpayOrderStatus:
          order.status,

        attempts:
          order.attempts,

        payment: payment
          ? {
              id: payment.id,
              status:
                payment.status,
              amount:
                payment.amount,
              currency:
                payment.currency,
              method:
                payment.method,
            }
          : null,

        reference: {
          orderId: order.id,
          paymentId:
            payment?.id ?? null,
        },
      },
    });
  } catch (error) {
    console.error(
      "Payment status lookup failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to retrieve payment status.",
      },
      { status: 500 }
    );
  }
}
