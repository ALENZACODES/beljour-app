/** R23d requested identity protection. The Workstream H engine is not yet integrated.
 * This typed client boundary must not be mistaken for an identity-quality gate.
 */
import { parseVisibleStrength } from "./strength-scale.js";
/** No code here turns off identity lock or guesses identity from image pixels. */
export class IdentityLockController {
    looseness = 1.0;
    adapter;
    constructor(adapter = null) {
        this.adapter = adapter;
    }
    get snapshot() {
        return {
            requested: true,
            status: this.adapter ? "enforced" : "not-connected",
            looseness: this.looseness,
            label: this.adapter ? "Identity lock on" : "Identity lock requested; engine pending",
            safeToClaimProtected: this.adapter !== null,
        };
    }
    /** Fine adjustment is intentionally not a boolean ON/OFF switch. */
    tune(value) {
        this.looseness = parseVisibleStrength(value);
        return this.snapshot;
    }
    evaluate(family, photoRevision, strength) {
        if (!family || !photoRevision)
            throw new RangeError("Edit and photo revision required");
        const request = {
            family,
            photoRevision,
            strength: parseVisibleStrength(strength),
            looseness: this.looseness,
            requested: true,
        };
        if (!this.adapter)
            return {
                requested: true,
                status: "not-connected",
                safeToClaimProtected: false,
                reason: "Identity engine pending. This view cannot verify identity preservation.",
            };
        const answer = this.adapter.evaluate(request);
        if (!answer.requested || answer.status !== "enforced" || !answer.safeToClaimProtected) {
            return {
                requested: true,
                status: "not-connected",
                safeToClaimProtected: false,
                reason: "Identity engine did not certify the request.",
            };
        }
        return answer;
    }
    reset() {
        this.looseness = 1.0;
    }
}
/** For synthetic Judge Mode tests only. Never reports that protection was enforced. */
export function mockIdentityLock() {
    return new IdentityLockController(null);
}
