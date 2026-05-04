// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://497b038c002662d1976781fa85eb9eed@o4511328555892736.ingest.us.sentry.io/4511328556941312",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Per our logging-hygiene policy (docs/01-architecture.md), do not send PII —
  // we only want IDs and event types in Sentry, never amounts or merchant data.
  sendDefaultPii: false,
});
