/** No-charge, metadata-only sample bag. No checkout or inventory. Author: John Khan. */
import { cassetteById } from "./cassette-contract.js";
export class OfflineSampleBag {
    ids = new Set();
    closed = false;
    get snapshot() {
        const items = [];
        for (const id of this.ids) {
            const card = cassetteById(id);
            if (!card)
                continue;
            items.push(Object.freeze({
                id: card.id,
                category: card.productType,
                title: card.title,
                demonstrationOnly: true,
                priceKnown: false,
                purchaseAvailable: false,
            }));
        }
        return Object.freeze({
            format: "beljour-sample-bag/1",
            items: Object.freeze(items),
            totalPrice: null,
            hasCheckout: false,
            hasPayment: false,
            keepsPhotos: false,
        });
    }
    add(outcome) {
        if (this.closed || !outcome || outcome.status !== "ready" || !outcome.isCached)
            return false;
        if (outcome.providerCalls !== 0 || outcome.unitsSpent !== 0 || outcome.imageSent)
            return false;
        const card = cassetteById(outcome.card.id);
        if (!card || card !== outcome.card)
            return false;
        if (this.ids.size >= 3 && !this.ids.has(card.id))
            return false;
        this.ids.add(card.id);
        return true;
    }
    remove(id) {
        if (this.closed)
            return;
        this.ids.delete(id);
    }
    clear() {
        this.ids.clear();
    }
    dispose() {
        if (this.closed)
            return;
        this.clear();
        this.closed = true;
    }
}
/** Refuse a forged demonstration bag that implies payments or product equivalence. */
export function checkedBagSnapshot(value) {
    if (value.format !== "beljour-sample-bag/1" || value.totalPrice !== null
        || value.hasCheckout !== false || value.hasPayment !== false
        || value.keepsPhotos !== false || value.items.length > 3) {
        throw new Error("Unknown or unsafe sample bag");
    }
    const used = new Set();
    for (const item of value.items) {
        const card = cassetteById(item.id);
        if (!card || used.has(item.id) || item.category !== card.productType
            || item.title !== card.title || item.demonstrationOnly !== true
            || item.priceKnown !== false || item.purchaseAvailable !== false) {
            throw new Error("Invalid sample bag item");
        }
        used.add(item.id);
    }
    return value;
}
