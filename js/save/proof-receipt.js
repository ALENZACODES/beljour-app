/** Portable, count-only local Save proof receipt.
 *
 * A SHA-256 checksum detects accidental edits, not deliberate forgery. There
 * is no trusted server, external signature, photograph, face geometry, filename
 * or user identifier here. A receipt never proves real-face quality or identity.
 * Author: John Khan.
 */
import { PROOF_CHECKS } from "./proof.js";
import { canonical, hashSettings, verifyProofBundle } from "./proof-plan.js";
import { validateSaveAudit } from "./proof-service.js";
export const PORTABLE_FORMAT = "beljour-save-portable-proof/1";
const MAX_TEXT_BYTES = 65536;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
function safeText(value) {
    if (typeof value !== "string")
        throw new TypeError("portable proof must be text");
    if (new TextEncoder().encode(value).byteLength > MAX_TEXT_BYTES || value.length === 0) {
        throw new RangeError("portable proof exceeds the size limit");
    }
    return value;
}
function fields(raw, allowed) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new TypeError("invalid proof object");
    const obj = raw;
    if (Object.keys(obj).length !== allowed.length || allowed.some((key) => !Object.hasOwn(obj, key))) {
        throw new TypeError("portable proof contains unexpected fields");
    }
    return obj;
}
function canonicalAudit(raw) {
    const audit = validateSaveAudit(raw);
    return canonical(audit);
}
function formatAudit(raw) {
    const value = validateSaveAudit(raw);
    const copy = JSON.parse(JSON.stringify(value));
    return validateSaveAudit(copy);
}
/** Produce an exportable JSON string, not a Blob or automatic download. */
export async function createPortableProof(raw, recipe) {
    const audit = formatAudit(raw);
    await verifyProofBundle(audit.replay, recipe);
    const checksum = await hashSettings(canonicalAudit(audit));
    const receipt = {
        format: PORTABLE_FORMAT,
        method: "unsigned-local-checksum",
        audit,
        checksum,
    };
    const text = JSON.stringify(receipt);
    return safeText(text);
}
/** Imported receipts must be bound to the current, validated recipe settings. */
export async function parsePortableProof(text, recipe) {
    let parsed;
    try {
        parsed = JSON.parse(safeText(text));
    }
    catch (error) {
        if (error instanceof RangeError)
            throw error;
        throw new TypeError("portable proof is not valid JSON");
    }
    const input = fields(parsed, ["format", "method", "audit", "checksum"]);
    if (input.format !== PORTABLE_FORMAT || input.method !== "unsigned-local-checksum" ||
        typeof input.checksum !== "string" || !HASH_PATTERN.test(input.checksum)) {
        throw new TypeError("unknown proof receipt format");
    }
    const audit = formatAudit(input.audit);
    const digest = await hashSettings(canonicalAudit(audit));
    if (digest !== input.checksum)
        throw new TypeError("portable proof checksum differs");
    await verifyProofBundle(audit.replay, recipe);
    return { format: PORTABLE_FORMAT, method: "unsigned-local-checksum", audit, checksum: digest };
}
/** One small, privacy-reviewed projection for UI, reports and local diagnostics. */
export function summarizePortableProof(raw) {
    const audit = validateSaveAudit(raw);
    const counts = audit.replay.report.counts;
    const exports = audit.exports;
    return {
        format: "beljour-save-proof-summary/1",
        status: audit.status,
        declared: counts.total,
        complete: counts.completed,
        replayPassed: counts.passed,
        replayFailed: counts.failed,
        replayUnproven: counts.unproven,
        exportsPassed: exports.passed,
        exportsFailed: exports.failed,
        exportsMissing: exports.missing,
        checks: PROOF_CHECKS.length,
        assurance: "local-mechanical-only",
    };
}
export function receiptDescription(summary) {
    const row = fields(summary, ["format", "status", "declared", "complete", "replayPassed", "replayFailed",
        "replayUnproven", "exportsPassed", "exportsFailed", "exportsMissing", "checks", "assurance"]);
    if (row.format !== "beljour-save-proof-summary/1" || row.assurance !== "local-mechanical-only" ||
        row.checks !== PROOF_CHECKS.length || !["PASS", "FAIL", "UNPROVEN"].includes(String(row.status))) {
        throw new TypeError("unrecognized local proof summary");
    }
    const readNumber = (key) => {
        const value = row[key];
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
            throw new TypeError("invalid proof count");
        }
        return value;
    };
    const declared = readNumber("declared");
    const complete = readNumber("complete");
    const passed = readNumber("replayPassed");
    const failed = readNumber("replayFailed");
    const unproven = readNumber("replayUnproven");
    const exported = readNumber("exportsPassed");
    const exportFailed = readNumber("exportsFailed");
    const exportMissing = readNumber("exportsMissing");
    if (declared < 1 || complete > declared || passed + failed + unproven !== complete ||
        exported + exportFailed + exportMissing !== declared) {
        throw new TypeError("proof summary counts differ");
    }
    return `${row.status}: local replay ${passed}/${declared} complete mechanical passes; ` +
        `${failed} failed, ${unproven} incomplete, ${declared - complete} missing. ` +
        `Export ${exported}/${declared} checked, ${exportFailed} failed, ${exportMissing} missing. ` +
        "Not a real-face, identity, fairness, or appearance-quality result.";
}
