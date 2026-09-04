# PayPilot AI — Agentic Commerce Control Room

> An explainable, bounded and human-gated AI commerce assistant for product discovery, contextual upselling and controlled checkout.

## 🚀 Overview

PayPilot AI is an agentic commerce prototype designed around a simple principle:

**Don't search products. Delegate the decision.**

A customer describes what they need in natural language. PayPilot uses a two-stage response strategy: deterministic intent parsing and catalog search render relevant products instantly, while a local AI agent runs concurrently to select tool parameters, extract constraints, and enrich the decision. A policy engine enforces financial boundaries, requiring explicit customer authorization before any payment action.

Only after approval does the server create a Razorpay Test Mode order. After checkout, the payment is verified server-side using Razorpay signature, payment-to-order matching, and payment-status checks.

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
Deterministic Intent + Catalog (Fast Path)
       ↓
Local AI Intent & Tool Selection (Enrichment)
       ↓
Recommendation & Contextual Upsell
       ↓
Policy Engine Evaluation
       ↓
Human Approval Gate
       ↓
Server-side Razorpay Order Creation
       ↓
Razorpay Test Checkout
       ↓
Server-side Payment Verification
       ↓
Agent Flight Recorder
```

---

## 🤖 AI Architecture

PayPilot AI uses a local Qwen model through LM Studio.

### Model

`qwen/qwen3-4b-2507`

The model is used as a constrained decision layer.

Qwen is responsible for:

- Understanding the customer's natural-language request
- Selecting relevant catalog search parameters
- Identifying budget and use-case constraints
- Selecting the controlled `search_catalog` tool

The deterministic application layer remains responsible for:

- Product data
- Product prices
- Catalog ranking
- Financial limits
- Cart totals
- Payment amounts
- Final verified decision construction
- Razorpay execution

The application intentionally does not ask the model to generate a second response after catalog execution. This avoids unnecessary inference latency and keeps the final commerce decision grounded in deterministic tool results.

### AI safety boundary

```text
Customer Request
       ↓
Local Qwen
       ↓
Tool Parameters
       ↓
Deterministic Catalog
       ↓
Server-constructed Decision
       ↓
Policy Engine
       ↓
Human Approval
       ↓
Payment
```

The LLM never directly controls product prices, cart totals, payment amounts, Razorpay credentials or financial execution.

### ⚡ Latency-aware execution

PayPilot uses a two-stage response strategy.

The deterministic path runs immediately so customers do not have to wait for the local model before seeing useful results.

```text
Customer Request
       │
       ├──────────────→ Deterministic Intent
       │                         ↓
       │                   Catalog Search
       │                         ↓
       │                  Immediate UI
       │
       └──────────────→ Local Qwen
                                 ↓
                          Tool Selection
                                 ↓
                         Decision Validation
```

This design prevents local model latency from blocking the primary shopping experience.

The local model is used to enrich and validate the commerce decision rather than becoming a mandatory bottleneck for initial product rendering.

---

## 🔄 AI Failure Fallback

PayPilot does not make the local LLM a single point of failure for product discovery.

If the local Qwen model becomes unavailable:

```text
Customer Request
       ↓
Deterministic Intent Parser
       ↓
Deterministic Catalog
       ↓
Recommendations remain available
       │
       └── Local AI failure recorded in Flight Recorder
