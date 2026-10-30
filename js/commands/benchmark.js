import { checkedFrame, ProRenderError } from './runtime.js';
function boundedInt(value, lower, upper) {
    return Number.isSafeInteger(value) && Number(value) >= lower && Number(value) <= upper;
}
export function syntheticBenchmarkFrame(width, height, channels = 3, seed = 7) {
    if (!boundedInt(width, 1, 24_000_000) || !boundedInt(height, 1, 24_000_000) ||
        width * height > 24_000_000 || (channels !== 3 && channels !== 4) ||
        !boundedInt(seed, 0, 2 ** 32 - 1)) {
        throw new ProRenderError('invalid_benchmark', 'Synthetic fixture settings are invalid.');
    }
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * channels;
            const band = (Math.floor(x / 13) + Math.floor(y / 17)) % 2 ? 31 : 0;
            pixels[index] = (x * 3 + y * 5 + seed + band) % 256;
            pixels[index + 1] = (x * 7 + y * 2 + seed * 3 + band) % 256;
            pixels[index + 2] = (x * 2 + y * 11 + seed * 5 + band) % 256;
            if (channels === 4)
                pixels[index + 3] = (y * 13 + x * 17 + seed) % 256;
        }
    }
    return { width, height, channels, pixels };
}
function checkedCase(value) {
    if (!value || value.plan.version !== 'beljour-pro-plan/1' ||
        !boundedInt(value.width, 1, 24_000_000) ||
        !boundedInt(value.height, 1, 24_000_000) ||
        value.width * value.height > 24_000_000 ||
        !boundedInt(value.seed, 0, 2 ** 32 - 1) ||
        (value.channels !== 3 && value.channels !== 4) ||
        (value.quality !== 'preview' && value.quality !== 'export') ||
        !boundedInt(value.repetitions, 1, 100) || !boundedInt(value.warmups, 0, 20)) {
        throw new ProRenderError('invalid_benchmark', 'Benchmark case is invalid.');
    }
}
function percentile95(sorted) {
    const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    return sorted[index] ?? 0;
}
function median(sorted) {
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1)
        return sorted[middle] ?? 0;
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
export class ProBrowserBenchmark {
    renderer;
    clock;
    previewBudgetMs;
    exportBudgetMs;
    constructor(renderer, clock = () => performance.now(), previewBudgetMs = 100, exportBudgetMs = 2000) {
        this.renderer = renderer;
        this.clock = clock;
        this.previewBudgetMs = previewBudgetMs;
        this.exportBudgetMs = exportBudgetMs;
        if (typeof renderer !== 'function' || typeof clock !== 'function' ||
            !Number.isFinite(previewBudgetMs) || previewBudgetMs <= 0 ||
            !Number.isFinite(exportBudgetMs) || exportBudgetMs <= 0) {
            throw new ProRenderError('invalid_benchmark', 'Benchmark runner requires a renderer and budgets.');
        }
    }
    async sample(item, source, signal) {
        if (signal.aborted)
            throw new ProRenderError('benchmark_cancelled', 'Benchmark cancelled.');
        const start = this.clock();
        const safe = { ...source, pixels: new Uint8Array(source.pixels) };
        const output = checkedFrame(await this.renderer(item.plan, safe, item.quality, signal));
        const ms = this.clock() - start;
        if (!Number.isFinite(ms) || ms < 0) {
            throw new ProRenderError('invalid_benchmark_clock', 'Benchmark clock is invalid.');
        }
        if (signal.aborted)
            throw new ProRenderError('benchmark_cancelled', 'Benchmark cancelled.');
        return { image: output, ms };
    }
    async run(item, signal = new AbortController().signal) {
        checkedCase(item);
        const source = syntheticBenchmarkFrame(item.width, item.height, item.channels, item.seed);
        const budget = item.quality === 'preview' ? this.previewBudgetMs : this.exportBudgetMs;
        const samples = [];
        let last = null;
        let failure = null;
        try {
            for (let i = 0; i < item.warmups; i++) {
                last = (await this.sample(item, source, signal)).image;
            }
            for (let i = 0; i < item.repetitions; i++) {
                const result = await this.sample(item, source, signal);
                last = result.image;
                samples.push(result.ms);
            }
        }
        catch (error) {
            failure = error instanceof ProRenderError ? error.code : 'renderer_unavailable';
        }
        if (failure !== null || last === null || samples.length !== item.repetitions) {
            return Object.freeze({
                version: 'beljour-pro-timing/1', outcome: 'failed', quality: item.quality,
                inputWidth: item.width, inputHeight: item.height, outputWidth: null, outputHeight: null,
                sampleCount: samples.length, medianMs: null, p95Ms: null, maxMs: null,
                budgetMs: budget, withinAssumedBudget: null,
                failureCode: failure ?? 'benchmark_incomplete', syntheticOnly: true, releaseQualified: false,
            });
        }
        samples.sort((a, b) => a - b);
        const medianMs = median(samples);
        return Object.freeze({
            version: 'beljour-pro-timing/1', outcome: 'completed', quality: item.quality,
            inputWidth: item.width, inputHeight: item.height,
            outputWidth: last.width, outputHeight: last.height,
            sampleCount: samples.length, medianMs,
            p95Ms: percentile95(samples), maxMs: samples[samples.length - 1] ?? 0,
            budgetMs: budget, withinAssumedBudget: medianMs <= budget,
            failureCode: null, syntheticOnly: true, releaseQualified: false,
        });
    }
}
//# sourceMappingURL=benchmark.js.map