/** Untrusted API boundary for optional consented cosmetic matching and try-on.
 * Never render product names, prices, reasons or colours from the provider response.
 * All displayed recommendation content is reconstructed from our own catalogue.
 * The provider can supply only bounded cosmetic scores and measured class metadata.
 * This also keeps an incorrectly configured proxy from introducing brand names.
 * Author: John Khan.
 */
import { findProduct } from "./catalogue.js";
import { assertProfile, rank } from "./ranking.js";
const HASH = /^[0-9a-f]{64}$/;
const MIME = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_RESULT_LENGTH = 18_000_000;
const SOURCES = new Set(["local", "youcam", "manual"]);
const FINITE_COUNTER_MAX = 100_000;
const ID = /^[a-z][a-z0-9-]{2,79}$/;
export class InvalidCommerceResponse extends Error {
    field;
    constructor(field) {
        super("The cosmetic service returned an invalid " + field + ". Your photo is unchanged.");
        this.field = field;
    }
}
function record(value, field) {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
        throw new InvalidCommerceResponse(field);
    }
    return value;
}
function boundedInteger(value, field, max = FINITE_COUNTER_MAX) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
        throw new InvalidCommerceResponse(field);
    }
    return value;
}
function optionalReason(value) {
    if (value == null)
        return null;
    if (typeof value !== "string" || value.length > 80 || !/^[a-z0-9_ -]*$/i.test(value)) {
        throw new InvalidCommerceResponse("fallback code");
    }
    return value;
}
function stringEnum(value, options, field) {
    if (typeof value !== "string" || !options.has(value))
        throw new InvalidCommerceResponse(field);
    return value;
}
function responseProfile(raw) {
    const value = record(raw, "shade profile");
    const evidence = value.evidence;
    if (typeof evidence !== "string" || evidence.length > 160) {
        throw new InvalidCommerceResponse("profile provenance");
    }
    const profile = {
        depth: value.depth, undertone: value.undertone,
        confidence: value.confidence, evidence,
        lightness: value.lightness,
    };
    try {
        assertProfile(profile);
    }
    catch {
        throw new InvalidCommerceResponse("shade profile");
    }
    return profile;
}
export function cosmeticScores(raw, allowed) {
    const values = record(raw, "cosmetic scores");
    const keys = Object.keys(values);
    if (keys.length > 32)
        throw new InvalidCommerceResponse("cosmetic score count");
    const scores = Object.create(null);
    for (const key of keys) {
        if (!allowed.has(key) || typeof values[key] !== "number" || !Number.isInteger(values[key]) ||
            values[key] < 0 || values[key] > 100) {
            throw new InvalidCommerceResponse("cosmetic score");
        }
        scores[key] = values[key];
    }
    return scores;
}
function validateReturnedProduct(raw, catalogue) {
    const value = record(raw, "sample product");
    if (typeof value.id !== "string" || !ID.test(value.id))
        throw new InvalidCommerceResponse("sample SKU");
    let product;
    try {
        product = findProduct(catalogue, value.id);
    }
    catch {
        throw new InvalidCommerceResponse("unlisted product");
    }
    for (const field of ["name", "formula_id", "price_cents", "swatch", "category", "finish", "vto"]) {
        if (value[field] !== product[field])
            throw new InvalidCommerceResponse("sample catalogue integrity");
    }
    if (value.sample !== true || value.currency !== "CAD")
        throw new InvalidCommerceResponse("sample provenance");
}
/** Only local original product metadata, never provider-supplied copy, reaches the view. */
export function decodeMatch(raw, catalogue, photoId, finish, allowedConcerns) {
    const response = record(raw, "matching response");
    if (!HASH.test(photoId) || response.photo_id !== photoId)
        throw new InvalidCommerceResponse("photo binding");
    const source = stringEnum(response.source, SOURCES, "analysis source");
    const units = boundedInteger(response.units_spent, "provider units", 1000);
    if (typeof response.cached !== "boolean")
        throw new InvalidCommerceResponse("cache flag");
    if ((source !== "youcam" || response.cached) && units !== 0)
        throw new InvalidCommerceResponse("provider accounting");
    const profile = responseProfile(response.profile);
    const scores = cosmeticScores(response.cosmetic_concerns, allowedConcerns);
    if (source !== "youcam" && Object.keys(scores).length !== 0) {
        throw new InvalidCommerceResponse("local scores attributed to a provider");
    }
    if (!Array.isArray(response.recommendations) || response.recommendations.length > 16) {
        throw new InvalidCommerceResponse("product ranking");
    }
    const seen = new Set();
    for (const row of response.recommendations) {
        const recommendation = record(row, "recommendation");
        validateReturnedProduct(recommendation.product, catalogue);
        const p = recommendation.product;
        if (seen.has(p.id))
            throw new InvalidCommerceResponse("duplicate recommendation");
        seen.add(p.id);
    }
    const canonical = rank(catalogue, profile, scores, finish);
    if (canonical.length !== response.recommendations.length ||
        canonical.some((item, index) => item.product.id !==
            response.recommendations[index].product.id)) {
        throw new InvalidCommerceResponse("ranking parity");
    }
    const fallback = optionalReason(response.fallback);
    const message = typeof response.message === "string" && response.message.length <= 220
        ? response.message : null;
    return {
        photo_id: photoId, source, fallback, message, units_spent: units, cached: response.cached,
        profile, cosmetic_concerns: scores, recommendations: canonical,
        note: "Fictional sample colours only; no real product has been shade tested.",
    };
}
export function validateImageDataUrl(value) {
    if (typeof value !== "string" || value.length < 80 || value.length > MAX_RESULT_LENGTH) {
        throw new InvalidCommerceResponse("preview image size");
    }
    const match = MIME.exec(value);
    if (!match || match[1].length % 4 === 1)
        throw new InvalidCommerceResponse("preview image encoding");
    return value;
}
/** Bind preview response to the precise original product and expected image type. */
export function decodeTryOn(raw, product) {
    const response = record(raw, "virtual try-on");
    if (!product.vto)
        throw new InvalidCommerceResponse("unsupported sample effect");
    validateReturnedProduct(response.product, [product]);
    if (response.simulation !== true)
        throw new InvalidCommerceResponse("simulation label");
    const source = stringEnum(response.source, new Set(["local", "youcam"]), "preview source");
    const image = validateImageDataUrl(response.image);
    const units = boundedInteger(response.units_spent, "preview unit count", 1000);
    const providerCalls = boundedInteger(response.provider_calls, "provider call count", 1);
    if (typeof response.cached !== "boolean" ||
        (source === "local" && (units !== 0 || providerCalls !== 0 || response.cached)) ||
        (response.cached && (units !== 0 || providerCalls !== 0))) {
        throw new InvalidCommerceResponse("provider accounting");
    }
    const mime = (image.slice(5, image.indexOf(";"))).toLowerCase();
    if (response.image_type && response.image_type !== mime)
        throw new InvalidCommerceResponse("image MIME");
    const fallback = optionalReason(response.fallback);
    return {
        image, source: source, simulation: true, units_spent: units,
        provider_calls: providerCalls, cached: response.cached, product,
        notice: source === "local"
            ? "Approximate locally placed cosmetic colour, not a product test or face-tracked result."
            : "YouCam makeup simulation. This is not a physical product test.",
        label: source === "local" ? "Local simulation" : "YouCam makeup VTO simulation",
        fallback,
    };
}
/** R19 composite response validation. Trust only the local sample catalogue and
 * the photo-bound, consent-checked controller. A provider may return pixels but
 * cannot change selected product identity, prices, stage order or quantities.
 */