```

This allows the core commerce experience to remain usable while clearly surfacing that the AI enrichment layer is unavailable.

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

The UI requires the application approval state to pass the server-side policy check before creating the Razorpay order.

The server:

- Rebuilds the cart from the trusted catalog
- Re-evaluates the financial policy
- Validates the server authorization state
- Converts INR to paise
- Creates the Razorpay Test Mode order
- Returns only safe client-side information

The Razorpay Key Secret remains server-side.

### Checkout

After the customer has authorized the purchase, the application opens Razorpay Test Mode Checkout using the server-created `order_id`.

### API boundaries

| Endpoint | Responsibility |
|---|---|
| `POST /api/agent` | Runs constrained local AI tool selection |
| `POST /api/payment/create-order` | Validates cart, policy and creates Razorpay order |
| `POST /api/payment/verify` | Verifies payment signature, order relationship and capture status |

---

## ✅ Payment Verification

Payment success is never trusted solely from the browser callback.

The application sends the Razorpay payment response to:

`POST /api/payment/verify`

The server independently verifies:

1. Razorpay payment signature
2. Payment-to-order relationship
3. Payment capture status

Only when all checks succeed does PayPilot mark the transaction as verified.

The browser is therefore treated as an input source, not the source of truth for payment confirmation.

---

## 🛡️ Failure Handling & Recovery Boundaries

The system was deliberately tested against invalid execution attempts and payment verification failures.

### Test 1 — Payment without approval

Input: `customerApproved = false`

Result: `HTTP 403 Forbidden`

No Razorpay order is created.

### Test 2 — Unknown product

Input: `fake-product-999`

Result: `HTTP 400 Bad Request`

The server rejects the product because it is not present in the trusted catalog.

### Test 3 — Payment verification

A successful Razorpay Test Mode payment was verified server-side.

Result:

`Payment verified`

`Execution completed`

### Failure-handling principle

```text
Invalid request
      ↓
Server validation
      ↓
Reject
      ↓
No financial execution
```

PayPilot does not automatically retry financial actions after an uncertain payment state.

---

## 🧾 Agent Flight Recorder

Every important agent action is recorded in the Flight Recorder.

Example execution trace:

```text
Session initialized
User request received
Fast catalog path (1 ms)
Recommendations rendered (3 ms)
Local AI decision (18343 ms)
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

The Flight Recorder also captures execution timing for important operations, making model latency and deterministic tool latency observable.

Example:

```text
Local AI decision        18343 ms
Catalog search               1 ms
```

This makes the performance difference between probabilistic AI inference and deterministic business logic visible during evaluation.

---

## 📊 Example

### Customer request

> "I need a laptop under ₹60,000 for coding and gaming."

### Agent decision

The system identifies:

- **Budget**: ₹60,000
- **Use cases**: coding, gaming
- **Top recommendation**: Nova X16 — ₹57,990
- **Catalog**: Deterministic and server-owned
- **Policy**: ₹60,000 single-item limit; ₹65,000 cart limit
- **Customer approval**: Required
- **Payment**: Razorpay Test Mode
- **Verification**: Signature verified; payment matched to order; payment captured
- **Result**: `VERIFIED`

---

## 🏗️ Architecture

### High-level architecture

```text
                         CUSTOMER
                            │
                            ▼
                    PayPilot Workbench
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
      Deterministic Fast Path       Local Qwen
                │                       │
        Intent + Catalog          Tool Selection
                │                       │
                └───────────┬───────────┘
                            ▼
                  Verified Recommendations
                            │
                            ▼
                     Policy Engine
                            │
                            ▼
                  Human Approval Gate
                            │
                            ▼
                Server-side Order Creation
                            │
                            ▼
                   Razorpay Test Mode
                            │
                            ▼
               Server-side Verification
                            │
                            ▼
                  Agent Flight Recorder
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
├── .env.example
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

Copy `.env.example` to `.env.local` and add your credentials:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=your_test_secret_here
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

1. **No autonomous financial execution**  
   The AI cannot directly execute payments.

2. **Explicit customer approval**  
   The customer must explicitly approve the cart before entering the payment flow.

3. **Server-side price validation**  
   Product prices are reconstructed from the trusted server-side catalog.

4. **Server-side policy enforcement**  
   Financial limits are independently re-evaluated before a Razorpay order is created.

5. **Secret isolation**  
   `RAZORPAY_KEY_SECRET` is never exposed to client-side code.

6. **Server-side payment verification**  
   Payment success is independently verified using the Razorpay signature, order relationship and captured payment status.

7. **No autonomous retries**  
   PayPilot does not automatically retry financial actions.

8. **Deterministic financial boundary**  
   The LLM does not determine the final payment amount. The server derives the amount from trusted catalog data and policy rules.

9. **AI fallback behavior**  
   If the local AI is unavailable, deterministic catalog recommendations remain available rather than blocking the entire shopping experience.

---

## 🎥 Demo

The demonstration covers:

- Natural-language product request
- AI decision
- Product recommendation
- Policy evaluation
- Human authorization
- Razorpay Test Mode checkout
- Invalid payment execution handling
- Server-side payment verification
- Flight Recorder execution trace
