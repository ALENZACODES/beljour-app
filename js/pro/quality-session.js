import { defaultResizer, prepareReference, renderFromReference, } from "../engines/upscale/quality-generator.js";
import { exportQualityRender } from "../engines/upscale/quality-export.js";
import { planAspectQuality, previewOf } from "../engines/upscale/quality-aspect.js";
import { budgetReport, timed } from "../engines/upscale/quality-budget.js";
import { exportTierRelease } from "../engines/upscale/quality-export-tier.js";
import { pairedDiagnostic } from "../engines/upscale/quality-paired.js";
import { classicalPaired, describeEngine, exportModelTierRelease, pairedModelDiagnostic, runModelQualityPipeline, } from "../engines/upscale/quality-model-chain.js";
import { hairMatteDiagnostic } from "../engines/upscale/quality-model-matte.js";
import { runQualityPipeline } from "../engines/upscale/quality-pipeline.js";
import { planFixedTier, scaledPlan } from "../engines/upscale/quality-tier.js";
import { DEFAULT_LEVEL, DEFAULT_LOCK_LEVEL, validateLevel } from "./strength.js";
export const PREVIEW_EDGE = 640;
export const PREVIEW_CACHE = 5;
export class StaleQualityJob extends Error {
    constructor() {
        super("The photo or face selection changed; this result was discarded.");
        this.name = "StaleQualityJob";
    }
}
export class QualitySession {
    source = null;
    digest = null;
    selection = null;
    revision = 0;
    previewReference = null;
    previews = new Map();
    latestRelease = null;
    releaseJob = 0;
    levels = { detailLevel: DEFAULT_LEVEL, lockLevel: DEFAULT_LOCK_LEVEL };
    resizer;
    tier;
    /** How many times a preview reference was prepared (for reuse checks). */
    referenceBuilds = 0;
    constructor(options = {}) {
        this.resizer = options.resizer ?? defaultResizer();
        this.tier = options.tier ?? "hd1080";
    }
    get current() {
        return { digest: this.digest, revision: this.revision, ready: this.selection !== null, levels: { ...this.levels } };
    }
    /** Copy the decoded photo in; any previous photo is wiped. */
    open(digest, image) {
        if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest))
            throw new RangeError("Invalid photo digest");
        const plan = planFixedTier(image.width, image.height, this.tier);
        if (image.data.length !== image.width * image.height * 4)
            throw new RangeError("Quality Generator needs an RGBA image");
        this.wipe();
        this.source = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
        this.digest = digest;
        return plan;
    }
    /** A face selection the user confirmed, one coverage value per photo pixel. */
    markFace(mask) {
        this.setSelection({ mask: new Uint8Array(mask), confirmed: true });
    }
    /** The user states there is no person in the photo. */
    declareNoPerson() {
        const source = this.require();
        this.setSelection({ mask: new Uint8Array(source.width * source.height), confirmed: true, noFace: true });
    }
    clearSelection() {
        this.selection = null;
        this.invalidate();
    }
    setLevels(detailLevel, lockLevel = this.levels.lockLevel) {
        this.levels = { detailLevel: validateLevel(detailLevel), lockLevel: validateLevel(lockLevel) };
        return { ...this.levels };
    }
    plan() {
        const source = this.require();
        return planFixedTier(source.width, source.height, this.tier);
    }
    async preview() {
        const { source, selection, revision } = this.ready();
        const key = `${this.levels.detailLevel}:${this.levels.lockLevel}`;
        const cached = this.previews.get(key);
        if (cached)
            return cached;
        if (!this.previewReference || this.previewReference.key !== revision) {
            this.referenceBuilds += 1;
            const plan = scaledPlan(this.plan(), PREVIEW_EDGE);
            this.previewReference = { key: revision, value: prepareReference(source, selection, plan, this.resizer) };
        }
        const reference = await this.previewReference.value;
        if (revision !== this.revision)
            throw new StaleQualityJob();
        const render = renderFromReference(reference, this.levels, false);
        this.previews.set(key, render);
        while (this.previews.size > PREVIEW_CACHE)
            this.previews.delete(this.previews.keys().next().value);
        return render;
    }
    /** Full tier render; superseded by a later release call or any photo/selection change. */
    async release() {
        const { source, selection, revision } = this.ready();
        const job = ++this.releaseJob;
        const levels = { ...this.levels };
        const reference = await prepareReference(source, selection, this.plan(), this.resizer);
        try {
            if (revision !== this.revision || job !== this.releaseJob)
                throw new StaleQualityJob();
            const render = renderFromReference(reference, levels, true);
            this.latestRelease = { render, revision };
            return render;
        }
        finally {
            reference.content.fill(0);
        }
    }
    async export(render, name, settings = {}, encoder) {
        if (!this.latestRelease || this.latestRelease.render !== render || this.latestRelease.revision !== this.revision) {
            throw new RangeError("Only the current release of this photo can be exported");
        }
        return exportQualityRender(render, name, settings, encoder);
    }
    dispose() {
        this.wipe();
    }
    setSelection(selection) {
        const source = this.require();
        if (selection.mask.length !== source.width * source.height)
            throw new RangeError("Face selection size differs");
        const marked = selection.mask.some(value => value !== 0);
        if (!selection.noFace && !marked)
            throw new RangeError("Mark the face, or state that there is no person");
        this.selection = selection;
        this.invalidate();
    }
    require() {
        if (!this.source)
            throw new RangeError("Open a photo first");
        return this.source;
    }
    ready() {
        const source = this.require();
        if (!this.selection)
            throw new RangeError("Confirm the face area, or state that there is no person");
        return { source, selection: this.selection, revision: this.revision };
    }
    invalidate() {
        this.revision += 1;
        // A preview awaiting this reference sees the new revision and is refused first.
        this.previewReference?.value.then(reference => reference.content.fill(0), () => undefined);
        this.previewReference = null;
        for (const render of this.previews.values())
            render.image.data.fill(0);
        this.previews.clear();
        if (this.latestRelease)
            this.latestRelease.render.image.data.fill(0);
        this.latestRelease = null;
        this.releaseJob += 1;
    }
    wipe() {
        this.source?.data.fill(0);
        this.source = null;
        this.digest = null;
        this.selection = null;
        this.invalidate();
    }
}
/** Aspect-preserving HD 1080 / 4K session (r37e). */
export class QualityTierSession {
    photo = null;
    face = null;
    generation = 0;
    tierName = "hd1080";
    levelSet = { detailLevel: DEFAULT_LEVEL, denoiseLevel: 2, lockLevel: DEFAULT_LOCK_LEVEL };
    cache = new Map();
    current = null;
    job = null;
    timings = {};
    resizer;
    clock;
    models;
    constructor(options = {}) {
        this.resizer = options.resizer ?? defaultResizer();
        this.clock = options.clock;
        this.models = options.models ?? null;
    }
    /** The engine this session renders with: the reviewed model chain or the classical stages. */
    get engine() {
        return describeEngine(this.models);
    }
    get state() {
        return { revision: this.generation, tier: this.tierName, ready: this.face !== null, levels: { ...this.levelSet } };
    }
    open(digest, image) {
        if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest))
            throw new RangeError("Invalid photo digest");
        if (image?.data?.length !== image.width * image.height * 4)
            throw new RangeError("Quality Generator needs an RGBA image");
        const plan = planAspectQuality(image.width, image.height, this.tierName);
        this.close();
        this.photo = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
        return plan;
    }
    setTier(tier) {
        const photo = this.need();
        const plan = planAspectQuality(photo.width, photo.height, tier);
        this.tierName = tier;
        this.reset();
        return plan;
    }
    markFace(mask) {
        const photo = this.need();
        if (mask.length !== photo.width * photo.height || !mask.some(value => value !== 0)) {
            throw new RangeError("Mark the face, or state that there is no person");
        }
        this.face = { mask: new Uint8Array(mask), confirmed: true };
        this.reset();
    }
    declareNoPerson() {
        const photo = this.need();
        this.face = { mask: new Uint8Array(photo.width * photo.height), confirmed: true, noFace: true };
        this.reset();
    }
    setLevels(levels) {
        const next = { ...this.levelSet, ...levels };
        this.levelSet = {
            detailLevel: validateLevel(next.detailLevel), denoiseLevel: validateLevel(next.denoiseLevel),
            lockLevel: validateLevel(next.lockLevel),
        };
        return { ...this.levelSet };
    }
    plan() {
        const photo = this.need();
        return planAspectQuality(photo.width, photo.height, this.tierName);
    }
    async preview() {
        const { photo, face, generation } = this.prepared();
        const key = `${this.tierName}:${this.levelSet.detailLevel}:${this.levelSet.denoiseLevel}:${this.levelSet.lockLevel}`;
        const hit = this.cache.get(key);
        if (hit)
            return hit;
        const { value, ms } = await timed(() => this.render(photo, face, previewOf(this.plan(), PREVIEW_EDGE), "preview"), this.clock);
        if (generation !== this.generation) {
            value.image.data.fill(0);
            throw new StaleQualityJob();
        }
        this.timings.previewMs = ms;
        this.cache.set(key, value);
        while (this.cache.size > PREVIEW_CACHE) {
            const oldest = this.cache.keys().next().value;
            this.cache.get(oldest)?.image.data.fill(0);
            this.cache.delete(oldest);
        }
        return value;
    }
    /** Full tier render. A newer release, photo, tier or selection cancels this one. */
    async release() {
        const { photo, face, generation } = this.prepared();
        this.job?.abort();
        const job = new AbortController();
        this.job = job;
        const { value, ms } = await timed(() => this.render(photo, face, this.plan(), "release", job.signal), this.clock);
        if (generation !== this.generation || job.signal.aborted) {
            value.image.data.fill(0);
            throw new StaleQualityJob();
        }
        this.timings.renderMs = ms;
        this.current?.result.image.data.fill(0);
        this.current = { result: value, generation };
        return value;
    }
    cancel() {
        this.job?.abort();
    }
    async export(result, settings = {}, encoder) {
        if (!this.current || this.current.result !== result || this.current.generation !== this.generation) {
            throw new RangeError("Only the current release of this photo can be exported");
        }
        const models = this.models;
        const { value, ms } = await timed(() => models
            ? exportModelTierRelease(result, models.verifiedModels, settings, encoder)
            : exportTierRelease(result, settings, encoder), this.clock);
        this.timings.encodeMs = ms;
        return value;
    }
    async diagnostics() {
        if (this.models)
            return pairedModelDiagnostic(this.tierName, this.models, this.resizer, this.levelSet);
        return classicalPaired(await pairedDiagnostic(this.tierName, this.resizer, this.levelSet));
    }
    /** Optional matte check against a hair mask the user drew and confirmed; never changes a render. */
    hairDiagnostic(hair) {
        return hairMatteDiagnostic(this.need(), hair, this.models);
    }
    budget() {
        const photo = this.need();
        return budgetReport({ sourcePixels: photo.width * photo.height, ...this.timings });
    }
    close() {
        this.photo?.data.fill(0);
        this.photo = null;
        this.face = null;
        this.timings = {};
        this.reset();
    }
    render(photo, face, plan, phase, signal) {
        const options = { resizer: this.resizer, phase, signal };
        return this.models
            ? runModelQualityPipeline(photo, face, plan, this.levelSet, this.models, options)
            : runQualityPipeline(photo, face, plan, this.levelSet, options);
    }
    need() {
        if (!this.photo)
            throw new RangeError("Open a photo first");
        return this.photo;
    }
    prepared() {
        const photo = this.need();
        if (!this.face)
            throw new RangeError("Confirm the face area, or state that there is no person");
        return { photo, face: this.face, generation: this.generation };
    }
    reset() {
        this.generation += 1;
        this.job?.abort();
        this.job = null;
        for (const result of this.cache.values())
            result.image.data.fill(0);
        this.cache.clear();
        this.current?.result.image.data.fill(0);
        this.current = null;
    }
}
//# sourceMappingURL=quality-session.js.map