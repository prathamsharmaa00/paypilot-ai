# PayPilot AI — Agentic Commerce Control Room

> An explainable, bounded and human-gated AI commerce assistant for product discovery, contextual upselling and controlled checkout.

## 🚀 Overview

PayPilot AI is an agentic commerce prototype designed around a simple principle:

**Don't search products. Delegate the decision.**

A customer describes what they need in natural language. A local AI agent interprets the request and produces a structured shopping decision. A deterministic catalog verifies product and price constraints. A policy engine enforces financial boundaries. Before any payment action, the customer must explicitly authorize the purchase.

Only after approval does the server create a Razorpay Test Mode order. After checkout, the payment is verified server-side using Razorpay signature and payment-status checks.

The AI can recommend and reason.

**It cannot directly execute financial actions.**

---

## 🎯 Problem

Traditional commerce search requires customers to manually:

- Understand product specifications
- Compare multiple products
- Decide which product best matches their requirements
- Evaluate relevant add-ons
- Navigate checkout

An AI commerce agent can reduce this friction, but autonomous financial actions introduce a critical safety problem:

> **How do we allow AI to make useful commerce decisions without allowing the model to directly control money?**

PayPilot AI addresses this through explicit separation between:

1. AI reasoning
2. Deterministic business logic
3. Financial policy
4. Human authorization
5. Payment execution
6. Payment verification

---

## 💡 Solution

PayPilot AI uses a controlled agentic workflow:

```text
Customer Request
      ↓
Local AI Intent + Decision
      ↓
Deterministic Product Catalog
      ↓
Recommendation
      ↓
Contextual Upsell
      ↓
Policy Engine
      ↓
Human Authorization
      ↓
Server-side Razorpay Order
      ↓
Razorpay Test Checkout
      ↓
Server-side Payment Verification
      ↓
Agent Flight Recorder
```

---

## 🤖 AI Architecture

The project uses a local Qwen model through LM Studio.

### Model
`qwen/qwen3-4b-2507`

The model is responsible for:

- Understanding natural-language shopping requests
- Extracting budget constraints
- Identifying use cases
- Producing structured shopping decisions
- Explaining recommendations
- Selecting the next agent action

The model does not directly control:

- Product prices
- Cart totals
- Policy limits
- Payment amounts
- Razorpay credentials
- Payment execution

This separation intentionally limits the financial authority of the AI.

---

## 🧠 Deterministic Catalog

The product catalog remains deterministic.

The catalog engine:

- Looks up trusted product definitions
- Applies budget constraints
- Matches use-case tags
- Scores product relevance
- Produces explainable recommendation reasons

The server does not trust client-provided product prices.

Before creating a Razorpay order, cart items are reconstructed from the trusted server-side catalog.

---

## 🔐 Policy Engine

PayPilot AI uses explicit financial boundaries.

### Current limits
| Policy | Limit |
|---|---|
| Maximum single item | ₹60,000 |
| Maximum cart value | ₹65,000 |
| Customer approval | Required |

The policy engine can:

- Allow an approved cart
- Require customer approval
- Reject an oversized cart
- Reject an oversized item
- Prevent payment execution when authorization is missing

### Core principle
```text
AI Recommendation
       ↓
Policy Engine
       ↓
Human Approval
       ↓
Payment
```

The LLM never directly authorizes or executes a payment.

---

## 💳 Razorpay Integration

PayPilot AI integrates Razorpay in Test Mode.

### Order creation

Razorpay orders are created server-side through:

`POST /api/payment/create-order`

The server:

- Rebuilds the cart from the trusted catalog
- Re-evaluates the financial policy
- Requires explicit customer approval
- Converts INR to paise
- Creates the Razorpay Test Mode order
- Returns only safe client-side information

The Razorpay Key Secret remains server-side.

### Checkout

After the customer has authorized the purchase, the application opens Razorpay Test Mode Checkout using the server-created `order_id`.

---

## ✅ Payment Verification

Payment success is not trusted solely from the browser callback.

The application sends the Razorpay payment response to:

`POST /api/payment/verify`

The server verifies:

- Razorpay signature
- Payment-to-order relationship
- Payment capture status

Only after these checks succeed is the payment treated as verified.

---

## 🛡️ Failure Recovery

The system was deliberately tested against invalid execution attempts.

### Test 1 — Payment without approval

Input:
`customerApproved = false`

Result:
`HTTP 403 Forbidden`

No Razorpay order is created.

### Test 2 — Unknown product

Input:
`fake-product-999`

