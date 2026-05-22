// supabase/functions/stripe-webhook/index.ts
//
// Stripe webhook handler for denai.
// Runs on Supabase Edge Functions (Deno runtime).
//
// SECURITY:  Every request is signature-verified before any processing.
//            Unsigned or tampered payloads are rejected with 400.
//            Stripe does NOT retry 4xx responses.
//
// IDEMPOTENCY: Subscription events use upsert_clinic_subscription() — a
//              PostgreSQL RPC that applies the upsert only when the incoming
//              event timestamp is strictly newer than what is stored.
//              Replayed or out-of-order events are silent no-ops.
//
// RETRY SAFETY: Returns 500 for transient DB errors (Stripe retries on 5xx).
//               Returns 200 for permanent errors (no retry — log for review).
//               Unknown event types are fast-acked with 200.
//
// CLINIC MAPPING: Requires subscription.metadata.clinic_id to be set by the
//                 checkout Edge Function at subscription creation time.
//                 Events without this metadata are logged and permanently skipped.
//
// REQUIRED ENVIRONMENT VARIABLES (set as Edge Function secrets):
//   STRIPE_SECRET_KEY      — Stripe secret key (sk_live_xxx or sk_test_xxx)
//   STRIPE_WEBHOOK_SECRET  — Webhook signing secret from Stripe dashboard (whsec_xxx)
//   SUPABASE_URL           — Auto-injected by Supabase Edge Functions runtime
//   SUPABASE_SERVICE_ROLE_KEY — Must be set as a secret; bypasses RLS for billing writes

import Stripe from 'npm:stripe@14'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Subscription lifecycle events — authoritative source of truth for status.
// All handled via upsert_clinic_subscription() RPC (atomic, out-of-order safe).
const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

// Invoice events — supplementary signals for payment state and period end.
// Status management remains authoritative in subscription events above.
const INVOICE_EVENTS = new Set([
  'invoice.payment_succeeded',
  'invoice.payment_failed',
])

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const rawBody = await req.text()

  // ── Signature Verification ────────────────────────────────────────────────
  // Reject any request that is not signed by Stripe's webhook secret.
  // This is the first and hardest trust boundary — never skip it.
  // 400 response: Stripe will NOT retry; the event is permanently discarded.
  let event: Stripe.Event
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    )
  } catch (err) {
    console.error('stripe-webhook: signature verification failed:', (err as Error).message)
    return new Response('Signature verification failed', { status: 400 })
  }

  // Fast-ack: return 200 immediately for events we don't handle.
  // Stripe retries on non-2xx; returning 200 prevents pointless retries.
  const isSubscriptionEvent = SUBSCRIPTION_EVENTS.has(event.type)
  const isInvoiceEvent = INVOICE_EVENTS.has(event.type)
  if (!isSubscriptionEvent && !isInvoiceEvent) {
    return new Response('Not handled', { status: 200 })
  }

  // ── Database Client (service role) ────────────────────────────────────────
  // Service role bypasses RLS. Correct for webhook-driven billing table writes —
  // clinic_subscriptions has no client-facing write policies in Phase 12+.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Stripe event.created is Unix time in seconds; convert to ISO 8601 for DB.
  const eventAt = new Date(event.created * 1000).toISOString()

  try {
    if (isSubscriptionEvent) {
      const sub = event.data.object as Stripe.Subscription
      await handleSubscriptionEvent(supabase, sub, eventAt)
    } else {
      const inv = event.data.object as Stripe.Invoice
      // Only process invoices tied to a subscription (not standalone invoices).
      if (inv.subscription) {
        await handleInvoiceEvent(supabase, inv, event.type, eventAt)
      }
    }
  } catch (err) {
    const msg = (err as Error).message ?? ''
    // Transient errors (DB unreachable, connection reset): return 5xx so Stripe
    // retries automatically. Permanent errors (bad data, unknown clinic): return
    // 200 to stop retries and rely on console.error for manual review.
    const isTransient = /connect|timeout|network|econnreset/i.test(msg)
    if (isTransient) {
      console.error(`stripe-webhook: transient error for event ${event.id}:`, msg)
      return new Response('Temporary error', { status: 500 })
    }
    console.error(`stripe-webhook: permanent error for event ${event.id} (${event.type}):`, msg)
    return new Response('Processing error', { status: 200 })
  }

  return new Response('OK', { status: 200 })
})

