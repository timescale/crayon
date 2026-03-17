// Importing env validates all required environment variables at server startup.
import "@/env";

export async function register() {
  // Only start the cron scheduler in the Node.js server runtime
  // (not during builds or in edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/cron");
    startScheduler();
  }
}
