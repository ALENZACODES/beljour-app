export class ClipJobError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "ClipJobError";
    }
}
function positiveInteger(value, name, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new ClipJobError(`Invalid ${name}: expected ${min} to ${max}`, "CLIP_INVALID_PLAN");
    }
    return value;
}
export class ClipJob {
    stream;
    options;
    recorder = null;
    status = "idle";
    chunks = [];
    bufferedBytes = 0;
    releasedTracks = 0;
    completion = null;
    complete = null;
    fail = null;
    terminal = null;
    limit;
    timeslice;
    constructor(stream, options) {
        this.stream = stream;
        this.options = options;
        if (!stream || typeof stream.getTracks !== "function") {
            throw new ClipJobError("Clip stream must own media tracks", "CLIP_INVALID_STREAM");
        }
        if (!/^video\/(mp4|webm)(;codecs=[\w.,-]+)?$/.test(options.mimeType)) {
            throw new ClipJobError("Unsupported clip container", "CLIP_INVALID_PLAN");
        }
        positiveInteger(options.videoBitsPerSecond, "bitrate", 100_000, 30_000_000);
        this.limit = positiveInteger(options.maxBufferedBytes ?? 64 * 1024 * 1024, "clip byte budget", 1024, 128 * 1024 * 1024);
        this.timeslice = positiveInteger(options.timesliceMs ?? 500, "timeslice", 100, 10_000);
    }
    get state() {
        return {
            status: this.status,
            bufferedBytes: this.bufferedBytes,
            retainedChunks: this.chunks.length,
            releasedTracks: this.releasedTracks,
        };
    }
    onChunk = (event) => {
        if (this.status !== "recording" && this.status !== "finishing")
            return;
        const { data } = event;
        if (!data || data.size === 0)
            return;
        if (this.bufferedBytes + data.size > this.limit) {
            this.abort(new ClipJobError("Clip exceeded its local memory budget", "CLIP_MEMORY_LIMIT"));
            return;
        }
        this.bufferedBytes += data.size;
        this.chunks.push(data);
    };
    onStop = () => {
        if (this.status !== "recording" && this.status !== "finishing")
            return;
        const blob = new Blob(this.chunks, { type: this.options.mimeType.split(";")[0] });
        const resolve = this.complete;
        this.cleanup("finished");
        resolve?.(blob);
    };
    onError = () => {
        this.abort(new ClipJobError("Recording failed on this device", "CLIP_RECORDER_ERROR"));
    };
    onAbort = () => {
        this.abort(new ClipJobError("Clip recording was cancelled", "CLIP_ABORTED"));
    };
    start() {
        if (this.status !== "idle")
            throw new ClipJobError("Clip job already started", "CLIP_BAD_STATE");
        if (this.options.signal?.aborted) {
            this.cleanup("disposed");
            throw new ClipJobError("Clip recording was cancelled", "CLIP_ABORTED");
        }
        try {
            const factory = this.options.makeRecorder ?? ((stream, options) => new MediaRecorder(stream, options));
            const recorder = factory(this.stream, {
                mimeType: this.options.mimeType,
                videoBitsPerSecond: this.options.videoBitsPerSecond,
            });
            this.recorder = recorder;
            this.completion = new Promise((resolve, reject) => {
                this.complete = resolve;
                this.fail = reject;
            });
            // Abort may precede finish(); observe this promise to avoid an unhandled rejection.
            void this.completion.catch(() => undefined);
            recorder.addEventListener("dataavailable", this.onChunk);
            recorder.addEventListener("stop", this.onStop);
            recorder.addEventListener("error", this.onError);
            this.options.signal?.addEventListener("abort", this.onAbort, { once: true });
            this.status = "recording";
            recorder.start(this.timeslice);
            if (this.options.signal?.aborted)
                this.onAbort();
        }
        catch (error) {
            this.abort(new ClipJobError("This browser could not begin recording", "CLIP_START_FAILED"));
            throw error;
        }
    }
    async finish() {
        if (this.terminal)
            throw this.terminal;
        if (this.status === "idle" || this.status === "disposed") {
            throw new ClipJobError("No active clip to finish", "CLIP_BAD_STATE");
        }
        const pending = this.completion;
        if (!pending)
            throw new ClipJobError("Clip completion is unavailable", "CLIP_BAD_STATE");
        if (this.status === "recording") {
            this.status = "finishing";
            try {
                if (this.recorder?.state !== "inactive")
                    this.recorder?.stop();
                else
                    this.onStop();
            }
            catch {
                this.abort(new ClipJobError("Could not stop the recorder", "CLIP_STOP_FAILED"));
            }
        }
        return pending;
    }
    cancel() {
        this.abort(new ClipJobError("Clip recording was cancelled", "CLIP_ABORTED"));
    }
    dispose() {
        if (this.status === "finished" || this.status === "disposed")
            return;
        this.abort(new ClipJobError("Clip resources were disposed", "CLIP_DISPOSED"));
    }
    abort(error) {
        if (this.status === "finished" || this.status === "disposed")
            return;
        this.terminal = error;
        const reject = this.fail;
        const recorder = this.recorder;
        this.cleanup("disposed");
        try {
            if (recorder && recorder.state !== "inactive")
                recorder.stop();
        }
        catch {
            // The recorder may have failed before start; tracks were still released.
        }
        reject?.(error);
    }
    cleanup(next) {
        this.status = next;
        this.options.signal?.removeEventListener("abort", this.onAbort);
        const recorder = this.recorder;
        if (recorder) {
            recorder.removeEventListener("dataavailable", this.onChunk);
            recorder.removeEventListener("stop", this.onStop);
            recorder.removeEventListener("error", this.onError);
            this.recorder = null;
        }
        const unique = new Set(this.stream.getTracks());
        for (const track of unique) {
            try {
                track.stop();
            }
            catch {
                // A failed stop cannot hold references or prevent releasing other tracks.
            }
            this.releasedTracks++;
        }
        this.chunks = [];
        this.bufferedBytes = 0;
        // A settled Promise captures its result; do not retain the whole video Blob.
        // finish() already holds its local Promise and the caller owns the returned Blob.
        this.completion = null;
        this.complete = null;
        this.fail = null;
    }
}
export function createClipJob(stream, options) {
    return new ClipJob(stream, options);
}
