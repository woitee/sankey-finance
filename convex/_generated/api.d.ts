/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as bankAuth from "../bankAuth.js";
import type * as bankSync from "../bankSync.js";
import type * as banks_registry from "../banks/registry.js";
import type * as banks_types from "../banks/types.js";
import type * as cardholderNicknames from "../cardholderNicknames.js";
import type * as corrections from "../corrections.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as integrations from "../integrations.js";
import type * as jobs from "../jobs.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as rules from "../rules.js";
import type * as statements from "../statements.js";
import type * as transactions from "../transactions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  bankAuth: typeof bankAuth;
  bankSync: typeof bankSync;
  "banks/registry": typeof banks_registry;
  "banks/types": typeof banks_types;
  cardholderNicknames: typeof cardholderNicknames;
  corrections: typeof corrections;
  crons: typeof crons;
  http: typeof http;
  imports: typeof imports;
  integrations: typeof integrations;
  jobs: typeof jobs;
  "lib/crypto": typeof lib_crypto;
  rules: typeof rules;
  statements: typeof statements;
  transactions: typeof transactions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
