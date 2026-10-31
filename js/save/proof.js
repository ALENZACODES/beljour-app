/** Local, count-only proof for a saved-look replay.
 *
 * This checks deterministic mechanics, source immutability, RGBA protection,
 * and complete tool execution. It does not judge beauty, identity, realism,
 * face geometry, fairness or quality on real photographs. No photo bytes,
 * filename, landmark, face identifier or model output enters the receipt.
 * Author: John Khan.
 */
import { applyLook } from "./looks.js";
import { latest } from "./recipe.js";
import { validateRecipe } from "./validate.js";
export const PROOF_FORMAT = "beljour-save-proof/1";
export const PROOF_CHECKS = [
    "input_valid",
    "source_unchanged",
    "output_shape",
    "output_detached",
    "replay_equal",
    "alpha_preserved",
    "steps_complete",
];
const DEFAULT_MAX_PIXELS = 16_777_216;
function checkedPhoto(photo, maxPixels) {
    if (!Number.isSafeInteger(maxPixels) || maxPixels < 1)
        return false;
    if (!Number.isSafeInteger(photo.width) || !Number.isSafeInteger(photo.height))
        return false;
    if (photo.width < 1 || photo.height < 1)
        return false;
    if (photo.width > 16_777_216 || photo.height > 16_777_216)
        return false;
    const pixels = photo.width * photo.height;
    if (!Number.isSafeInteger(pixels) || pixels > maxPixels)
        return false;
    if (photo.channels !== 3 && photo.channels !== 4)
        return false;
    if (!(photo.data instanceof Uint8Array || photo.data instanceof Uint8ClampedArray))
        return false;
    return photo.data.length === pixels * photo.channels;
}
function bufferOwned(photo, original) {
    if (photo.data === original.data)
        return false;
    if (photo.data.buffer === original.data.buffer)
        return false;
    return true;
}
function sameBytes(left, right) {
    if (left.length !== right.length)
        return false;
    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index])
            return false;
    }
    return true;
}
function sameAlpha(original, output) {
    if (original.channels !== 4)
        return true;
    if (original.data.length !== output.data.length)
        return false;
    for (let offset = 3; offset < original.data.length; offset += 4) {
        if (original.data[offset] !== output.data[offset])
            return false;
    }
    return true;
}
function row(check, status, reason) {
    return { check, status, reason };
}
function fallback(reason, steps, pixels) {
    return {
        format: PROOF_FORMAT,
        status: "FAIL",
        checks: PROOF_CHECKS.map((name) => row(name, "FAIL", reason)),
        expectedSteps: steps,
        executedSteps: 0,
        skippedSteps: 0,
        iterations: 0,
        pixels,
    };
}
function checkedSteps(look, version) {
    if (version === undefined)
        return latest(look).steps.length;
    const found = look.versions.find((entry) => entry.version === version);
    if (!found)
        throw new RangeError("unknown look version");
    return found.steps.length;
}
/**
 * Explicitly requested, local-only two-pass replay. A PASS means the listed
 * mechanical properties passed twice on this input; it is not a release gate.
 * A missing tool/provider yields UNPROVEN, not an invented successful edit.
 */
