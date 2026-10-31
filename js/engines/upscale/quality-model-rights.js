/** Per-artefact rights records for the optional Quality Generator model chain.
 * A record is the browser copy of a decision made offline by the Python model gate
 * (exact bytes, upstream commit and archived rights review against an `allowed`
 * ledger entry). The browser re-checks the record and the exact weight bytes and
 * refuses pending, blocked, unlicensed or mismatched weights the same way the E03
 * model registry does. No fetch, no storage. Author: John Khan.
 */
import { ALLOWED_LICENCES } from "../../vision/generated/model-licences.js";
import { ModelGateError, hashModel } from "../../vision/model-registry.js";
export const MODEL_RIGHTS_FORMAT = "beljour-model-rights/1";
export const QUALITY_MODEL_ROLES = Object.freeze({
    swinir_preclean: Object.freeze({ stage: "preclean", project: "SwinIR", licence: "Apache-2.0" }),
    realesrgan_upscale: Object.freeze({ stage: "upscale", project: "Real-ESRGAN", licence: "BSD-3-Clause" }),
    modnet_matte: Object.freeze({ stage: "matte", project: "MODNet", licence: "Apache-2.0" }),
});
/** Same exact-size ceiling as the E03 registry (CONTRACTS.md §18). */
export const MAX_QUALITY_MODEL_BYTES = 120 * 1024 * 1024;
const RECORD_KEYS = "format,gateDecision,licence,modelId,reviewSha256,role,upstreamCommit,weightsBytes,weightsSha256";
const MODEL_ID = /^[a-z][a-z0-9-]{2,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DECISIONS = ["allowed", "pending", "blocked"];
const allowedLicences = new Set(ALLOWED_LICENCES);
function isRole(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(QUALITY_MODEL_ROLES, value);
}
/** Validate a rights record for the stage it is about to fill; returns a frozen copy. */
export function checkModelRights(value, role) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== RECORD_KEYS) {
        throw new ModelGateError("model rights record is malformed");
    }
    const item = value;
    if (item.format !== MODEL_RIGHTS_FORMAT || !isRole(item.role) ||
        typeof item.modelId !== "string" || !MODEL_ID.test(item.modelId) ||
        typeof item.gateDecision !== "string" || !DECISIONS.includes(item.gateDecision)) {
        throw new ModelGateError("unknown model rights format, role, ID or decision");
    }
    const id = item.modelId;
    if (item.role !== role)
        throw new ModelGateError(`model ${id}: reviewed for ${item.role}, not ${role}`);
    if (item.gateDecision !== "allowed") {
        throw new ModelGateError(`model ${id}: rights review is ${item.gateDecision}; the classical engine stays active`);
    }
    if (typeof item.upstreamCommit !== "string" || !COMMIT.test(item.upstreamCommit)) {
        throw new ModelGateError(`model ${id}: an immutable upstream commit is required`);
    }
    if (typeof item.weightsSha256 !== "string" || !SHA256.test(item.weightsSha256) ||
        typeof item.reviewSha256 !== "string" || !SHA256.test(item.reviewSha256)) {
        throw new ModelGateError(`model ${id}: weight and review digests must be lower-case SHA-256`);
    }
    if (typeof item.weightsBytes !== "number" || !Number.isSafeInteger(item.weightsBytes) ||
        item.weightsBytes < 1 || item.weightsBytes > MAX_QUALITY_MODEL_BYTES) {
        throw new ModelGateError(`model ${id}: invalid byte size`);
    }
    if (typeof item.licence !== "string" || !allowedLicences.has(item.licence)) {
        throw new ModelGateError(`model ${id}: commercial licence not approved`);
    }
    if (item.licence !== QUALITY_MODEL_ROLES[role].licence) {
        throw new ModelGateError(`model ${id}: licence does not match the reviewed ${QUALITY_MODEL_ROLES[role].project} release`);
    }
    return Object.freeze({
        format: MODEL_RIGHTS_FORMAT, role, modelId: id,
        upstreamCommit: item.upstreamCommit, licence: item.licence,
        weightsSha256: item.weightsSha256, weightsBytes: item.weightsBytes,
        reviewSha256: item.reviewSha256, gateDecision: "allowed",
    });
}
/** Exact length and SHA-256 of the bytes about to reach a runtime. */
export async function verifyModelBytes(record, bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== record.weightsBytes) {
        throw new ModelGateError(`model ${record.modelId}: weight size mismatch`);
    }
    const whole = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 &&
        bytes.byteLength === bytes.buffer.byteLength;
    // A view into a larger or shared buffer is hashed from a private copy, then wiped.
    const copy = whole ? null : new Uint8Array(new ArrayBuffer(bytes.byteLength));
    copy?.set(bytes);
    try {
        const digest = await hashModel(copy ? copy.buffer : bytes.buffer);
        if (digest !== record.weightsSha256) {
            throw new ModelGateError(`model ${record.modelId}: sha256 mismatch`);
        }
    }
    finally {
        copy?.fill(0);
    }
}