export function decodeLookTryOn(raw, plan) {
    const row = record(raw, "combined cosmetic preview");
    const base = decodeTryOn(row, plan.steps[0].product);
    if (row.checkout_enabled !== false ||
        !Array.isArray(row.products) || row.products.length !== plan.steps.length ||
        !Array.isArray(row.steps) || row.steps.length !== plan.steps.length) {
        throw new InvalidCommerceResponse("look effects or checkout label");
    }
    if (row.sample_subtotal_cents !== plan.subtotalCents) {
        throw new InvalidCommerceResponse("look total");
    }
    for (let i = 0; i < plan.steps.length; i += 1) {
        const expected = plan.steps[i];
        validateReturnedProduct(row.products[i], [expected.product]);
        const step = record(row.steps[i], "look step");
        if (step.product_id !== expected.product.id || step.effect !== expected.effect ||
            step.strength !== expected.strength || step.swatch !== expected.product.swatch) {
            throw new InvalidCommerceResponse("look step provenance");
        }
    }
    return { ...base,
        products: plan.steps.map((s) => s.product),
        steps: plan.steps.map((s) => ({ product_id: s.product.id, strength: s.strength,
            effect: s.effect, swatch: s.product.swatch })),
        checkout_enabled: false,
        sample_subtotal_cents: plan.subtotalCents,
    };
}
