import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cardholderNicknames: defineTable({
    fullName: v.string(),   // exact value from transaction (e.g. "Mgr. Vojtěch Černý")
    nickname: v.string(),   // display name (e.g. "Vojta")
  }).index("by_fullName", ["fullName"]),

  accounts: defineTable({
    accountNumber: v.string(),      // unique key, e.g. IBAN or local account number
    name: v.string(),               // user-defined display name
    institution: v.optional(v.string()),  // e.g. "Chase", "Monzo"
    createdAt: v.string(),
  }).index("by_accountNumber", ["accountNumber"]),

  transactions: defineTable({
    // Identity
    originalId: v.string(),
    period: v.string(),

    // Bank account link
    bankAccountNumber: v.optional(v.string()),  // FK → accounts.accountNumber

    // Dates
    datePosted: v.string(),
    dateExecuted: v.string(),

    // Transaction details
    type: v.string(),
    cardholderName: v.string(),
    accountIdentifier: v.string(),
    merchantName: v.string(),
    details: v.string(),
    amount: v.number(),
    fees: v.number(),

    // Categorization
    cat3: v.union(v.string(), v.null()),
    cat2: v.union(v.string(), v.null()),
    cat1: v.union(v.string(), v.null()),
    categorizationSource: v.union(
      v.literal("rule"),
      v.literal("llm"),
      v.literal("manual"),
      v.null()
    ),

    // Grouping
    groupId: v.union(v.string(), v.null()),
    groupLabel: v.union(v.string(), v.null()),

    // Import provenance — FK → imports._id (null for bank-synced transactions)
    importId: v.optional(v.id("imports")),

    // Rule that categorized this transaction (FK → rules._id)
    ruleId: v.optional(v.id("rules")),
  })
    .index("by_datePosted", ["datePosted"])
    .index("by_period", ["period"])
    .index("by_originalId", ["originalId"])
    .index("by_bankAccount", ["bankAccountNumber"])
    .index("by_import", ["importId"]),

  imports: defineTable({
    filename: v.string(),        // original file name
    parserName: v.string(),      // e.g. "Air Bank (Czech Republic)" or "AI (Claude)"
    importedAt: v.string(),      // ISO timestamp
    period: v.string(),          // YYYY-MM from the parsed statement
    accountNumber: v.string(),
    transactionCount: v.number(),
  }).index("by_importedAt", ["importedAt"]),

  statements: defineTable({
    period: v.string(),
    accountNumber: v.string(),
    openingBalance: v.number(),
    closingBalance: v.number(),
    totalIncome: v.optional(v.number()),   // renamed from totalCredits
    totalCredits: v.optional(v.number()),  // legacy name — kept for existing docs
    totalDebits: v.number(),
  }).index("by_period", ["period"]),

  rules: defineTable({
    // Matching
    pattern: v.string(),
    field: v.union(v.literal("merchantName"), v.literal("details")),
    matchType: v.union(v.literal("contains"), v.literal("exact"), v.literal("startsWith")),
    // Category outcome
    cat3: v.string(),
    cat2: v.union(v.string(), v.null()),
    cat1: v.union(v.string(), v.null()),
    // Workflow
    status: v.union(v.literal("active"), v.literal("candidate"), v.literal("rejected")),
    source: v.union(v.literal("manual"), v.literal("ai")),
    note: v.optional(v.string()),  // legacy — no longer written, kept for existing docs
    createdAt: v.string(),
    approvedAt: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_pattern", ["pattern"]),

  integrations: defineTable({
    bank: v.string(),               // e.g. "fio", "revolut"
    label: v.string(),              // user-defined, e.g. "Personal checking"
    status: v.union(
      v.literal("pending_auth"),    // OAuth not yet completed
      v.literal("active"),          // healthy, has refresh token
      v.literal("error"),           // last sync failed
    ),
    // Encrypted tokens (AES-256-GCM, hex-encoded ciphertext:iv:tag)
    encryptedRefreshToken: v.union(v.string(), v.null()),
    encryptedAccessToken: v.union(v.string(), v.null()),
    accessTokenExpiry: v.union(v.string(), v.null()),  // ISO string
    // Populated after first sync
    linkedAccountNumbers: v.array(v.string()),
    lastSyncedAt: v.union(v.string(), v.null()),
    lastError: v.union(v.string(), v.null()),
    createdAt: v.string(),
  }).index("by_bank", ["bank"]),

  jobs: defineTable({
    type: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("error")
    ),
    startedAt: v.union(v.string(), v.null()),
    completedAt: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    metadata: v.optional(v.any()),
  })
    .index("by_type", ["type"])
    .index("by_status", ["status"]),
});
