const ORDER = { foundation: 0, blush: 1, lip: 2 };
const RECIPE_FORMAT = "beljour-sample-look/1";
const MAX_JSON_BYTES = 2048;
function validateStrength(strength) {
    if (!Number.isSafeInteger(strength) || strength < 0 || strength > 100) {
        throw new RangeError("Effect strength must be an integer 0..100.");
    }
}
function effectFor(product) {
    if (product.vto === "foundation" || product.vto === "blush" || product.vto === "lip")
        return product.vto;
    throw Error("This fictional sample has no cosmetic try-on effect.");
}
function requireProduct(catalogue, id) {
    const product = catalogue.find((item) => item.id === id);
    if (!product)
        throw Error("The saved sample item does not belong to this catalogue.");
    if (!product.sample || product.currency !== "CAD")
        throw Error("The sample provenance changed.");
    effectFor(product);
    return product;
}
function record(raw) {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object")
        throw Error("Invalid look recipe.");
    return raw;
}
function distinctEffects(steps) {
    if (steps.length < 1 || steps.length > 3)
        throw Error("Choose one to three different cosmetic types.");
    const effects = steps.map((step) => step.effect);
    if (effects.length !== new Set(effects).size)
        throw Error("Choose at most one item per cosmetic type.");
    if (steps.some((step, i) => i > 0 && ORDER[step.effect] < ORDER[steps[i - 1].effect])) {
        throw Error("Look effects must be ordered foundation, cheek, lip.");
    }
}
export class LookPlan {
    steps;
    constructor(steps) {
        distinctEffects(steps);
        for (const item of steps) {
            validateStrength(item.strength);
            if (effectFor(item.product) !== item.effect)
                throw Error("Look effect and product disagree.");
        }
        this.steps = Object.freeze(steps.map((step) => Object.freeze({ ...step })));
    }
    static make(catalogue, selection) {
        if (!Array.isArray(selection) || selection.length === 0 || selection.length > 3) {
            throw Error("Choose between one and three fictional samples.");
        }
        const steps = selection.map(({ product_id, strength }) => {
            if (typeof product_id !== "string" || product_id.length > 80)
                throw Error("Invalid sample ID.");
            validateStrength(strength);
            const product = requireProduct(catalogue, product_id);
            return { product, strength, effect: effectFor(product) };
        }).sort((a, b) => ORDER[a.effect] - ORDER[b.effect]);
        return new LookPlan(steps);
    }
    get subtotalCents() {
        return this.steps.reduce((sum, step) => sum + step.product.price_cents, 0);
    }
    public() {
        return { format: RECIPE_FORMAT,
            steps: this.steps.map((step) => ({ product_id: step.product.id,
                strength: step.strength, effect: step.effect, swatch: step.product.swatch,
                price_cents: step.product.price_cents, sample: true })),
            currency: "CAD", total_cents: this.subtotalCents, checkout_enabled: false,
            photo_included: false, credentials_included: false,
            notice: "Fictional sample cosmetics. Visual simulation only; no product testing or checkout." };
    }
    toRequest(photo_id, local_only, consent) {
        if (!/^[0-9a-f]{64}$/.test(photo_id))
            throw Error("Invalid temporary server photo reference.");
        return { photo_id, local_only, steps: this.steps.map(({ product, strength }) => ({ product_id: product.id, strength })),
            ...(consent ? { consent } : {}) };
    }
    exportRecipe() {
        const json = JSON.stringify({ format: RECIPE_FORMAT,
            steps: this.steps.map(({ product, strength }) => ({ product_id: product.id, strength })) });
        if (new TextEncoder().encode(json).length > MAX_JSON_BYTES)
            throw Error("Recipe too large to share.");
        return json;
    }
    static importRecipe(catalogue, text) {
        if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_JSON_BYTES) {
            throw Error("Imported look recipe is too large.");
        }
        let raw;
        try {
            raw = record(JSON.parse(text));
        }
        catch {
            throw Error("The imported sample recipe is not valid JSON.");
        }
        if (raw.format !== RECIPE_FORMAT || Object.keys(raw).sort().join() !== "format,steps" || !Array.isArray(raw.steps)) {
            throw Error("Unsupported sample recipe version or fields.");
        }
        const parsed = raw.steps.map((item) => {
            const value = record(item);
            if (Object.keys(value).sort().join() !== "product_id,strength" ||
                typeof value.product_id !== "string" || typeof value.strength !== "number") {
                throw Error("The sample recipe has an unsupported adjustment.");
            }
            return { product_id: value.product_id, strength: value.strength };
        });
        return LookPlan.make(catalogue, parsed);
    }
}
export class LookShelf {
    catalogue;
    byEffect = new Map();
    revision = 0;
    constructor(catalogue) {
        this.catalogue = catalogue;
    }
    get version() { return this.revision; }
    get empty() { return this.byEffect.size === 0; }
    add(productId, strength = 45) {
        validateStrength(strength);
        const product = requireProduct(this.catalogue, productId);
        const effect = effectFor(product);
        const prior = this.byEffect.get(effect);
        if (prior?.product.id === product.id && prior.strength === strength)
            return;
        this.byEffect.set(effect, { product, strength, effect });
        this.revision += 1;
    }
    remove(effect) {
        if (!(effect in ORDER))
            throw Error("Invalid look slot.");
        if (this.byEffect.delete(effect))
            this.revision += 1;
    }
    clear() {
        if (this.byEffect.size) {
            this.byEffect.clear();
            this.revision += 1;
        }
    }
    import(text) {
        // Validate atomically: malformed imports leave an existing shelf untouched.
        const next = LookPlan.importRecipe(this.catalogue, text);
        this.byEffect.clear();
        for (const step of next.steps)
            this.byEffect.set(step.effect, step);
        this.revision += 1;
        return next;
    }
    plan() {
        return new LookPlan([...this.byEffect.values()].sort((a, b) => ORDER[a.effect] - ORDER[b.effect]));
    }
    list() {
        return [...this.byEffect.values()].sort((a, b) => ORDER[a.effect] - ORDER[b.effect]);
    }
}
