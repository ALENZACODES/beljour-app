import { card } from "./catalogue.js";
function copyFixture(f) { return { photo: { ...f.photo, data: new Uint8ClampedArray(f.photo.data) }, hair: new Float32Array(f.hair), scalp: new Float32Array(f.scalp), masks: Object.fromEntries(Object.entries(f.masks).map(([k, v]) => [k, new Float32Array(v)])), geometry: { ...f.geometry } }; }
export class Session {
    next = 1;
    revision = 0;
    feature = "W19";
    style = "balanced";
    amount = .55;
    humidity = 55;
    direction = "neutral";
    level = "normal";
    fixture = null;
    result = null;
    load(f) { this.fixture = copyFixture(f); this.result = null; this.revision++; }
    select(id) { card(id); this.feature = id; this.style = card(id).styles[0] ?? ""; this.invalidate(); }
    invalidate() { this.revision++; this.result = null; }
    reasons() { const c = card(this.feature), out = []; if (c.requiresPhoto && !this.fixture)
        out.push("Open a local photo or the synthetic fixture."); if (c.requiresHair && !this.fixture?.hair)
        out.push("A local hair mask is required."); if (c.requiresSkin && !this.fixture?.masks.skin)
        out.push("A local skin mask is required."); if (c.requiresReference && !this.fixture?.masks.eye)
        out.push("Checked reference regions are required."); return out; }
    job() { if (this.reasons().length)
        throw new Error(this.reasons().join(" ")); if (!this.fixture)
        throw new Error("fixture required"); return { id: this.next++, revision: this.revision, feature: this.feature, style: this.style, amount: this.amount, fixture: copyFixture(this.fixture), humidity: this.humidity, direction: this.direction, level: this.level }; }
    complete(job, result) { if (job.revision !== this.revision || job.feature !== this.feature)
        return false; if (this.fixture && result.width === this.fixture.photo.width && result.height === this.fixture.photo.height && result.pixels.length === this.fixture.photo.data.length) {
        for (let i = 3; i < result.pixels.length; i += 4)
            if (result.pixels[i] !== this.fixture.photo.data[i])
                throw new Error("renderer changed source alpha");
    } this.result = result; return true; }
    fail(job) { if (job.revision === this.revision)
        this.result = null; }
}
//# sourceMappingURL=session.js.map