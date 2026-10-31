/** Explicit, content-bound replay plan for the local Save System.
 *
 * SHA-256 binds only validated recipe SETTINGS and declared check criteria.
 * No image, image hash, face label, filename or provider response is part of
 * this plan. A hash is a change detector, not a signature or quality claim.
 * Author: John Khan.
 */
import { PROOF_CHECKS, PROOF_FORMAT } from "./proof.js";
import { validateRecipe } from "./validate.js";
import { LEDGER_FORMAT, validateLedger } from "./proof-ledger.js";
export const PLAN_FORMAT = "beljour-save-proof-plan/1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_ITEMS = 100_000;
/** Stable JSON serialization for settings: object keys are sorted recursively. */
export function canonical(value) {
    if (value === null)
        return "null";
    if (typeof value === "string")
        return JSON.stringify(value);
    if (typeof value === "boolean")
        return value ? "true" : "false";
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new TypeError("non-finite settings are not supported");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value);
        if (entries.some(([, item]) => item === undefined))
            throw new TypeError("undefined setting value");
        return `{${entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    }
    throw new TypeError("unsupported proof-plan input");
}
export async function hashSettings(text) {
    const crypto = globalThis.crypto;
    if (!crypto?.subtle)
        throw new Error("offline cryptographic hash unavailable");
    const content = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", content);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
/** Plans have no future execution date or identity-bearing photo reference. */
export async function createProofPlan(raw, declaredItems) {
    if (!Number.isSafeInteger(declaredItems) || declaredItems < 1 || declaredItems > MAX_ITEMS) {
        throw new RangeError("proof plan needs 1 to 100000 declared items");
    }
    const look = validateRecipe(raw);
    const recipeDigest = await hashSettings(canonical(look));
    return {
        format: PLAN_FORMAT,
        recipeDigest,
        declaredItems,
        criteria: [...PROOF_CHECKS],
        method: "local-deterministic-replay",
    };
}
function validatePlan(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new TypeError("invalid proof plan");
    const plan = raw;
    const keys = ["format", "recipeDigest", "declaredItems", "criteria", "method"];
    if (Object.keys(plan).length !== keys.length || keys.some((key) => !Object.hasOwn(plan, key))) {
        throw new TypeError("proof plan fields differ");
    }
    if (plan.format !== PLAN_FORMAT || plan.method !== "local-deterministic-replay" ||
        typeof plan.recipeDigest !== "string" || !SHA256_PATTERN.test(plan.recipeDigest)) {
        throw new TypeError("proof plan format or digest differs");
    }
    if (!Number.isSafeInteger(plan.declaredItems) || plan.declaredItems < 1 ||
        plan.declaredItems > MAX_ITEMS) {
        throw new TypeError("invalid declared proof size");
    }
    if (!Array.isArray(plan.criteria) || plan.criteria.length !== PROOF_CHECKS.length ||
        plan.criteria.some((item, index) => item !== PROOF_CHECKS[index])) {
        throw new TypeError("preregistered checks were altered");
    }
    return {
        format: PLAN_FORMAT,
        recipeDigest: plan.recipeDigest,
        declaredItems: plan.declaredItems,
        criteria: [...PROOF_CHECKS],
        method: "local-deterministic-replay",
    };
}
/** An attached ledger never overrides a failed or incomplete measured check. */
export function bindReport(rawPlan, rawReport) {
    const plan = validatePlan(rawPlan);
    const report = validateLedger(rawReport);
    if (report.counts.total !== plan.declaredItems) {
        throw new TypeError("proof report has different declared size");
    }
    return { format: "beljour-save-proof-bundle/1", plan, report, status: report.status };
}
/** On reimport, independently recompute the recipe digest. */
export async function verifyProofBundle(raw, recipe) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new TypeError("invalid proof bundle");
    const value = raw;
    const fields = ["format", "plan", "report", "status"];
    if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
        throw new TypeError("proof bundle includes unknown fields");
    }
    if (value.format !== "beljour-save-proof-bundle/1")
        throw new TypeError("unknown proof bundle format");
    const bound = bindReport(value.plan, value.report);
    if (bound.status !== value.status)
        throw new TypeError("claimed proof result differs from the measurements");
    const currentDigest = await hashSettings(canonical(validateRecipe(recipe)));
    if (currentDigest !== bound.plan.recipeDigest)
        throw new TypeError("saved recipe has changed since the proof");
    return bound;
}
/** A missing proof is explicitly UNPROVEN, regardless of saved recipe state. */
export function proofAvailability(value) {
    if (!value)
        return { status: "UNPROVEN", provenance: "not_measured" };
    if (value.format !== PROOF_FORMAT)
        return { status: "UNPROVEN", provenance: "unknown_format" };
    return { status: value.status, provenance: "synthetic_or_local_mechanical_checks_only" };
}
/** Report descriptions deliberately contain no real-photo quality terminology. */
export function describeProof(bundle) {
    if (bundle.format !== "beljour-save-proof-bundle/1" || bundle.report.format !== LEDGER_FORMAT) {
        return "UNPROVEN: no verified local save audit";
    }
    const { passed, failed, unproven, missing, total } = bundle.report.counts;
    return `${bundle.status}: local save replay ${passed}/${total} complete passes; ` +
        `${failed} failed, ${unproven} incomplete, ${missing} missing. ` +
        "Not a real-face, identity, realism or fairness acceptance result.";
}
