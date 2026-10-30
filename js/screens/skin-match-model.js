export const CONSENT_VERSION = "beljour-consent/2";
export const NOT_TESTED = "not tested against real products";
export const CONSENT_TEXT = "Send this photo to YouCam for a skin analysis. YouCam deletes it after the result. Units come from this app's free allowance.";
export class ConsentMissing extends Error {
}
export function attestation(photoId, givenAt) {
    return { version: CONSENT_VERSION, scope: "skin", photo_id: photoId, given_at: givenAt };
}
function errorFields(err) {
    const e = err;
    const code = e && typeof e.code === "string" ? e.code : "error";
    const message = e && typeof e.message === "string" && e.message ? e.message : "Something went wrong. Your photo is still here; try again.";
    return { code, message };
}
export class SkinMatchController {
    transport;
    now;
    state = { kind: "idle" };
    listeners = new Set();
    constructor(transport, now = Date.now) {
        this.transport = transport;
        this.now = now;
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
    set(next) {
        this.state = next;
        for (const fn of this.listeners)
            fn(next);
        return next;
    }
    /** Open the screen for a photo. Without a photo it is an error state, not a blank page. */
    open(photoId) {
        if (!photoId)
            return this.set({ kind: "error", photoId: null, code: "photo_required", message: "Choose a photo first." });
        return this.set({ kind: "consent", photoId });
    }
    get busy() { return this.state.kind === "loading"; }
    photoId() {
        const s = this.state;
        const id = s.kind === "idle" ? null : s.photoId;
        if (!id)
            throw new RangeError("open the screen with a photo first");
        return id;
    }
    /** Send to YouCam. The consent tick is required; nothing is sent without it. */
    async analyse(answers, concerns) {
        if (this.busy)
            return this.state;
        const photoId = this.photoId();
        if (answers.agreed !== true) {
            throw new ConsentMissing("Tick the box to send this photo, or use the local estimate. Nothing was sent.");
        }
        return this.request(photoId, { photo_id: photoId, consent: attestation(photoId, this.now()), ...(concerns ? { concerns } : {}) }, "youcam");
    }
    /** Local estimate only: no consent needed, nothing is sent to YouCam. */
    async localOnly() {
        if (this.busy)
            return this.state;
        const photoId = this.photoId();
        return this.request(photoId, { photo_id: photoId, local_only: true }, "local");
    }
    async request(photoId, body, mode) {
        this.set({ kind: "loading", photoId, mode });
        try {
            const result = await this.transport.skinMatch(body);
            return this.set(result.source === "youcam" && !result.fallback
                ? { kind: "result", photoId, result } : { kind: "fallback", photoId, result });
        }
        catch (err) {
            const { code, message } = errorFields(err);
            if (code === "consent_required" || code.startsWith("consent_")) {
                return this.set({ kind: "consent", photoId });
            }
            return this.set({ kind: "error", photoId, code, message });
        }
    }
    back() {
        const s = this.state;
        return s.kind === "idle" || !s.photoId ? this.set({ kind: "idle" }) : this.set({ kind: "consent", photoId: s.photoId });
    }
}
/** Plain words for every state; the DOM renderer only lays these out. */
export function view(state) {
    const base = { title: "Skin match", message: "", tone: null, concerns: [], products: [],
        sourceLine: null, notTested: false, actions: [] };
    switch (state.kind) {
        case "idle":
            return { ...base, message: "Choose a photo to start." };
        case "consent":
            return { ...base, message: "YouCam's skin analysis looks at hydration, oil, redness and texture. Our own code measures your depth and undertone from the same photo. Tick both boxes to send the photo to YouCam, or get a local estimate that sends nothing to YouCam.", actions: ["send", "local"] };
        case "loading":
            return { ...base, message: state.mode === "youcam" ? "Analysing your photo with YouCam…" : "Measuring your photo locally…" };
        case "error":
            return { ...base, message: state.message, actions: state.photoId ? ["retry", "back"] : [] };
        case "result":
        case "fallback": {
            const r = state.result;
            const p = r.profile;
            const units = r.source === "youcam"
                ? (r.cached ? "repeat, no units used" : `${r.units_spent} unit${r.units_spent === 1 ? "" : "s"}`) : "no units used";
            return {
                ...base,
                message: state.kind === "fallback" ? (r.message ?? "Showing a local estimate from your photo.") : "Your skin analysis is ready.",
                tone: `Depth: ${p.depth_label}. Undertone: ${p.undertone_label}. (${p.source})`,
                concerns: r.concerns.map((c) => `${c.label}: ${Math.round(c.raw_score)} of 100, ${c.band}`),
                products: r.products.map((i) => ({ name: i.name, why: i.why, forWhat: i.for, label: i.label })),
                sourceLine: r.source === "youcam" ? `${r.concerns_source ?? "YouCam Skin Analysis"} · ${units}` : `Local estimate · ${units}`,
                notTested: r.label === NOT_TESTED && r.products.every((i) => i.label === NOT_TESTED),
                actions: state.kind === "fallback" && r.fallback !== "local_only" ? ["retry", "back"] : ["back"],
            };
        }
    }
}
//# sourceMappingURL=skin-match-model.js.map