/** Revision-safe local preview state. No storage or network. Author: John Khan. */
import { featureById, unavailableReasons } from "./catalogue.js";
import { cloneImage, validateAnatomy, validateLandmarks } from "./input.js";
import { Observations } from "./observations.js";
export class PreviewSession {
    source = null;
    mesh = null;
    revision = 0;
    active = null;
    resultValue = null;
    featureValue = "W59";
    styleValue = featureById("W59").choices[0].value;
    amountValue = 0.35;
    angleValue = 0;
    anatomyValue = { right: "open", left: "open" };
    controlsValue = {};
    observations = null;
    synthetic = false;
    get hasPhoto() { return this.source !== null; }
    get hasMesh() { return this.mesh !== null; }
    get feature() { return this.featureValue; }
    get style() { return this.styleValue; }
    get amount() { return this.amountValue; }
    get angle() { return this.angleValue; }
    get anatomy() { return { ...this.anatomyValue }; }
    get running() { return this.active !== null; }
    get version() { return this.revision; }
    get image() { return this.source ? cloneImage(this.source) : null; }
    get landmarks() { return this.mesh?.map(point => [...point]) ?? null; }
    get result() {
        return this.resultValue ? { ...this.resultValue, pixels: this.resultValue.pixels.slice(),
            warnings: [...this.resultValue.warnings], metrics: structuredClone(this.resultValue.metrics) } : null;
    }
    load(image, synthetic = false) {
        const checked = cloneImage(image);
        this.source = checked;
        this.mesh = null;
        this.synthetic = synthetic;
        this.observations = new Observations(image.width, image.height);
        this.controlsValue = {};
        this.anatomyValue = { right: "open", left: "open" };
        this.invalidate();
    }
    clear() {
        this.source = null;
        this.mesh = null;
        this.observations = null;
        this.synthetic = false;
        this.controlsValue = {};
        this.invalidate();
    }
    setMesh(mesh) {
        if (!this.source)
            throw new RangeError("Open a photo before checking face points.");
        this.mesh = validateLandmarks(mesh);
        this.invalidate();
    }
    importEvidence(data) {
        if (!this.source || data.width !== this.source.width || data.height !== this.source.height)
            throw new RangeError("Open the matching photo first.");
        const mesh = validateLandmarks(data.landmarks);
        const observations = new Observations(this.source.width, this.source.height);
        if (data.hair_mask)
            observations.setHair(data.hair_mask);
        if (data.observed_lashes)
            observations.setTraces(data.observed_lashes);
        const anatomy = data.anatomy ? validateAnatomy(data.anatomy) : this.anatomyValue;
        this.mesh = mesh;
        this.observations = observations;
        this.anatomyValue = anatomy;
        this.invalidate();
    }
    select(id) {
        const item = featureById(id);
        this.featureValue = item.id;
        this.styleValue = item.choices[0]?.value ?? "";
        this.controlsValue = {};
        this.angleValue = 0;
        this.invalidate();
    }
    setStyle(style) {
        const choices = featureById(this.featureValue).choices;
        if (!choices.some(choice => choice.value === style))
            throw new RangeError("That style is not available for this feature.");
        this.styleValue = style;
        this.invalidate();
    }
    setAmount(amount) {
        if (!Number.isFinite(amount) || amount < 0 || amount > 1)
            throw new RangeError("Amount must be in 0..1.");
        this.amountValue = amount;
        this.invalidate();
    }
    setAngle(angle) {
        if (!Number.isFinite(angle) || angle < -80 || angle > 80)
            throw new RangeError("Light angle must be in -80..80 degrees.");
        this.angleValue = angle;
        this.invalidate();
    }
    setAnatomy(side, value) {
        if (side !== "right" && side !== "left")
            throw new RangeError("Unknown eye side.");
        this.anatomyValue = validateAnatomy({ ...this.anatomyValue, [side]: value });
        this.invalidate();
    }
    setControl(key, value) {
        if (!/^[a-z][a-zA-Z_]{0,39}$/.test(key) || ["constructor", "prototype"].includes(key))
            throw new RangeError("Invalid control name.");
        if (typeof value === "number" && !Number.isFinite(value))
            throw new RangeError("Control values must be finite.");
        if (typeof value === "string" && value.length > 80)
            throw new RangeError("Control text is too long.");
        this.controlsValue = { ...this.controlsValue, [key]: value };
        this.invalidate();
    }
    invalidate() {
        this.revision++;
        this.active = null;
        this.resultValue = null;
    }
    reasons() {
        return unavailableReasons(this.featureValue, { photo: this.hasPhoto, mesh: this.hasMesh,
            hair: this.observations?.hairDeclared ?? false, traces: this.observations?.count ?? 0 });
    }
    job() {
        const reasons = this.reasons();
        if (reasons.length || !this.source)
            throw new RangeError(reasons.join(" ") || "Open a photo first.");
        const id = ++this.revision;
        this.active = id;
        return { id, image: cloneImage(this.source), landmarks: this.landmarks, feature: this.featureValue,
            amount: this.amountValue, style: this.styleValue, angle: this.angleValue,
            anatomy: this.anatomy, hairMask: this.observations?.hairDeclared ? this.observations.mask : null,
            lashes: this.observations?.traces ?? [], controls: { ...this.controlsValue } };
    }
    complete(id, result) {
        if (this.active !== id || this.revision !== id || !this.source)
            return false;
        if (!(result.pixels instanceof Uint8ClampedArray) || result.pixels.length !== this.source.data.length
            || !Number.isFinite(result.elapsedMs) || result.elapsedMs < 0 || result.elapsedMs > 60_000
            || typeof result.label !== "string" || !/simulation|guide|hypothetical/i.test(result.label)) {
            this.active = null;
            throw new RangeError("The preview result did not satisfy the image and label contract.");
        }
        for (let i = 3; i < result.pixels.length; i += 4) {
            if (result.pixels[i] !== this.source.data[i]) {
                this.active = null;
                throw new RangeError("The preview changed photo transparency.");
            }
        }
        this.resultValue = { ...result, pixels: result.pixels.slice(), warnings: [...result.warnings], metrics: structuredClone(result.metrics) };
        this.active = null;
        return true;
    }
    failed(id) {
        if (id !== this.active)
            return false;
        this.active = null;
        return true;
    }
}
