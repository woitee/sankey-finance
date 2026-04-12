import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Sync all active integrations daily at 06:00 UTC
crons.daily(
  "daily bank sync",
  { hourUTC: 6, minuteUTC: 0 },
  api.bankSync.syncAll,
);

export default crons;
