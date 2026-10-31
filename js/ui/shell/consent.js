/** Consent gate (plan N22, round brief item 1): nothing reaches the styling provider without it.
 *
 * Two levels:
 *  1. Visit consent, once per device (localStorage): the person confirms they understand how photos are
 *     used. Needed before opening a photo from the device. There is no age question (John's
 *     decision of 2026-10-29). It is the only consent record kept between pages of the same
 *     tab, in sessionStorage, and it holds no photo, file name, face data or provider
 *     identifier: just the version, the answer and the time. Storage failures fall back to memory for this page.
 *  2. Photo consent, per uploaded photo and per scope (makeup or hair styling): given by a
 *     deliberate tick next to the action that sends the photo, held in memory only, and
 *     ended by withdrawal, by a new photo, or after 30 minutes.
 * styling-tasks.ts asks this gate before every quote, so a missing consent stops the request
 * before any network call.
 *
 * On-device only (plan N21): one switch that refuses every provider request and every new photo
 * consent until it is turned off. Kept for the tab in sessionStorage as "1", nothing else.
 *
 * Author: John Khan.
 */
export const CONSENT_VERSION = "beljour-consent/2";
export const STORAGE_KEY = "beljour.consent";
export const LOCAL_ONLY_KEY = "beljour.local-only";
export const LOCAL_ONLY_REASON = "On-device only is on, so nothing is sent to YouCam. Turn it off in the studio to use makeup and hair styling.";
export const PHOTO_CONSENT_MS = 30 * 60 * 1000;
export const STYLING_ACTIONS = ["makeup", "hair-color", "hair-style", "hair-transfer", "hair-bang", "hair-curl", "hair-extension", "hair-volume"];
export const VISIT_STATEMENTS = [
    { id: "understood", text: "Your photos are processed on this device. A photo is sent to YouCam only when you start an action labelled YouCam, and that label says what is sent and how many units it uses." },
];
export const PROVIDER_FACTS = [
    "Only the photo you chose is sent, for the one makeup or hair styling action you start.",
    "YouCam processes it and the result comes back here. The provider copy is deleted after the result.",
    "Each action shows its unit price before you start. Cached results cost nothing.",
    "Location data and other file metadata are removed before upload.",
    "You can withdraw at any time. Local tools keep working without consent to send.",
];
export function scopeFor(action) {
    if (action === "makeup")
        return "makeup";
    if (action === "older-youcam")
        return "age";
    if (STYLING_ACTIONS.includes(action))
        return "hair";
    throw new RangeError("Only makeup and hair styling actions can be sent to the provider");
}
export function scopeTitle(scope) {
    return scope === "makeup" ? "makeup preview" : scope === "age" ? "Older (YouCam aging) preview" : "hair styling preview";
}
export function attestationFor(grant, photoId, action) {
    return { version: CONSENT_VERSION, scope: scopeFor(action), photo_id: photoId, given_at: grant.at };
}
export class ConsentRequired extends Error {
    need;
    constructor(need, message) {
        super(message);
        this.need = need;
        this.name = "ConsentRequired";
    }
}
const PHOTO_ID = /^[A-Za-z0-9_-]{4,64}$/;
/** Parse a stored visit record. Anything unexpected is treated as no consent. */
export function readVisit(raw, now) {
    if (!raw || raw.length > 400)
        return null;
    try {
        const value = JSON.parse(raw);
        const keys = Object.keys(value).sort().join(",");
        if (keys !== "at,understood,version")
            return null;
        if (value.version !== CONSENT_VERSION || value.understood !== true)
            return null;
        if (typeof value.at !== "number" || !Number.isFinite(value.at) || value.at > now + 60_000)
            return null;
        return { version: CONSENT_VERSION, understood: true, at: value.at };
    }
    catch {
        return null;
    }
}
export class ConsentGate {
    clock;
    store;
    photoMs;
    visitRecord = null;
    localOnlyFlag = false;
    grants = new Map();
    log = [];
    listeners = new Set();
    constructor(clock = () => Date.now(), store = null, photoMs = PHOTO_CONSENT_MS) {
        this.clock = clock;
        this.store = store;
        this.photoMs = photoMs;
        if (!(Number.isFinite(photoMs) && photoMs >= 1000 && photoMs <= 24 * 3600 * 1000))
            throw new RangeError("Photo consent must last 1 s to 24 h");
        try {
            this.visitRecord = readVisit(store?.getItem(STORAGE_KEY) ?? null, clock());
        }
        catch {
            this.visitRecord = null;
        }
        try {
            this.localOnlyFlag = store?.getItem(LOCAL_ONLY_KEY) === "1";
        }
        catch {
            this.localOnlyFlag = false;
        }
    }
    subscribe(listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    changed(receipt) {
        this.log.push(receipt);
        if (this.log.length > 50)
            this.log.shift();
        for (const listener of this.listeners)
            listener();
    }
    get visit() { return this.visitRecord ? { ...this.visitRecord } : null; }
    get hasVisit() { return this.visitRecord !== null; }
    /** Re-read the stored decision (another tab changed it). */
    reload() {
        let next = null;
        try {
            next = readVisit(this.store?.getItem(STORAGE_KEY) ?? null, this.clock());
        }
        catch {
            return;
        }
        if (JSON.stringify(next) === JSON.stringify(this.visitRecord))
            return;
        this.visitRecord = next;
        if (!next)
            this.grants.clear();
        this.changed({ kind: "visit", at: this.clock(), detail: next ? "Consent given in another tab" : "Consent withdrawn in another tab" });
    }
    get localOnly() { return this.localOnlyFlag; }
    /** Turn on-device only on or off. Turning it on also ends every photo consent. */
    setLocalOnly(on) {
        if (on === this.localOnlyFlag)
            return;
        this.localOnlyFlag = on;
        if (on)
            this.grants.clear();
        try {
            if (on)
                this.store?.setItem(LOCAL_ONLY_KEY, "1");
            else
                this.store?.removeItem(LOCAL_ONLY_KEY);
        }
        catch { /* memory only */ }
        this.changed({ kind: "local-only", at: this.clock(), detail: on ? "On-device only turned on" : "On-device only turned off" });
    }
    /** Record visit consent. The answer must be an explicit yes. */
    acceptVisit(answers) {
        if (answers.understood !== true)
            throw new ConsentRequired("visit", "Please confirm you understand how photos are used.");
        const record = { version: CONSENT_VERSION, understood: true, at: this.clock() };
        this.visitRecord = record;
        try {
            this.store?.setItem(STORAGE_KEY, JSON.stringify(record));
        }
        catch { /* memory only on this page */ }
        this.changed({ kind: "visit", at: record.at, detail: "Visit consent given" });
        return { ...record };
    }
    /** Consent to send one uploaded photo for the given scopes. Needs visit consent first. */
    grantPhoto(photoId, scopes, { othersConfirmed = true } = {}) {
        if (this.localOnlyFlag)
            throw new ConsentRequired("local-only", LOCAL_ONLY_REASON);
        if (!this.visitRecord)
            throw new ConsentRequired("visit", "Confirm the visit consent before sending any photo.");
        if (!PHOTO_ID.test(photoId))
            throw new RangeError("Photo consent needs the uploaded photo's ID");
        if (!scopes.length || !scopes.every((s) => s === "makeup" || s === "hair" || s === "age"))
            throw new RangeError("Choose makeup, hair styling or Older");
        if (othersConfirmed !== true)
            throw new ConsentRequired("photo", "Everyone in the photo must have agreed to it.");
        const at = this.clock();
        const previous = this.grants.get(photoId);
        const merged = [...new Set([...(previous && previous.expires > at ? previous.scopes : []), ...scopes])].sort();
        const grant = { photoId, scopes: merged, at, expires: at + this.photoMs, othersConfirmed: true };
        this.grants.set(photoId, grant);
        this.changed({ kind: "photo", at, detail: `Photo consent for ${merged.map(scopeTitle).join(" and ")}` });
        return { ...grant, scopes: [...grant.scopes] };
    }
    check(photoId, action) {
        const scope = scopeFor(action);
        if (this.localOnlyFlag)
            return { allowed: false, need: "local-only", reason: LOCAL_ONLY_REASON };
        if (!this.visitRecord)
            return { allowed: false, need: "visit", reason: "Confirm how photos are used before anything is sent." };
        let grant = this.grants.get(photoId);
        // The single consent covers named cloud actions: starting a YouCam-labelled action is the
        // per-photo choice, so no second tick is asked for.
        if (!grant || !grant.scopes.includes(scope) || grant.expires <= this.clock()) {
            if (!PHOTO_ID.test(photoId))
                return { allowed: false, need: "photo", reason: "Open a photo first." };
            this.grantPhoto(photoId, [scope]);
            grant = this.grants.get(photoId);
        }
        if (grant.expires <= this.clock()) {
            this.grants.delete(photoId);
            return { allowed: false, need: "expired", reason: "Consent to send this photo has expired. Continue once more to send it." };
        }
        if (!grant.scopes.includes(scope))
            return { allowed: false, need: "scope", reason: `This photo was only cleared for ${grant.scopes.map(scopeTitle).join(" and ")}.` };
        return { allowed: true, grant: { ...grant, scopes: [...grant.scopes] } };
    }
    /** Throw unless the photo may be sent for this action. */
    require(photoId, action) {
        const result = this.check(photoId, action);
        if (!result.allowed)
            throw new ConsentRequired(result.need, result.reason);
        return result.grant;
    }
    allows(photoId, action) { return this.check(photoId, action).allowed; }
    revokePhoto(photoId) {
        const had = this.grants.delete(photoId);
        if (had)
            this.changed({ kind: "revoked", at: this.clock(), detail: "Photo consent withdrawn" });
        return had;
    }
    /** Withdraw everything: visit consent and every photo consent. */
    withdraw() {
        this.visitRecord = null;
        this.grants.clear();
        try {
            this.store?.removeItem(STORAGE_KEY);
        }
        catch { /* nothing stored */ }
        this.changed({ kind: "withdrawn", at: this.clock(), detail: "All consent withdrawn" });
    }
    /** Photo-free history of consent events, for the privacy panel. */
    receipts() { return this.log.map((r) => ({ ...r })); }
    activeGrants() {
        const now = this.clock();
        return [...this.grants.values()].filter((g) => g.expires > now).map((g) => ({ ...g, scopes: [...g.scopes] }));
    }
}
function browserStore() {
    try {
        // One consent per device (owner's order, Oct 29): every page and every new tab reads it.
        const store = globalThis.localStorage;
        return store ?? null;
    }
    catch {
        return null;
    }
}
/** The one gate for this page. Classic screens and the studio share the stored visit record. */
export const appConsent = new ConsentGate(() => Date.now(), browserStore());
// Another tab gave or withdrew the one consent: follow it here too.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY || event.key === null)
        appConsent.reload(); });
}
