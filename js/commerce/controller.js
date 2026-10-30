/** Consent-first commerce workflow. Product names/prices are taken from the local
 * catalogue, never from a network response. Every task is bound to photo+mode+revision.
 * The optional provider is an injected capability, off by default when no proxy is
 * configured. No provider calls are needed to edit locally or use the demo bag.
 * Author: John Khan.
 */
import { SampleBag } from "./bag.js";
import { findProduct } from "./catalogue.js";
import { decodeMatch, decodeTryOn, decodeLookTryOn } from "./guards.js";
import { LookPlan } from "./look.js";
import { assertProfile, rank } from "./ranking.js";
import { CommerceNetworkError } from "./remote.js";
import { toLegacy, validateLevel } from "./strength.js";
export class ConsentRequired extends Error {
    scope;
    constructor(scope) {
        super(`Confirm photo sharing for ${scope} first. Nothing was sent.`);
        this.scope = scope;
    }
}
export class StaleCommerceTask extends Error {
    constructor() { super("The photo or processing mode changed before this task finished."); }
}
const PHOTO_ID = /^[0-9a-f]{64}$/;
const MAX_CONSENT_AGE_MS = 30 * 60 * 1000;
const DEFAULT_CAPABILITIES = {
    providerEnabled: () => true,
    allowedConcerns: new Set(["moisture", "oiliness", "redness", "texture", "wrinkles",
        "spots", "pore", "dark_circle", "acne", "radiance", "firmness"]),
};
export class CommerceController {
    catalogue;
    remote;
    media;
    clock;
    capabilities;
    consentSkin = false;
    consentMakeup = false;
    consentTime = 0;
    bag;
    generation = 0;
    photoPresent = false;
    /** Photo IDs remain deletable even when the original on-device photo is replaced. */
    uploadedIds = new Set();
    photoVersion = 0;
    state;
    constructor(catalogue, remote, media, clock = Date.now, capabilities = DEFAULT_CAPABILITIES) {
        this.catalogue = catalogue;
        this.remote = remote;
        this.media = media;
        this.clock = clock;
        this.capabilities = capabilities;
        this.bag = new SampleBag(catalogue);
        this.state = { stage: "photo", mode: "local", results: [], profile: null, selectedSku: null,
            message: "Choose a local photo or draw a synthetic illustration.", photoId: null,
            analysedBy: null, units: 0, localReason: null, bag: this.bag.snapshot(), preview: null };
    }
    resetConsent() {
        this.consentSkin = false;
        this.consentMakeup = false;
        this.consentTime = 0;
    }
    setPhoto(present) {
        this.generation += 1;
        this.photoVersion += 1;
        this.photoPresent = present;
        this.resetConsent();
        this.state = { ...this.state, stage: present ? "consent" : "photo", results: [], profile: null,
            selectedSku: null, photoId: null, analysedBy: null, preview: null, units: 0, localReason: null,
            message: present ? "Choose local editing or opt in to sharing this photo." : "Choose a photo to start." };
    }
    chooseMode(mode) {
        if (mode !== "youcam" && mode !== "local")
            throw Error("Invalid processing mode");
        this.generation += 1;
        this.resetConsent();
        this.state = { ...this.state, mode, stage: this.photoPresent ? "consent" : "photo", results: [],
            selectedSku: null, preview: null, analysedBy: null, units: 0, localReason: null,
            message: mode === "local" ? "Local only. Nothing will be uploaded." :
                "Read the consent choices before any upload." };
    }
    grant(skin, makeup) {
        const before = this.consentSkin || this.consentMakeup;
        const now = this.clock();
        this.consentSkin = skin === true;
        this.consentMakeup = makeup === true;
        const after = this.consentSkin || this.consentMakeup;
        if (!before && after)
            this.consentTime = now;
        if (!after)
            this.consentTime = 0;
    }
    hasConsent(scope) {
        const age = this.clock() - this.consentTime;
        return this.consentTime > 0 && age >= 0 && age <= MAX_CONSENT_AGE_MS &&
            (scope === "skin" ? this.consentSkin : this.consentMakeup);
    }
    attestation(scope, photoId) {
        if (!this.hasConsent(scope))
            throw new ConsentRequired(scope);
        return { version: "beljour-consent/2", scope,
            photo_id: photoId, given_at: this.consentTime };
    }
    enabled() {
        // A throwing capability check is treated as disabled; it must not cause an upload.
        try {
            return this.capabilities.providerEnabled() === true;
        }
        catch {
            return false;
        }
    }
    active(task, photoVersion) {
        return task === this.generation && photoVersion === this.photoVersion &&
            this.photoPresent && this.state.mode === "youcam" && this.enabled();
    }
    async ensurePhotoId(task, photoVersion) {
        if (!this.active(task, photoVersion))
            throw new StaleCommerceTask();
        const existing = this.state.photoId;
        if (existing)
            return existing;
        if (!this.consentSkin && !this.consentMakeup)
            throw new ConsentRequired("skin");
        const clean = await this.media.upload();
        // In particular, a mode/photo switch during canvas re-encoding must not upload.
        if (!this.active(task, photoVersion))
            throw new StaleCommerceTask();
        const response = await this.remote.upload(clean);
        if (!PHOTO_ID.test(response.photo_id))
            throw Error("The photo server returned an invalid identifier.");
        this.uploadedIds.add(response.photo_id);
        if (!this.active(task, photoVersion)) {
            // Retain the new ID for explicit deletion. No provider task may be started.
            throw new StaleCommerceTask();
        }
        this.state.photoId = response.photo_id;
        return response.photo_id;
    }
    recoverable(reason) {
        // Never repeat an ambiguous provider request. A safe fallback performs no
        // further network calls and keeps the original photo and recipe in memory.
        return reason instanceof CommerceNetworkError &&
            (reason.status === 0 || [429, 502, 503, 504].includes(reason.status));
    }
    localMatch(profile, finish, reason) {
        assertProfile(profile);
        const matches = rank(this.catalogue, profile, {}, finish);
        this.state = { ...this.state, results: matches, profile, stage: "results", units: 0,
            analysedBy: "Visitor-selected local sample shade", localReason: reason,
            message: "Local suggestions only. No face analysis or provider call happened." };
    }
    async match(profile, finish) {
        if (!this.photoPresent)
            throw Error("Choose a photo before looking at sample products.");
        assertProfile(profile);
        const task = ++this.generation;
        const photoVersion = this.photoVersion;
        this.state = { ...this.state, stage: "matching", message: "Finding fictional sample options…" };
        try {
            if (this.state.mode === "local" || !this.enabled()) {
                this.localMatch(profile, finish, this.state.mode === "local" ? "local_only" : "provider_disabled");
                return this.state;
            }
            if (!this.hasConsent("skin"))
                throw new ConsentRequired("skin");
            const photoId = await this.ensurePhotoId(task, photoVersion);
            if (!this.active(task, photoVersion))
                return this.state;
            const result = await this.remote.match({ photo_id: photoId, local_only: false,
                consent: this.attestation("skin", photoId), finish });
            if (!this.active(task, photoVersion))
                return this.state;
            // A compromised/mistaken proxy cannot add products or override display metadata.
            const verified = decodeMatch(result, this.catalogue, photoId, finish, this.capabilities.allowedConcerns);
            this.state = { ...this.state, results: verified.recommendations, profile: verified.profile,
                stage: "results", analysedBy: verified.source, localReason: verified.fallback ?? null,
                units: verified.units_spent, message: verified.message ??
                    "Fictional sample matches are ready. Every product explains its ranking." };
            return this.state;
        }
        catch (reason) {
            if (task !== this.generation || reason instanceof StaleCommerceTask)
                return this.state;
            if (this.recoverable(reason)) {
                this.localMatch(profile, finish, "provider_unavailable");
                this.state = { ...this.state,
                    message: "The optional Skin AI server is unavailable. " +
                        "Showing local manual shade suggestions instead; no provider retry." };
                return this.state;
            }
            this.state = { ...this.state, stage: "error",
                message: reason instanceof Error ? reason.message : "Could not rank the samples. Your photo remains here." };
            throw reason;
        }
    }
    /** One photo-bound, consented composite preview, with a zero-network fallback.
     * All three product selectors are fictional and reviewed in the local catalogue.
     * No new network method is exposed by the controller. The provider is optional.
     */
    async tryOnComposite(selected) {
        if (!this.photoPresent)
            throw Error("Choose a photo before combining sample colours.");
        const plan = LookPlan.make(this.catalogue, selected);
        if (!this.media.localCompositePreview)
            throw Error("Local look compositing is not installed.");
        const task = ++this.generation;
        const photoVersion = this.photoVersion;
        const mode = this.state.mode;
        const localComposite = this.media.localCompositePreview;
        let preview;
        try {
            if (mode === "local" || !this.enabled()) {
                preview = await localComposite(plan.steps);
            }
            else {
                if (!this.hasConsent("makeup"))
                    throw new ConsentRequired("makeup");
                const photoId = await this.ensurePhotoId(task, photoVersion);
                if (!this.active(task, photoVersion))
                    return this.state;
                const result = await this.remote.tryOnLook(plan.toRequest(photoId, false, this.attestation("makeup", photoId)));
                if (!this.active(task, photoVersion))
                    return this.state;
                preview = decodeLookTryOn(result, plan);
            }
            if (task === this.generation && photoVersion === this.photoVersion) {
                this.state = { ...this.state, stage: "preview", selectedSku: plan.steps[0].product.id,
                    preview, units: this.state.units + preview.units_spent,
                    localReason: mode === "youcam" && !this.enabled() ? "provider_disabled" : preview.fallback ?? null,
                    message: preview.notice };
            }
            return this.state;
        }
        catch (reason) {
            if (task !== this.generation || reason instanceof StaleCommerceTask)
                return this.state;
            if (this.recoverable(reason) && mode === "youcam") {
                preview = await localComposite(plan.steps);
                if (task !== this.generation || photoVersion !== this.photoVersion)
                    return this.state;
                this.state = { ...this.state, stage: "preview", selectedSku: plan.steps[0].product.id,
                    preview, localReason: "provider_unavailable",
                    message: "Provider unavailable; this multi-item look is a local approximation." };
                return this.state;
            }
            this.state = { ...this.state, stage: "error",
                message: reason instanceof Error ? reason.message : "Look preview unavailable. Your photo is unchanged." };
            throw reason;
        }
    }
    async tryOn(sku, strength, options = {}) {
        if (!this.photoPresent)
            throw Error("Choose a photo first.");
        const product = findProduct(this.catalogue, sku);
        if (!product.vto)
            throw Error("This sample item is not a visual try-on.");
        if (!Number.isInteger(strength) || strength < 0 || strength > 100) {
            throw Error("Choose a strength from 0 to 100.");
        }
        const task = ++this.generation;
        const photoVersion = this.photoVersion;
        const mode = this.state.mode;
        try {
            let result;
            if (mode === "local" || !this.enabled()) {
                result = await this.media.localPreview(product, strength);
            }
            else {
                if (!this.hasConsent("makeup"))
                    throw new ConsentRequired("makeup");
                const photoId = await this.ensurePhotoId(task, photoVersion);
                if (!this.active(task, photoVersion))
                    return this.state;
                const payload = await this.remote.tryOn({ photo_id: photoId, product_id: sku,
                    strength, ...(options.level !== undefined ? { level: options.level } : {}),
                    ...(options.lockLevel !== undefined ? { lock_level: options.lockLevel } : {}),
                    local_only: false, consent: this.attestation("makeup", photoId) });
                if (!this.active(task, photoVersion))
                    return this.state;
                result = decodeTryOn(payload, product);
            }
            if (task === this.generation && photoVersion === this.photoVersion) {
                this.state = { ...this.state, stage: "preview", selectedSku: sku, preview: result,
                    localReason: mode === "youcam" && !this.enabled() ? "provider_disabled" : result.fallback ?? null,
                    units: this.state.units + result.units_spent, message: result.notice };
            }
            return this.state;
        }
        catch (reason) {
            if (task !== this.generation || reason instanceof StaleCommerceTask)
                return this.state;
            if (this.recoverable(reason) && mode === "youcam") {
                const preview = await this.media.localPreview(product, strength);
                if (task !== this.generation || photoVersion !== this.photoVersion)
                    return this.state;
                this.state = { ...this.state, stage: "preview", selectedSku: sku, preview,
                    localReason: "provider_unavailable", message: "The optional makeup service is unavailable. Local approximate simulation only; no provider retry." };
                return this.state;
            }
            this.state = { ...this.state, stage: "error",
                message: reason instanceof Error ? reason.message : "Preview failed. Your photo is unchanged." };
            throw reason;
        }
    }
    /** Preferred level API. Older integer intensities are read only for migration. */
    async tryOnLevel(sku, level, lockLevel = 5.0) {
        return this.tryOn(sku, toLegacy(validateLevel(level)), { level, lockLevel: validateLevel(lockLevel) });
    }
    /** Wishlist and demo bag are browser-local, including in provider mode. */
    add(sku) { this.state.bag = this.bag.add(sku); return this.state.bag; }
    remove(sku) { this.state.bag = this.bag.remove(sku); return this.state.bag; }
    wish(sku, selected) {
        this.state.bag = this.bag.wish(sku, selected);
        return this.state.bag;
    }
    clear() { this.state.bag = this.bag.clear(); return this.state.bag; }
    /** Delete every temporary uploaded photo ID we know about, even orphaned IDs
     * from photo changes. Never claim deletion unless the backend confirms it. */
    async forgetServerPhoto() {
        const ids = [...this.uploadedIds];
        if (this.state.photoId && !this.uploadedIds.has(this.state.photoId))
            ids.push(this.state.photoId);
        if (!ids.length)
            return false;
        for (const id of ids) {
            const response = await this.remote.removePhoto(id);
            if (!response.deleted)
                throw Error("The server could not confirm this photo was deleted.");
            this.uploadedIds.delete(id);
            if (this.state.photoId === id)
                this.state.photoId = null;
        }
        this.generation += 1;
        this.resetConsent();
        this.state = { ...this.state, results: [], preview: null, selectedSku: null,
            analysedBy: null, units: 0, stage: this.photoPresent ? "consent" : "photo",
            message: "Uploaded temporary photos were deleted; your on-device image remains." };
        return true;
    }
    cancel() { this.generation += 1; }
    pendingUploadedPhotos() { return this.uploadedIds.size; }
}
//# sourceMappingURL=controller.js.map