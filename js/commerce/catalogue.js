export const TONES = ["cool", "neutral", "warm", "olive"];
export const TONE_OFFSETS = {
    cool: [8, -1, 6], neutral: [0, 0, 0], warm: [5, 4, -5], olive: [-4, 2, -7],
};
export const SHADE_SUFFIX = { cool: "Rose", neutral: "Balance", warm: "Gold", olive: "Olive" };
export const OTHER_SWATCH = {
    cheek: "#be6e7a", lip: "#924e61", prep: "#e1d9cf", finish: "#d7c5b8",
};
const FORMATS = new Set(["natural", "dewy", "satin", "matte"]);
const CATEGORIES = new Set(["complexion", "cheek", "lip", "prep", "finish"]);
const VTO = new Set([null, "foundation", "blush", "lip"]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z][a-z0-9-]{2,35}$/;
const DEPTH_COUNT = 10;
function object(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        throw Error("Invalid sample catalogue data");
    return value;
}
function stringArray(value) {
    return Array.isArray(value) && value.every((s) => typeof s === "string");
}
export function assertCatalogue(input) {
    const data = object(input);
    if (data.format !== "beljour-commerce-catalogue/1" || data.author !== "John Khan" || data.currency !== "CAD") {
        throw Error("Unrecognised sample catalogue");
    }
    if (typeof data.version !== "string" || typeof data.note !== "string" || data.note.length < 25) {
        throw Error("Incomplete catalogue provenance");
    }
    if (!stringArray(data.tones) || data.tones.join(",") !== TONES.join(",") ||
        !stringArray(data.depths) || data.depths.length !== DEPTH_COUNT ||
        !stringArray(data.depth_swatches) || data.depth_swatches.length !== DEPTH_COUNT ||
        !data.depth_swatches.every((s) => HEX.test(s)) ||
        !stringArray(data.finishes) || !data.finishes.every((s) => FORMATS.has(s)) ||
        !stringArray(data.concerns) || data.concerns.length === 0) {
        throw Error("Invalid sample shade options");
    }
    if (!Array.isArray(data.formulas) || data.formulas.length < 2)
        throw Error("Sample products are missing");
    const ids = new Set();
    for (const row of data.formulas) {
        const value = object(row);
        if (typeof value.id !== "string" || !ID.test(value.id) || ids.has(value.id) ||
            typeof value.name !== "string" || value.name.length < 4 || value.name.length > 70 ||
            typeof value.description !== "string" || value.description.length < 12 || value.description.length > 250 ||
            !CATEGORIES.has(value.category) || !FORMATS.has(value.finish) ||
            !VTO.has(value.vto) || !Number.isInteger(value.price_cents) ||
            value.price_cents <= 0 || value.price_cents >= 100_000 ||
            !stringArray(value.concerns) || value.concerns.length === 0 ||
            !value.concerns.every((s) => data.concerns.includes(s)) ||
            !["none", "sheer", "medium"].includes(value.coverage)) {
            throw Error("Sample product failed validation");
        }
        ids.add(value.id);
        if ((value.category === "complexion") !== (value.vto === "foundation") ||
            (["cheek", "lip"].includes(value.category) && value.vto !== (value.category === "cheek" ? "blush" : "lip"))) {
            throw Error("Sample try-on category mismatch");
        }
    }
}
export function shiftSwatch(base, tone) {
    if (!HEX.test(base))
        throw Error("Swatch must be a six-digit hex colour");
    return `#${[1, 3, 5].map((index, channel) => {
        const value = parseInt(base.slice(index, index + 2), 16) + TONE_OFFSETS[tone][channel];
        return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
    }).join("")}`;
}
function base(formula) {
    return { formula_id: formula.id, description: formula.description, category: formula.category,
        vto: formula.vto, price_cents: formula.price_cents, currency: "CAD", finish: formula.finish,
        concerns: formula.concerns, coverage: formula.coverage, sample: true,
        label: "Fictional sample product; not tested against real products" };
}
export function expandCatalogue(value) {
    assertCatalogue(value);
    const out = [];
    for (const row of value.formulas) {
        if (row.category !== "complexion") {
            out.push({ ...base(row), id: row.id, name: row.name, depth: null,
                undertone: null, swatch: OTHER_SWATCH[row.category] });
            continue;
        }
        for (let depth = 1; depth <= DEPTH_COUNT; depth += 1) {
            for (const tone of value.tones) {
                out.push({ ...base(row), id: `${row.id}-${String(depth).padStart(2, "0")}-${tone}`,
                    name: `${row.name} ${value.depths[depth - 1].replace(/(^|-)[a-z]/g, (c) => c.toUpperCase())} ${SHADE_SUFFIX[tone]}`,
                    depth, undertone: tone, swatch: shiftSwatch(value.depth_swatches[depth - 1], tone) });
            }
        }
    }
    if (new Set(out.map((row) => row.id)).size !== out.length)
        throw Error("Duplicated sample SKU");
    return out;
}
export function findProduct(catalogue, sku) {
    const item = catalogue.find((row) => row.id === sku);
    if (!item)
        throw Error("That item is not in our fictional sample catalogue.");
    return item;
}
export function nearbyShades(catalogue, sku, depth, tone, max = 8) {
    const original = findProduct(catalogue, sku);
    if (original.depth === null)
        return [];
    return catalogue.filter((p) => p.formula_id === original.formula_id && p.id !== sku &&
        p.depth !== null && Math.abs(p.depth - depth) <= 1)
        .sort((a, b) => Math.abs((a.depth ?? 0) - depth) - Math.abs((b.depth ?? 0) - depth) ||
        Number(a.undertone !== tone) - Number(b.undertone !== tone) || a.id.localeCompare(b.id))
        .slice(0, max);
}
