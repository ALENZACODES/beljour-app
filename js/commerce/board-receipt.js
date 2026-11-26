/** Versioned, settings-only JSON receipt for a five-strength hair board.
 * Mirrors api/plumb_api/commerce/board_receipt.py field for field.
 * A receipt holds the chosen edit, photo width and height, and numeric evidence for the
 * five stops. It never holds image bytes, a photo hash, masks, head landmarks, account
 * data or provider secrets. Imports validate every field and recompute the totals; every
 * receipt stays "unverified" with real-face status "not_tested". Author: John Khan.
 */
import { FIVE_LEVELS, levelTotals, publicReport, round4 } from "./level-board.js";
export const RECEIPT_VERSION = "beljour-r29f-board-receipt/1";
export const MAX_RECEIPT_BYTES = 16_384;
const MAX_EDGE = 4096;
const TOP_KEYS = ["choice", "height", "kind", "levels", "provider_calls", "real_face_status",
    "simulated", "totals", "verification", "version", "width"];
const LEVEL_KEYS = ["changed_pixels", "changed_share", "guard_applied", "identity_blended",
    "identity_similarity", "level", "max_delta", "mean_delta", "refusal_code", "region_pixels", "status"];
const CHOICE_KEYS = {
    fibre: ["shade_id", "zone"], palette: ["allow_lightening", "shade_id"], "short-sides": ["style_id"],
};
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CODE = /^[a-z][a-z_]{0,47}$/;
const STATUSES = ["rendered", "unchanged", "refused"];
export class ReceiptError extends Error {
    constructor(message) { super(message); this.name = "ReceiptError"; }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, keys) {
    const own = Object.keys(value).sort();
    return own.length === keys.length && own.every((key, i) => key === keys[i]);
}
function integer(value, name, low, high) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < low || value > high) {
        throw new ReceiptError(`${name} must be an integer from ${low} to ${high}.`);
    }
    return value;
}
function fraction(value, name, nullable = false) {
    if (value === null && nullable)
        return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 || round4(value) !== value) {
        throw new ReceiptError(`${name} must be a fraction with at most four decimals.`);
    }
    return value;
}
function checkChoice(kind, value) {
    if (!isRecord(value) || !exactKeys(value, CHOICE_KEYS[kind])) {
        throw new ReceiptError("Receipt choice fields do not match its edit kind.");
    }
    for (const [key, item] of Object.entries(value)) {
        if (key === "allow_lightening") {
            if (typeof item !== "boolean")
                throw new ReceiptError("allow_lightening must be a boolean.");
        }
        else if (key === "zone") {
            if (!["crown", "parting", "hairline"].includes(item))
                throw new ReceiptError("Unknown fibre zone.");
        }
        else if (!(item === null && key === "shade_id" && kind === "fibre")) {
            if (typeof item !== "string" || !IDENTIFIER.test(item)) {
                throw new ReceiptError(`${key} must be a catalogue identifier.`);
            }
        }
    }
    return { ...value };
}
function checkLevel(row, expected) {
    if (!isRecord(row) || !exactKeys(row, LEVEL_KEYS)) {
        throw new ReceiptError("Receipt level fields are incomplete or include unknown data.");
    }
    if (row.level !== expected)
        throw new ReceiptError("Receipt levels must be exactly 1.0, 2.0, 3.0, 4.0 and 5.0.");
    const status = row.status;
    if (!STATUSES.includes(status))
        throw new ReceiptError("Unknown level status.");
    const region = integer(row.region_pixels, "region_pixels", 0, MAX_EDGE * MAX_EDGE);
    const changed = integer(row.changed_pixels, "changed_pixels", 0, region);
    const share = fraction(row.changed_share, "changed_share");
    const mean = fraction(row.mean_delta, "mean_delta");
    const largest = integer(row.max_delta, "max_delta", 0, 255);
    const similarity = fraction(row.identity_similarity, "identity_similarity", true);
    const blended = row.identity_blended, guarded = row.guard_applied, code = row.refusal_code;
    if (typeof guarded !== "boolean")
        throw new ReceiptError("guard_applied must be a boolean.");
    if (status === "refused") {
        if (typeof code !== "string" || !CODE.test(code))
            throw new ReceiptError("A refused level needs a refusal code.");
        if (changed || largest || share || mean || similarity !== null || blended !== null || guarded) {
            throw new ReceiptError("A refused level cannot claim rendered evidence.");
        }
    }
    else {
        if (code !== null || similarity === null || typeof blended !== "boolean" || !guarded) {
            throw new ReceiptError("A rendered or unchanged level needs guarded evidence.");
        }
        if ((status === "unchanged") !== (changed === 0)) {
            throw new ReceiptError("Unchanged levels have no changed pixels, rendered levels some.");
        }
        // Python and the browser round ties differently, so allow half a unit of the last place.
        const exact = region ? changed / region : 0;
        if (Math.abs(share - exact) > 0.00005 + 1e-12) {
            throw new ReceiptError("changed_share does not match changed and region pixels.");
        }
    }
    return { ...row };
}
/** Strictly check a receipt; totals are recomputed, never trusted. */
export function validateReceipt(value) {
    if (!isRecord(value) || !exactKeys(value, TOP_KEYS)) {
        throw new ReceiptError("Receipt fields are incomplete or include unknown or private data.");
    }
    if (value.version !== RECEIPT_VERSION)
        throw new ReceiptError("Unsupported receipt version.");
    const kind = value.kind;
    if (typeof kind !== "string" || !(kind in CHOICE_KEYS))
        throw new ReceiptError("Unknown edit kind.");
    if (value.verification !== "unverified" || value.real_face_status !== "not_tested" ||
        value.simulated !== true || value.provider_calls !== 0) {
        throw new ReceiptError("Receipts are unverified local simulations with no provider calls.");
    }
    const width = integer(value.width, "width", 8, MAX_EDGE);
    const height = integer(value.height, "height", 8, MAX_EDGE);
    if (width * height > 1_048_576)
        throw new ReceiptError("Receipt dimensions exceed the board limit.");
    const levels = value.levels;
    if (!Array.isArray(levels) || levels.length !== 5)
        throw new ReceiptError("A receipt has exactly five levels.");
    const rows = levels.map((row, i) => checkLevel(row, FIVE_LEVELS[i]));
    if (rows.some((row) => row.region_pixels > width * height)) {
        throw new ReceiptError("Region pixels exceed the photo size.");
    }
    const totals = levelTotals(rows);
    const claimed = value.totals;
    if (!isRecord(claimed) || !exactKeys(claimed, ["cases", "refused", "rendered", "unchanged"]) ||
        Object.entries(totals).some(([key, count]) => claimed[key] !== count)) {
        throw new ReceiptError("Receipt totals do not match its levels.");
    }
    return { version: RECEIPT_VERSION, kind, choice: checkChoice(kind, value.choice), width, height,
        levels: rows, totals, verification: "unverified", real_face_status: "not_tested", simulated: true,
        provider_calls: 0 };
}
export function issueReceipt(board) {
    const report = publicReport(board);
    return validateReceipt({ version: RECEIPT_VERSION, kind: report.kind, choice: report.choice,
        width: report.width, height: report.height, levels: report.levels, totals: report.totals,
        verification: "unverified", real_face_status: "not_tested", simulated: true, provider_calls: 0 });
}
function sorted(value) {
    if (Array.isArray(value))
        return value.map(sorted);
    if (isRecord(value)) {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
    }
    return value;
}
/** Canonical JSON text with sorted keys, validated first. */
export function dumpsReceipt(receipt) {
    const text = JSON.stringify(sorted(validateReceipt(receipt)));
    if (new TextEncoder().encode(text).length > MAX_RECEIPT_BYTES) {
        throw new ReceiptError("Receipt exceeds its size limit.");
    }
    return text;
}
/** Refuse repeated keys, which JSON.parse would otherwise silently collapse. */
function rejectDuplicateKeys(text) {
    const stack = [];
    let expectKey = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            let j = i + 1;
            while (j < text.length && text[j] !== '"')
                j += text[j] === "\\" ? 2 : 1;
            const top = stack[stack.length - 1];
            if (expectKey && top) {
                const key = JSON.parse(text.slice(i, j + 1));
                if (top.has(key))
                    throw new ReceiptError(`Duplicate receipt field ${key}.`);
                top.add(key);
                expectKey = false;
            }
            i = j;
        }
        else if (ch === "{") {
            stack.push(new Set());
            expectKey = true;
        }
        else if (ch === "[") {
            stack.push(null);
        }
        else if (ch === "}" || ch === "]") {
            stack.pop();
        }
        else if (ch === ",") {
            expectKey = stack[stack.length - 1] instanceof Set;
        }
    }
}
/** Parse an imported receipt; duplicate keys are refused and it remains unverified. */
export function loadsReceipt(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_RECEIPT_BYTES) {
        throw new ReceiptError("Receipt text is missing or too large.");
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new ReceiptError("Receipt is not valid JSON.");
    }
    rejectDuplicateKeys(text);
    return validateReceipt(value);
}
//# sourceMappingURL=board-receipt.js.map