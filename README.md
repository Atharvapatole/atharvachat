# ATHARVA CHAT — WhatsApp Business Messaging & AI Assistant Platform

A fully functional, enterprise-grade WhatsApp Business Cloud API messaging and autonomous AI representative platform built with **Next.js 15+ App Router**, **TypeScript**, **Tailwind CSS**, **Supabase PostgreSQL & Auth**, and **OpenRouter AI**.

---

## 🚀 Key Features

### 1. 3-Column WhatsApp Business Messaging Dashboard
- **Inbox & Search**: Real-time conversation tracking with unread badges and search by contact name or phone.
- **Interactive Chat Stream**: Inbound vs outbound bubbles with delivery status ticks (Sent `✓`, Delivered `✓✓`, Read `✓✓` blue, Failed `⚠️`).
- **Policy Enforcement**: Automatic enforcement of Meta's 24-hour customer window and opt-out suppression.
- **Human Takeover Banner**: Automatically pauses Atharva AI when a human manually replies, with a 1-click **Resume AI** action.
- **Contact Details & Memory**: View contact profile, toggle AI per contact, edit tags and notes, and view AI-learned memory summaries.

### 2. Autonomous Atharva AI Assistant
- **Multilingual Support**: Fluency in Hinglish, English, Hindi, and Marathi with casual, intelligent WhatsApp conversational tone.
- **Dynamic Free Model Discovery**: Discovers live `:free` models dynamically from OpenRouter's catalog API (`meta-llama/llama-3.3-70b-instruct:free`, `google/gemini-2.0-flash-exp:free`, `deepseek/deepseek-r1:free`, `qwen/qwen-2.5-72b-instruct:free`).
- **Zero Spend Guarantee**: Uses an automatic fallback sequence across verified free models, ensuring zero unexpected charges.
- **Live Playground**: Built-in test sandbox to converse with Atharva AI directly in the dashboard before going live.

### 3. WhatsApp Cloud API Connection & Meta Webhook
- **Direct Meta Integration**: Connect Phone Number ID, WABA ID, App Secret, and Permanent System User Access Token.
- **Cryptographic Security**: Stored WhatsApp credentials and tokens are encrypted at rest with **AES-256-GCM** (96-bit IVs and 128-bit authentication tags).
- **HMAC-SHA256 Signature Verification**: Incoming webhook requests are cryptographically validated against `X-Hub-Signature-256`.
- **Automatic Verify Token**: Generates and copies secure random verify tokens for Meta Webhook setup.

### 4. Audience & Contact Management
- Full CRUD contacts with tags, notes, and consent status (`opted_in` vs `opted_out`).
- Automatic contact and conversation creation upon incoming WhatsApp message.
- CSV import with phone number sanitization and validation.
- CSV export for CRM data portability.

### 5. Broadcast Campaigns & Meta Templates
- Send approved WhatsApp marketing, utility, and authentication templates outside the 24-hour service window.
- Personalize template variables (e.g., `{{name}}`).
- Built-in rate pacing and automated opt-out suppression.
- Delivery funnel analytics: Total Recipients, Sent, Delivered, Read, Failed, and Opted Out.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Lucide React, Framer Motion
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS)
- **Encryption**: Node.js `crypto` with `aes-256-gcm`
- **AI Engine**: OpenRouter API with dynamic model discovery
- **WhatsApp**: Meta WhatsApp Cloud API (Graph API v21.0)
- **Deployment**: Vercel

---

## 📦 Getting Started

### 1. Clone & Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in the required variables:
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_APP_URL=https://your-deployed-app.vercel.app

SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
CREDENTIAL_ENCRYPTION_KEY=64_character_hex_string
OPENROUTER_API_KEY=sk-or-v1-...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_secure_verify_token
```

> **Generating a CREDENTIAL_ENCRYPTION_KEY**:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 3. Execute Database Migrations
Execute the SQL migration in your Supabase SQL Editor:
- File path: `supabase/migrations/20261107_initial_schema.sql`

This script sets up:
- Tables: `profiles`, `whatsapp_accounts`, `contacts`, `conversations`, `messages`, `message_templates`, `campaigns`, `campaign_recipients`, `ai_settings`, `ai_conversation_memory`, `webhook_events`, `audit_logs`.
- Complete Row Level Security (RLS) policies for user data isolation.
- Automatic `updated_at` triggers and performance indexes.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to launch the app.

---

## 🌐 Meta WhatsApp Cloud API Setup

1. Go to the [Meta for Developers Portal](https://developers.facebook.com/).
2. Create or select your Business App with the **WhatsApp** product.
3. In **WhatsApp** > **API Setup**:
   - Copy your **Phone Number ID**.
   - Copy your **WhatsApp Business Account ID (WABA ID)**.
4. In **Business Settings** > **System Users**:
   - Create a System User with Admin privileges.
   - Generate a **Permanent Access Token** with permissions `whatsapp_business_messaging` and `whatsapp_business_management`.
5. In **App Settings** > **Basic**:
   - Copy your **App Secret**.
6. Enter these credentials on the **/connection** page of Atharva Chat and click **Encrypt & Save Credentials**.
7. In the Meta portal, go to **WhatsApp** > **Configuration** > **Webhook**:
   - **Callback URL**: `https://your-domain.vercel.app/api/webhooks/whatsapp`
   - **Verify Token**: Paste the token generated on the **/connection** page.
   - Under **Webhook fields**, click **Manage** and subscribe to **`messages`**.

---

## 🔒 Security Best Practices

- **Zero Plaintext Credentials**: Meta App Secret and System User Access Tokens are encrypted with AES-256-GCM before entering Supabase.
- **HMAC Signature Check**: Webhooks verify the SHA-256 HMAC payload signature using the App Secret.
- **Tenant Isolation**: Supabase RLS enforces that users can only view and manage their own data.
- **Zero Spend AI Guarantee**: Atharva AI exclusively routes through OpenRouter models verified as `:free`.

---

## 🚢 Deployment to Vercel

1. Push your repository to GitHub.
2. Import the project in Vercel.
3. Add the environment variables from `.env.example`.
4. Deploy!
