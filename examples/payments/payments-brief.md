---
status: approved
---
# Payments platform: how does a card payment move through the system without charging twice or losing money?

For: engineers new to the payments team, who need the shape of the system and the reasons behind it.
Scope: card authorization in one region, from the merchant's request to the merchant's webhook. Out: capture, refunds, payouts, multi-region replication.

## Views
1. Payments: overview. Where each part sits and the card payment path (architecture).
2. Payments: card authorization. The saga's steps and what happens on a risk block, a decline or a failed ledger write (sequence).

## Parts and flows
The merchant's checkout form sends card details straight to the card vault and gets a token back. The merchant backend then creates a payment through the API gateway with an idempotency key. The Payments API checks the key, then starts a saga in the orchestrator: score risk, authorize through the vault and the acquirer, post ledger entries, and commit the payment state together with an outbox row. The outbox relay reads committed rows from the write-ahead log and publishes them to the event bus, where the webhook sender picks them up and notifies the merchant. Separately, a daily reconciler matches the acquirer's settlement files against the ledger.

## Facts
- F1: In Stripe API v1, retrying a POST with the same Idempotency-Key returns the saved status code and body of the first request, including 500 errors, and keys may be pruned once they are at least 24 hours old. (source: https://docs.stripe.com/api/idempotent_requests, checked 2026-11-17)
- F2: Card payments can be authorized first and captured later; an online card authorization is usually valid for 7 days, after which the funds are released. (source: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method, checked 2026-11-17)
- F3: With a transactional outbox, the service writes the business change and the outgoing message in the same database transaction, and a separate relay publishes the message; the relay may publish a message more than once. (source: https://microservices.io/patterns/data/transactional-outbox.html)
- F4: A saga is a coordinated sequence of local transactions; when a step fails, compensating transactions undo the changes of the steps already completed. (source: https://microservices.io/patterns/data/saga.html)
- F5: Debezium's PostgreSQL connector captures row-level changes from PostgreSQL's logical decoding of the write-ahead log, and its outbox event router turns outbox rows into events. (source: https://debezium.io/documentation/reference/stable/connectors/postgresql.html, https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)
- F6: In a double-entry ledger every transaction has at least two entries, and its total debits equal its total credits. (source: https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- F7: Tokenizing card details in the browser sends them directly to the payment provider without touching the merchant's servers, which reduces but does not remove PCI DSS obligations. (source: https://docs.stripe.com/security/guide, https://listings.pcisecuritystandards.org/documents/Tokenization_Guidelines_Info_Supplement.pdf)
- F8: Stripe retries undelivered webhook events with exponential backoff for up to three days in live mode and does not guarantee event order. (source: https://docs.stripe.com/webhooks, checked 2026-11-17)
- F9: Kafka consumers read a partition's records in exactly the order they were written; the guarantee is per partition. (source: https://kafka.apache.org/44/getting-started/introduction/)
- F10: Stripe Radar scores each payment's fraud risk in real time and blocks high-risk payments by default before they reach the card network. (source: https://docs.stripe.com/radar/transaction-risk-prevention, checked 2026-11-17)

## Decisions and assumptions
- D1: Only the card vault, inside its own PCI zone, ever sees a card number; everything else handles tokens (F7).
- D2: State changes leave the payment core only through the outbox, never by publishing directly (F3, F5).
- D3: Events are keyed by payment id so one payment's events stay in order (F9); webhook consumers must still handle duplicates and reordering (F3, F8).
- D4: Every money movement becomes balanced ledger entries (F6); a failed ledger write voids the authorization as a compensation (F4).
- D5: Risk is scored before authorization, so blocked payments never reach the card network (F10).
- A1: The reconciler runs daily; the cadence is an assumption to confirm.
- A2: Stripe behaviour stands in for "a typical card processor"; other processors differ in limits.

## Open questions
- Should capture and refunds get their own view?