Result:
`HTTP 400 Bad Request`

The server rejects the product because it is not present in the trusted catalog.

### Test 3 — Payment verification

A successful Razorpay Test Mode payment was verified server-side.

Result:
`Payment verified`
`Execution completed`

### Security principle
```text
Invalid request
      ↓
Server validation
      ↓
Reject
      ↓
No financial execution
```

---

## 🧾 Agent Flight Recorder

Every important agent action is recorded in the Flight Recorder.

Example execution trace:

```text
Session initialized
User request received
Local AI decision
Constraints extracted
Catalog tool executed
Catalog results verified
Financial boundary enforced
Recommendation generated
Policy engine evaluated
Policy approval required
Cart updated
Customer authorization received
Execution bounded
Razorpay order created
Payment submitted
Payment verified
Execution completed
```

The Flight Recorder makes the agent's decisions and financial boundaries observable.

---

## 📊 Example

### Customer request

> "I need a laptop under ₹60000 for coding and gaming."

### Agent decision

The agent identifies:

- **Budget**: ₹60,000
- **Use cases**: coding, gaming
- **Recommendation**: Nova X16 (₹57,990)
- **Policy**: Single item limit ₹60,000; Cart limit ₹65,000; Customer approval Required
- **Payment**: Razorpay Test Mode (₹57,990)
- **Verification**: Signature Verified; Order Matched; Payment status Captured
- **Result**: `VERIFIED`

---

## 🏗️ Architecture

High-level architecture:

```text
Customer
   ↓
PayPilot AI / Local Qwen
   ↓
Deterministic Catalog
   ↓
Policy Engine
   ↓
Human Approval Gate
   ↓
Server-side Payment API
   ↓
Razorpay Test Mode
   ↓
Payment Verification
   ↓
Flight Recorder
```

### Financial boundary
```text
LLM
 ↓
Recommendation only

Policy Engine
 ↓
Financial constraint

Human
 ↓
Explicit authorization

Server
 ↓
Razorpay execution

Verification API
 ↓
Payment confirmation
```

---

## 🧰 Tech Stack

- **Next.js**
- **React**
- **TypeScript**
- **Tailwind CSS**
- **LM Studio**
- **Qwen**
- **Razorpay Test Mode**
- **Razorpay Node SDK**

---

## 📁 Project Structure

```text
paypilot-ai/
├── app/
│   ├── api/
│   │   ├── agent/
│   │   └── payment/
│   │       ├── create-order/
│   │       └── verify/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   └── commerce/
│       └── AgentWorkbench.tsx
│
├── data/
│   └── products.ts
│
├── lib/
│   ├── catalog.ts
│   ├── intent.ts
│   └── policy.ts
│
├── docs/
│   └── architecture-diagram.png
│
├── .env.local
├── .gitignore
├── package.json
└── README.md
```

---

## ⚙️ Local Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` and add:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET
```

*Never commit `.env.local`.*

### 3. Start LM Studio

Load `qwen/qwen3-4b-2507` and start the local server on `http://localhost:1234`.

### 4. Start PayPilot
```bash
npm run dev
```

Open `http://localhost:3000`.

---

## 🧪 Verification

Run TypeScript checks:
```bash
npx tsc --noEmit
```

Run the production build:
```bash
npm run build
```

Both currently pass successfully.

---

## 🔬 Tested Failure Cases

| Scenario | Expected | Result |
|---|---|---|
| Approved payment | Create order | ✅ Passed |
| Missing customer approval | Reject | ✅ 403 |
| Unknown product | Reject | ✅ 400 |
| Valid Razorpay payment | Verify | ✅ Passed |
| Signature verification | Verify server-side | ✅ Passed |

---

## 🔑 Security Decisions

1. **No autonomous financial execution**: The AI cannot directly execute payments.
2. **Human authorization**: A customer must explicitly approve the payment.
3. **Server-side price validation**: The server reconstructs product prices from the trusted catalog.
4. **Server-side policy enforcement**: Financial limits are re-evaluated before creating a Razorpay order.
5. **Secret isolation**: `RAZORPAY_KEY_SECRET` is never exposed to client-side code.
6. **Server-side payment verification**: Payment success is verified independently of the browser callback.
7. **No autonomous retries**: PayPilot does not automatically retry financial actions.

---

## 🎥 Demo

The demonstration covers:

- Natural-language product request
- AI decision
- Product recommendation
- Policy evaluation
- Human authorization
- Razorpay Test Mode checkout
- Server-side payment verification
- Flight Recorder
- Failure recovery