// ── Subscription Event Handler ────────────────────────────────────────────────
//
// Maps a Stripe subscription event to a clinic_subscriptions row via the
// upsert_clinic_subscription() PostgreSQL RPC.
//
// CLINIC MAPPING: subscription.metadata.clinic_id is the authoritative key.
// The checkout Edge Function (Phase 12.5) MUST embed metadata.clinic_id when
// creating the Stripe checkout session or subscription. Without it, the event
// cannot be mapped to a clinic and is permanently skipped (logged for review).
//
// IDEMPOTENCY: The RPC applies the update only when the incoming event is
// strictly newer than the stored stripe_event_at. Replayed or out-of-order
// events are atomic no-ops.
async function handleSubscriptionEvent(
  supabase: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
  eventAt: string,
): Promise<void> {
  const clinicId = sub.metadata?.clinic_id
  if (!clinicId) {
    // Missing metadata: the checkout function did not embed clinic_id.
    // Permanent — metadata cannot appear after the fact. Log for manual review.
    console.warn(
      `stripe-webhook: sub ${sub.id} has no metadata.clinic_id — cannot map to clinic`,
    )
    return
  }

  const customerId =
    typeof sub.customer === 'string'
      ? sub.customer
      : (sub.customer as Stripe.Customer).id

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null

  const trialEnd = sub.trial_end
    ? new Date(sub.trial_end * 1000).toISOString()
    : null

  // plan_id: price ID of the first subscription item (single-plan model).
  const planId = sub.items?.data?.[0]?.price?.id ?? null

  const { error } = await supabase.rpc('upsert_clinic_subscription', {
    p_clinic_id:              clinicId,
    p_stripe_customer_id:     customerId,
    p_external_billing_id:    sub.id,
    p_status:                 sub.status,
    p_plan_id:                planId,
    p_trial_ends_at:          trialEnd,
    p_current_period_ends_at: periodEnd,
    p_stripe_event_at:        eventAt,
  })

  if (error) {
    // FK violation (23503): clinic_id references a deleted or unknown clinic.
    // Permanent — log and skip. Do not throw (would trigger Stripe retry).
    if (error.code === '23503') {
      console.warn(
        `stripe-webhook: sub ${sub.id} references unknown clinic_id ${clinicId} — skipped`,
      )
      return
    }
    // Other DB errors: treat as transient and let the outer catch decide retry.
    throw new Error(`DB error applying subscription ${sub.id}: ${error.message}`)
  }
}

// ── Invoice Event Handler ─────────────────────────────────────────────────────
//
// payment_succeeded: updates current_period_ends_at from the invoice period end.
// payment_failed:    supplementary past_due signal (non-critical; subscription
//                    events via RPC are the authoritative status source).
//
// Lookup: by external_billing_id (Stripe subscription ID = sub.xxx stored in DB).
// No clinic_id lookup needed — the subscription ID is already stored from the
// subscription event that preceded this invoice.
async function handleInvoiceEvent(
  supabase: ReturnType<typeof createClient>,
  inv: Stripe.Invoice,
  eventType: string,
  _eventAt: string,
): Promise<void> {
  const subId =
    typeof inv.subscription === 'string'
      ? inv.subscription
      : (inv.subscription as Stripe.Subscription | null)?.id

  if (!subId) return

  if (eventType === 'invoice.payment_succeeded') {
    const periodEnd = inv.period_end
      ? new Date(inv.period_end * 1000).toISOString()
      : null

    if (!periodEnd) return

    const { error } = await supabase
      .from('clinic_subscriptions')
      .update({ current_period_ends_at: periodEnd })
      .eq('external_billing_id', subId)

    if (error) {
      throw new Error(`DB error on invoice.payment_succeeded ${inv.id}: ${error.message}`)
    }
  } else {
    // invoice.payment_failed: best-effort past_due signal.
    // customer.subscription.updated also fires for past_due and is authoritative.
    // Errors here are non-critical — log and continue.
    const { error } = await supabase
      .from('clinic_subscriptions')
      .update({ status: 'past_due' })
      .eq('external_billing_id', subId)

    if (error) {
      console.warn(
        `stripe-webhook: non-critical error on invoice.payment_failed ${inv.id}: ${error.message}`,
      )
    }
  }
}