export function proveReplay(rawLook, source, engine, options = {}) {
    const pixels = Number.isSafeInteger(source.width * source.height)
        ? source.width * source.height
        : 0;
    let look;
    let expected;
    try {
        look = validateRecipe(rawLook);
        expected = checkedSteps(look, options.version);
    }
    catch {
        return fallback("invalid_input", 0, 0);
    }
    if (!checkedPhoto(source, options.maxPixels ?? DEFAULT_MAX_PIXELS)) {
        return fallback("invalid_input", expected, 0);
    }
    if (options.dose !== undefined &&
        (!Number.isFinite(options.dose) || options.dose < 0 || options.dose > 1)) {
        return fallback("invalid_input", expected, pixels);
    }
    const original = new Uint8Array(source.data);
    let first;
    let second;
    let firstDetached;
    try {
        first = applyLook(look, source, engine, options);
        firstDetached = bufferOwned(first.photo, source);
        // Snapshot the first result: a stateful adapter must not rewrite it when
        // the second replay runs through a shared internal scratch buffer.
        const firstBytes = new Uint8Array(first.photo.data);
        first = { ...first, photo: { ...first.photo, data: firstBytes } };
        second = applyLook(look, source, engine, options);
    }
    catch {
        return fallback("engine_error", expected, pixels);
    }
    const shape = checkedPhoto(first.photo, options.maxPixels ?? DEFAULT_MAX_PIXELS) &&
        checkedPhoto(second.photo, options.maxPixels ?? DEFAULT_MAX_PIXELS) &&
        first.photo.width === source.width && second.photo.width === source.width &&
        first.photo.height === source.height && second.photo.height === source.height &&
        first.photo.channels === source.channels && second.photo.channels === source.channels;
    const untouched = sameBytes(source.data, original);
    const detached = firstDetached && bufferOwned(second.photo, source);
    const replay = shape && sameBytes(first.photo.data, second.photo.data);
    const alpha = shape && sameAlpha(source, first.photo) && sameAlpha(source, second.photo);
    const complete = first.applied.length === expected && second.applied.length === expected &&
        first.skipped.length === 0 && second.skipped.length === 0 &&
        first.applied.length === second.applied.length;
    const coherent = first.applied.length + first.skipped.length === expected &&
        second.applied.length + second.skipped.length === expected;
    const checks = [
        row("input_valid", "PASS", "ok"),
        row("source_unchanged", untouched ? "PASS" : "FAIL", untouched ? "ok" : "source_changed"),
        row("output_shape", shape ? "PASS" : "FAIL", shape ? "ok" : "invalid_output"),
        row("output_detached", detached ? "PASS" : "FAIL", detached ? "ok" : "output_alias"),
        row("replay_equal", replay ? "PASS" : "FAIL", replay ? "ok" : "different_replay"),
        row("alpha_preserved", alpha ? "PASS" : "FAIL", alpha ? "ok" : "alpha_changed"),
        row("steps_complete", complete ? "PASS" : coherent ? "UNPROVEN" : "FAIL", complete ? "ok" : coherent ? "step_unavailable" : "not_executed"),
    ];
    const status = checks.some((check) => check.status === "FAIL")
        ? "FAIL"
        : checks.some((check) => check.status === "UNPROVEN")
            ? "UNPROVEN"
            : "PASS";
    return {
        format: PROOF_FORMAT,
        status,
        checks,
        expectedSteps: expected,
        executedSteps: first.applied.length,
        skippedSteps: first.skipped.length,
        iterations: 2,
        pixels,
    };
}
export function safeProof(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new TypeError("invalid proof object");
    }
    const value = raw;
    const allowed = ["format", "status", "checks", "expectedSteps", "executedSteps", "skippedSteps", "iterations", "pixels"];
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
        throw new TypeError("proof contains unregistered fields");
    }
    if (value.format !== PROOF_FORMAT || !Array.isArray(value.checks) || value.checks.length !== PROOF_CHECKS.length) {
        throw new TypeError("unknown or incomplete proof");
    }
    const numbers = ["expectedSteps", "executedSteps", "skippedSteps", "iterations", "pixels"];
    for (const key of numbers) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
            throw new TypeError("invalid proof count");
        }
    }
    const checks = value.checks.map((rawCheck, index) => {
        if (!rawCheck || typeof rawCheck !== "object" || Array.isArray(rawCheck)) {
            throw new TypeError("invalid proof check");
        }
        const check = rawCheck;
        if (Object.keys(check).some((key) => !["check", "status", "reason"].includes(key))) {
            throw new TypeError("proof check contains unregistered fields");
        }
        if (check.check !== PROOF_CHECKS[index] || !["PASS", "FAIL", "UNPROVEN"].includes(String(check.status))) {
            throw new TypeError("proof checks are not in the registered order");
        }
        if (typeof check.reason !== "string" || ![
            "ok", "invalid_input", "engine_error", "source_changed", "invalid_output",
            "output_alias", "different_replay", "alpha_changed", "step_unavailable", "not_executed",
        ].includes(check.reason)) {
            throw new TypeError("unregistered proof reason");
        }
        if ((check.status === "PASS") !== (check.reason === "ok")) {
            throw new TypeError("proof check reason contradicts its status");
        }
        return { check: PROOF_CHECKS[index], status: check.status, reason: check.reason };
    });
    const status = checks.some((entry) => entry.status === "FAIL")
        ? "FAIL"
        : checks.some((entry) => entry.status === "UNPROVEN")
            ? "UNPROVEN"
            : "PASS";
    if (value.status !== status)
        throw new TypeError("proof verdict contradicts check rows");
    if (value.executedSteps + value.skippedSteps > value.expectedSteps) {
        throw new TypeError("more steps reported than declared");
    }
    if (status === "PASS" && (value.executedSteps !== value.expectedSteps ||
        value.skippedSteps !== 0 || value.iterations !== 2)) {
        throw new TypeError("incomplete proof cannot pass");
    }
    return {
        format: PROOF_FORMAT,
        status,
        checks,
        expectedSteps: value.expectedSteps,
        executedSteps: value.executedSteps,
        skippedSteps: value.skippedSteps,
        iterations: value.iterations,
        pixels: value.pixels,
    };
}
