import { NO_INPUTS, checkStrength, copyFrame } from "./frames.js";
export function mirrored(image) {
    const out = copyFrame(image), { width: w, height: h, channels: c } = image;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const from = (y * w + (w - 1 - x)) * c, to = (y * w + x) * c;
            for (let k = 0; k < c; k++)
                out.data[to + k] = image.data[from + k];
        }
    return out;
}
export class LiveMirror {
    deps;
    effect;
    needs;
    strength;
    state = "off";
    stream = null;
    loop = null;
    current = null;
    inputs = NO_INPUTS;
    measuring = false;
    generation = 0;
    lastT = -1;
    framesShown = 0;
    constructor(deps, effect = null, needs = { face: false, person: false }, strength = 60) {
        this.deps = deps;
        this.effect = effect;
        this.needs = needs;
        this.strength = strength;
    }
    setEffect(effect, needs, strength) {
        checkStrength(strength);
        this.effect?.reset();
        this.effect = effect;
        this.needs = needs;
        this.strength = strength;
        this.inputs = NO_INPUTS;
    }
    async start(cameraConsent) {
        if (cameraConsent !== true)
            return { started: false, reason: "camera_consent" };
        if (this.state !== "off")
            return { started: false, reason: "busy" };
        const own = ++this.generation;
        this.state = "starting";
        let stream;
        try {
            stream = await this.deps.getCamera();
        }
        catch {
            if (own === this.generation)
                this.state = "off";
            return { started: false, reason: "camera_unavailable" };
        }
        if (own !== this.generation) {
            stream.getTracks().forEach((track) => track.stop());
            return { started: false, reason: "busy" };
        }
        this.stream = stream;
        this.state = "on";
        this.loop = this.deps.schedule(() => this.tick(own));
        return { started: true };
    }
    /** One frame: grab, process with the latest measurements, mirror and paint. */
    tick(own = this.generation) {
        if (own !== this.generation || this.state !== "on")
            return;
        const frame = this.deps.grab();
        if (frame) {
            let t = this.deps.now();
            if (t <= this.lastT)
                t = this.lastT + 1e-3;
            this.lastT = t;
            const needs = this.needs;
            if (this.effect && (needs.face || needs.person) && !this.measuring) {
                this.measuring = true;
                this.deps.measure(frame, needs).then((inputs) => { if (own === this.generation)
                    this.inputs = inputs; })
                    .catch(() => { if (own === this.generation)
                    this.inputs = NO_INPUTS; })
                    .finally(() => { this.measuring = false; });
            }
            const inputs = this.inputs.person && this.inputs.person.length !== frame.width * frame.height ? NO_INPUTS : this.inputs;
            const shown = this.effect ? this.effect.apply({ image: frame, t }, inputs, this.strength).image : copyFrame(frame);
            this.current = shown;
            this.deps.paint(mirrored(shown));
            this.framesShown++;
        }
        this.loop = this.deps.schedule(() => this.tick(own));
    }
    /** A copy of the current processed frame, only when she taps save. */
    saveFrame() { return this.current ? copyFrame(this.current) : null; }
    /** How many frames the mirror holds right now (0 or 1). */
    framesHeld() { return this.current ? 1 : 0; }
    stop() {
        this.generation++;
        if (this.loop !== null)
            this.deps.cancel(this.loop);
        this.loop = null;
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.current = null;
        this.inputs = NO_INPUTS;
        this.state = "off";
        this.lastT = -1;
        this.effect?.reset();
    }
}
