# pet-send-invoice

Sends one Trimora Pet invoice to the customer by **email** (Resend) or **WhatsApp** (Meta WhatsApp Cloud API).
Called from Invoices & Payments > Email / WhatsApp, after staff confirm the recipient.

Needs migration `112_pet_invoice_messages.sql` applied first (send log and limits).

## Secrets (Supabase > Edge Functions > Secrets; Trimora's own, shared by all businesses)

| Secret | Needed for | Notes |
|---|---|---|
| `RESEND_API_KEY` | email | Resend API key |
| `RESEND_FROM` | email | e.g. `invoices@yourdomain`; the domain must be verified in Resend |
| `WHATSAPP_TOKEN` | WhatsApp | permanent token for a WhatsApp Business app |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | the sending number's ID |
| `WHATSAPP_INVOICE_TEMPLATE` | WhatsApp (recommended) | name of an approved message template; without it only free text is sent, which WhatsApp delivers only within 24 hours of the customer's last message |
| `WHATSAPP_TEMPLATE_LANG` | WhatsApp | default `en` |

A channel whose secrets are missing answers `503 NOT_CONFIGURED`; the app then offers to open the message in the
staff member's own app. Nothing is logged for that.

## WhatsApp template

Category: Utility. Body, with five text parameters in this order:

    Hello {{1}}, your invoice {{2}} from {{3}} is ready. Total: {{4}}. Balance due: {{5}}.

WhatsApp templates cannot carry the itemised list or a file, so WhatsApp gets this summary; **email carries the full
itemised invoice**. Attaching a PDF is not done.

## Limits and safety

* Caller must be an authenticated device of the requested business (same check as `mpesa-stk-push`); suspended
  businesses are refused.
* Message text and amounts are built on the server from the saved invoice; void invoices are refused.
* 100 attempts per business per hour, 10 per invoice per day (counted from `pet_invoice_messages`).
* "sent" = the provider accepted it. No delivered/read tracking.

## Deploy

`supabase functions deploy pet-send-invoice` (default JWT verification on). Not deployed by the PR.
