/** C18 shade QA snapshots: ordered, digest-bound copies of the shared shade catalogues.
 * Mirrors api/plumb_api/engines/shade/c18.py: "skin" (96 extended references), "base"
 * (80 historical) and "hair" (90 original swatches). The SHA-256 digest covers one line
 * per record in source order (format header, then id|name|surface|undertone|level|step|
 * family|L|a|b with six-decimal Lab), so the browser and Python digests agree and any
 * changed value or order changes it. The Python snapshot calls its list `records`; the
 * browser one calls it `shades`. Inventory integrity only. Author: John Khan.
 */
import { loadShadeCatalogue } from "./loaders.js";
export const C18_KINDS = Object.freeze(["skin", "base", "hair"]);
export const FORMAT = "beljour-c18-snapshot/1";
const CATALOGUE = { skin: "reference", base: "base", hair: "hair" };
const EXPECTED_COUNTS = { skin: 96, base: 80, hair: 90 };
function field(value) {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[|\n\r]/.test(text))
        throw new RangeError("C18 record text may not contain separators");
    return text;
}
/** The exact text the digest covers. */
export function canonicalText(kind, records) {
    const lines = [`${FORMAT}|${field(kind)}|${records.length}`];
    for (const r of records) {
        lines.push([field(r.id), field(r.name), field(r.surface), field(r.undertone), String(r.level),
            r.step === null ? "" : String(r.step), field(r.family), ...[0, 1, 2].map((i) => (r.lab[i] + 0).toFixed(6))].join("|"));
    }
    return `${lines.join("\n")}\n`;
}
export async function snapshotDigest(kind, records) {
    const bytes = new TextEncoder().encode(canonicalText(kind, records));
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
const cache = new Map();
/** The current ordered snapshot; rejects an unknown kind or a changed count. */
export function loadC18Shades(kind = "skin") {
    if (!C18_KINDS.includes(kind))
        return Promise.reject(new RangeError("Unknown C18 shade kind"));
    let found = cache.get(kind);
    if (found === undefined) {
        const catalogue = loadShadeCatalogue(CATALOGUE[kind]);
        if (catalogue.count !== EXPECTED_COUNTS[kind]) {
            return Promise.reject(new RangeError(`C18 ${kind} inventory has ${catalogue.count} records`));
        }
        found = snapshotDigest(kind, catalogue.records).then((digest) => Object.freeze({
            kind, count: catalogue.count, shades: catalogue.records, digest, source: catalogue.source
        }));
        cache.set(kind, found);
    }
    return found;
}
const sameRecord = (a, b) => a.id === b.id && a.name === b.name && a.surface === b.surface && a.undertone === b.undertone &&
    a.level === b.level && a.step === b.step && a.family === b.family && a.lab.every((v, i) => v === b.lab[i]);
/** Compare a snapshot with the current source: provenance, count, order, values, digest. */
export async function checkC18Shades(snapshot) {
    const current = await loadC18Shades(snapshot.kind);
    const problems = [];
    if (snapshot.source !== current.source)
        problems.push("source_changed");
    if (snapshot.shades.length !== current.count || snapshot.count !== current.count)
        problems.push("count_changed");
    const ids = snapshot.shades.map((r) => r.id), expected = current.shades.map((r) => r.id);
    if (ids.join("\n") !== expected.join("\n")) {
        const sameSet = ids.length === expected.length && [...ids].sort().join("\n") === [...expected].sort().join("\n");
        problems.push(sameSet ? "order_or_ids_changed" : "ids_changed");
    }
    else {
        snapshot.shades.forEach((r, i) => { if (!sameRecord(r, current.shades[i]))
            problems.push(`record_changed:${r.id}`); });
    }
    let recomputed = "";
    try {
        recomputed = await snapshotDigest(snapshot.kind, snapshot.shades);
    }
    catch {
        problems.push("record_text_invalid");
    }
    if (recomputed !== snapshot.digest)
        problems.push("digest_mismatch");
    if (snapshot.digest !== current.digest)
        problems.push("digest_differs_from_source");
    return Object.freeze({ format: "beljour-c18-check/1", kind: snapshot.kind, ok: problems.length === 0,
        problems: Object.freeze(problems), digest: snapshot.digest, expected_digest: current.digest,
        release_pass: false });
}
//# sourceMappingURL=c18.js.map