/** No-checkout browser bag. Items and prices are resolved only from the validated source.
 * Private to this active page; no cookies, localStorage or payment collection.
 * Author: John Khan.
 */
import { findProduct } from "./catalogue.js";
export class SampleBag {
    catalogue;
    lines = new Map();
    saved = new Set();
    version = 0;
    constructor(catalogue) {
        this.catalogue = catalogue;
    }
    snapshot() {
        const lines = [...this.lines].sort(([a], [b]) => a.localeCompare(b))
            .map(([sku, quantity]) => {
            const product = findProduct(this.catalogue, sku);
            return { product, quantity, total_cents: product.price_cents * quantity };
        });
        const subtotal = lines.reduce((total, row) => total + row.total_cents, 0);
        return { lines, wishlist: [...this.saved].sort().map((sku) => findProduct(this.catalogue, sku)),
            items: lines.reduce((n, row) => n + row.quantity, 0), subtotal_cents: subtotal, currency: "CAD",
            tax_cents: null, shipping_cents: null, total_cents: subtotal,
            total_label: "Sample subtotal only; taxes and delivery are not calculated",
            checkout_enabled: false, checkout_message: "Demo bag only. No order or payment will be taken.",
            revision: this.version };
    }
    add(sku, quantity = 1) {
        findProduct(this.catalogue, sku);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5)
            throw Error("Choose between one and five sample items.");
        const old = this.lines.get(sku) ?? 0;
        if (old + quantity > 5)
            throw Error("There is a limit of five per sample shade.");
        if (!old && this.lines.size >= 30)
            throw Error("The sample bag holds up to thirty different items.");
        this.lines.set(sku, old + quantity);
        this.version += 1;
        return this.snapshot();
    }
    remove(sku, quantity) {
        findProduct(this.catalogue, sku);
        if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 5))
            throw Error("Invalid removal amount");
        const old = this.lines.get(sku) ?? 0;
        if (!old)
            return this.snapshot();
        const remaining = old - (quantity ?? old);
        if (remaining > 0)
            this.lines.set(sku, remaining);
        else
            this.lines.delete(sku);
        this.version += 1;
        return this.snapshot();
    }
    wish(sku, enabled) {
        findProduct(this.catalogue, sku);
        if (enabled && !this.saved.has(sku) && this.saved.size >= 50)
            throw Error("Save up to fifty sample products.");
        const previous = this.saved.has(sku);
        if (enabled)
            this.saved.add(sku);
        else
            this.saved.delete(sku);
        if (previous !== enabled)
            this.version += 1;
        return this.snapshot();
    }
    clear() {
        this.lines.clear();
        this.saved.clear();
        this.version += 1;
        return this.snapshot();
    }
}
export function money(cents, locale = "en-CA") {
    if (!Number.isSafeInteger(cents) || cents < 0)
        throw Error("Invalid monetary amount");
    return new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" }).format(cents / 100);
}
//# sourceMappingURL=bag.js.map