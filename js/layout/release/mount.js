/** Opt-in Home review; no network or visitor photo access. Author: John Khan. */
import { commandReadiness, } from "./commands.js";
import { readDeviceEnvironment, sampleDrawnCanvas, } from "./device.js";
import { evaluateReleaseReadiness } from "./readiness.js";
import { safeReleaseReport, saveReleaseReport, } from "./report.js";
import { ReleaseSession } from "./state.js";
import { inspectReleaseFile } from "./import-review.js";
import { renderReleaseView } from "./view.js";
export function mountReleaseWorkspace(doc, host, onExit, options = {}) {
    const now = options.now ?? (() => performance.now());
    const state = new ReleaseSession(now);
    const commands = commandReadiness(options.proCommands ?? null);
    let environment = options.device ?? null;
    let sampling = null;
    let disposed = false;
    let importRevision = 0;
    let message = "Start the review to record manual application checks.";
    function render() {
        if (disposed)
            return;
        const snapshot = state.snapshot;
        const readiness = evaluateReleaseReadiness(snapshot, commands, environment, sampling);
        renderReleaseView(doc, host, snapshot, readiness, commands, environment, sampling, actions, message);
    }
    function feedback(text) {
        message = text;
        render();
    }
    function guarded(action, success) {
        if (disposed)
            return;
        try {
            action();
            feedback(success);
        }
        catch {
            feedback("That review action was refused. Previous observations remain unchanged.");
        }
    }
    const actions = {
        start() {
            guarded(() => state.start(), "Rehearsal started. Only actual observed actions can be recorded.");
        },
        stop() {
            guarded(() => state.stop(), "Rehearsal stopped. No production gate has been certified.");
        },
        reset() {
            if (disposed)
                return;
            importRevision += 1;
            state.reset();
            sampling = null;
            feedback("All local observations and timing have been cleared.");
        },
        exit() {
            if (disposed)
                return;
            dispose();
            onExit();
        },
        open(id) {
            guarded(() => state.open(id), "Route opened or opening attempted; the result is not yet verified.");
        },
        review(id) {
            guarded(() => state.review(id), "Operator-reported review recorded, not release acceptance.");
        },
        refuse(id, reason) {
            guarded(() => state.refuse(id, reason), "A refusal was recorded without simulating success.");
        },
        clear(id) {
            guarded(() => state.clear(id), "This local observation has been cleared.");
        },
        runCanvas() {
            if (disposed || state.snapshot.phase !== "running")
                return;
            sampling = sampleDrawnCanvas({
                now,
                createCanvas: options.createCanvas ?? ((width, height) => {
                    const canvas = doc.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    return canvas;
                }),
            });
            feedback(sampling.status === "measured"
                ? "Measured synthetic Canvas drawing on this device; this is not an edit budget pass."
                : "Canvas measurement unavailable. No fallback network request was used.");
        },
        inspect(file) {
            if (disposed)
                return;
            const revision = ++importRevision;
            void inspectReleaseFile(file, () => importRevision, revision).then((result) => {
                if (disposed || revision !== importRevision)
                    return;
                feedback(result.note);
            });
        },
        report() {
            if (disposed)
                return;
            const snapshot = state.snapshot;
            const readiness = evaluateReleaseReadiness(snapshot, commands, environment, sampling);
            try {
                const report = safeReleaseReport(snapshot, readiness, commands, environment, sampling);
                saveReleaseReport(report, {
                    createObjectURL: (blob) => URL.createObjectURL(blob),
                    revokeObjectURL: (url) => URL.revokeObjectURL(url),
                    createAnchor: () => doc.createElement("a"),
                });
                feedback("Photo-free local report download requested. Receipt is not verified.");
            }
            catch {
                feedback("Report download unavailable. No personal information was uploaded.");
            }
        },
    };
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        importRevision += 1;
        state.reset();
        environment = null;
        sampling = null;
        host.replaceChildren();
    }
    if (environment === null) {
        try {
            environment = readDeviceEnvironment(doc, doc.defaultView ?? window);
        }
        catch {
            environment = null;
        }
    }
    render();
    return { state, commands, active: () => !disposed, render, dispose };
}
//# sourceMappingURL=mount.js.map