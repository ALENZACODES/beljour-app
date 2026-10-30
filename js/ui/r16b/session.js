/** Revision-safe R16B studio session. Author: John Khan. */
import { card } from "./catalogue.js";
export class Session {
    imageValue = null;
    rev = 0;
    active = null;
    resultValue = null;
    feature = "W45";
    amount = .35;
    style = card("W45").styles[0] ?? "";
    landmarks = null;
    regions = [];
    diary_values = [.25, .3, .4, .35, .28];
    health_consent = false;
    get image() { return this.imageValue ? { ...this.imageValue, data: this.imageValue.data.slice() } : null; }
    get result() { return this.resultValue ? { ...this.resultValue, pixels: this.resultValue.pixels.slice(), warnings: [...this.resultValue.warnings], metrics: structuredClone(this.resultValue.metrics) } : null; }
    get version() { return this.rev; }
    load(i, landmarks = null) {
        if (i.channels !== 4 || i.data.length !== i.width * i.height * 4)
            throw new RangeError("invalid image");
        this.imageValue = { ...i, data: i.data.slice() };
        this.landmarks = landmarks?.map(p => [p[0], p[1]]) ?? null;
        this.regions = [];
        this.health_consent = false;
        this.invalidate();
    }
    select(id) { const c = card(id); this.feature = id; this.style = c.styles[0] ?? ""; this.regions = []; this.invalidate(); }
    setRegion(name, points) {
        if (points.length < 3)
            throw new RangeError("region needs at least 3 points");
        this.regions = [...this.regions.filter(r => r.name !== name), { name, points: points.map(p => [p[0], p[1]]) }];
        this.invalidate();
    }
    clearRegions() { this.regions = []; this.invalidate(); }
    invalidate() { this.rev++; this.active = null; this.resultValue = null; }
    reasons() {
        const c = card(this.feature), r = [];
        if (!this.imageValue)
            r.push("Open a local photo or fixture.");
        if (c.mesh && !this.landmarks)
            r.push("Checked face points are required.");
        if (c.region && this.regions.length === 0)
            r.push("Mark a local region for this feature.");
        if (this.feature === "W83" && !this.health_consent)
            r.push("Confirm local health-data diary consent.");
        return r;
    }
    job() {
        const reasons = this.reasons();
        if (reasons.length || !this.imageValue)
            throw new RangeError(reasons.join(" "));
        const id = ++this.rev;
        this.active = id;
        return { id, image: { ...this.imageValue, data: this.imageValue.data.slice() }, feature: this.feature, amount: this.amount, style: this.style, landmarks: this.landmarks, regions: structuredClone(this.regions), diary_values: [...this.diary_values], health_consent: this.health_consent };
    }
    complete(id, r) {
        if (this.active !== id || this.rev !== id || !this.imageValue)
            return false;
        if (r.pixels.length !== this.imageValue.data.length || !/simulation|preview|consultation|cosmetic/i.test(r.label))
            throw new RangeError("invalid labelled result");
        for (let i = 3; i < r.pixels.length; i += 4)
            if (r.pixels[i] !== this.imageValue.data[i])
                throw new RangeError("alpha changed");
        this.resultValue = { ...r, pixels: r.pixels.slice(), warnings: [...r.warnings], metrics: structuredClone(r.metrics) };
        this.active = null;
        return true;
    }
    fail(id) {
        if (this.active !== id)
            return false;
        this.active = null;
        return true;
    }
}
//# sourceMappingURL=session.js.map