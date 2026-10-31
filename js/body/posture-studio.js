import { SIMULATION_LABEL } from "../engines/local/posture.js";
import { canvasEncoder } from "../save/export.js";
import { BODY_SET_COPY, READINESS_MESSAGES, studioReadiness } from "./posture-acceptance.js";
import { mountPostureAnnotator } from "./posture-annotator.js";
import { installPostureScreen } from "./posture-binding.js";
import { PostureFileRefused, browserImageDecoder, importPostureFile } from "./posture-file.js";
import { PostureEditHistory } from "./posture-history.js";
import { PostureIntake } from "./posture-intake.js";
import { HeadPixelGuard } from "./posture-pixel-guard.js";
import { preparePostureFrame } from "./posture-preview.js";
import { mountCoveragePlan } from "./posture-coverage-plan.js";
import { EvidenceFileReader, EvidenceFileRefused } from "./posture-evidence-file.js";
import { mountProofStatus } from "./posture-proof.js";
import { verifiedEvidenceReport } from "./posture-proof-integrity.js";
import { mountProofSummary } from "./posture-proof-summary.js";
import { IdentityLockUnavailable } from "./posture-session.js";
import { PostureStage } from "./posture-stage.js";
const FILE_MESSAGES = {
    unsupported_file_type: "Choose a JPEG, PNG or WebP photo.",
    file_too_large: "That photo is too large to open here.",
    empty_file: "That file is empty.",
    decode_failed: "That photo could not be read.",
    image_too_large: "That photo has too many pixels to edit here.",
    image_too_small: "That photo is too small to edit.",
    import_cancelled: "Opening the photo was cancelled.",
};
function viewChoice(text, onClick) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.addEventListener("click", onClick);
    return element;
}
export function mountBodyPostureStudio(container, options = {}) {
    const report = (message) => {
        status.textContent = message;
        options.onError?.(message);
    };
    const intake = new PostureIntake();
    const history = new PostureEditHistory();
    const stage = new PostureStage();
    /** One guard per rendered size: the full photo and its deterministic drag preview. */
    let pixelGuards = [];
    let guardFrame = null;
    let shown = null;
    let releaseRevision = null;
    let replaying = false;
    let importToken = 0;
    let importAbort = null;
    let disposed = false;
    let pendingFile = null;
    let historyDigest = null;
    let historyRevision = -1;
    const root = document.createElement("section");
    root.className = "body-posture-studio";
    root.setAttribute("aria-label", "Body posture studio");
    const warning = document.createElement("p");
    warning.className = "posture-warning";
    warning.textContent = SIMULATION_LABEL;
    const bodySet = document.createElement("p");
    bodySet.className = "posture-body-set";
    bodySet.textContent = BODY_SET_COPY;
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.setAttribute("accept", "image/jpeg,image/png,image/webp");
    fileInput.setAttribute("aria-label", "Open a photo from this device");
    const viewChoices = document.createElement("div");
    viewChoices.hidden = true;
    const chooseView = (view, facing) => () => {
        const file = pendingFile;
        if (!file)
            return;
        viewChoices.hidden = true;
        void handle.openFile(file, view, facing).catch(() => undefined);
    };
    viewChoices.append(viewChoice("Front view", chooseView("front", 0)), viewChoice("Side view, facing left", chooseView("side", -1)), viewChoice("Side view, facing right", chooseView("side", 1)));
    fileInput.addEventListener("change", () => {
        pendingFile = fileInput.files?.[0] ?? null;
        viewChoices.hidden = pendingFile === null;
    });
    const split = document.createElement("input");
    split.type = "range";
    split.min = "0";
    split.max = "1";
    split.step = "0.01";
    split.value = "0.5";
    split.setAttribute("aria-label", "Before and after split");
    const undoButton = viewChoice("Undo", () => { void handle.undo(); });
    undoButton.setAttribute("data-posture-history", "undo");
    const redoButton = viewChoice("Redo", () => { void handle.redo(); });
    redoButton.setAttribute("data-posture-history", "redo");
    const save = viewChoice("Save labelled copy", () => { void handle.export().catch(() => undefined); });
    const readinessText = document.createElement("p");
    readinessText.className = "posture-readiness";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const panelHost = document.createElement("div");
    const annotatorHost = document.createElement("div");
    const evidenceHost = document.createElement("div");
    const evidenceNote = document.createElement("p");
    evidenceNote.textContent = "Evidence and coverage files are read on this device only and are not verified here.";
    const evidenceInput = document.createElement("input");
    evidenceInput.type = "file";
    evidenceInput.setAttribute("accept", "application/json,.json");
    evidenceInput.setAttribute("aria-label", "Load a body evidence report (JSON)");
    const coverageInput = document.createElement("input");
    coverageInput.type = "file";
    coverageInput.setAttribute("accept", "application/json,.json");
    coverageInput.setAttribute("aria-label", "Load a body-set coverage plan (JSON)");
    evidenceHost.append(evidenceNote, evidenceInput, coverageInput);
    root.append(warning, bodySet, fileInput, viewChoices, stage.element, split, annotatorHost, panelHost, undoButton, redoButton, save, readinessText, evidenceHost, status);
    container.append(root);
    const proof = mountProofStatus(evidenceHost);
    const summary = mountProofSummary(evidenceHost);
    const coveragePlan = mountCoveragePlan(evidenceHost);
    const evidenceReader = new EvidenceFileReader();
    const coverageReader = new EvidenceFileReader();
    const fileProblem = (error) => error instanceof EvidenceFileRefused
        ? "That file is not a readable JSON evidence file." : "That evidence report was refused.";
    evidenceInput.addEventListener("change", () => {
        const file = evidenceInput.files?.[0];
        if (file)
            void handle.importEvidenceFile(file).catch(() => undefined);
    });
    coverageInput.addEventListener("change", () => {
        const file = coverageInput.files?.[0];
        if (file)
            void handle.importCoverageFile(file).catch(() => undefined);
    });
    const delegatingGuard = {
        guard(before, after, lockLevel) {
            const match = pixelGuards.find((item) => item.width === before.width && item.height === before.height);
            if (!match)
                throw new IdentityLockUnavailable("Accept the head marking first.");
            return match.guard(before, after, lockLevel);
        },
    };
    const screen = installPostureScreen(panelHost, {
        resolveFrame: (digest) => {
            const frame = intake.accepted;
            if (!frame || frame.digest !== digest)
                throw new RangeError("markings are not accepted for this photo");
            return frame;
        },
        identityGuard: delegatingGuard,
        onFrame: (frame) => {
            shown = frame;
            if (frame.stage === "release") {
                releaseRevision = intake.revision;
                if (!replaying) {
                    history.commit(frame.digest, { fix: frame.result.fix, view: frame.frame.controls.view,
                        level: frame.result.level, lockLevel: frame.result.lockLevel });
                }
            }
            redraw();
            options.onFrame?.(frame, frame.stage);
        },
        onError: report,
        schedule: options.schedule,
    });
    const controls = mountPostureAnnotator(annotatorHost, intake, report);
    stage.element.addEventListener("click", (event) => {
        const pointer = event;
        try {
            controls.place(stage.toSource(pointer.offsetX, pointer.offsetY));
        }
        catch {
            report("Open a photo before marking it.");
        }
    });
    split.addEventListener("input", () => redraw());
    function readiness() {
        return studioReadiness({ digest: intake.digest, revision: intake.revision, accepted: intake.accepted,
            release: shown?.stage === "release" ? shown : null, releaseRevision });
    }
    function redraw() {
        const source = intake.source;
        const snapshot = intake.snapshot();
        const markings = { person: snapshot.person, head: snapshot.head, points: snapshot.points };
        if (!source)
            stage.clear();
        else if (shown && shown.digest === intake.digest) {
            stage.show(shown.frame.image, shown.result.image, Number(split.value), markings, source);
        }
        else {
            stage.show(source, null, 0.5, markings);
        }
        const state = readiness();
        save.disabled = !state.ready;
        readinessText.textContent = state.ready ? "Ready to save a labelled copy." :
            state.gaps.map((gap) => READINESS_MESSAGES[gap]).join(" ");
        const steps = history.snapshot;
        undoButton.disabled = !steps.open || !steps.canUndo;
        redoButton.disabled = !steps.open || !steps.canRedo;
    }
    function syncGuard(frame) {
        if (frame === guardFrame)
            return;
        for (const item of pixelGuards)
            item.dispose();
        pixelGuards = [];
        guardFrame = frame;
        if (!frame)
            return;
        pixelGuards.push(new HeadPixelGuard(frame.image, frame.head));
        const preview = preparePostureFrame(frame, false);
        try {
            if (preview.image.width !== frame.image.width)
                pixelGuards.push(new HeadPixelGuard(preview.image, preview.head));
        }
        catch {
            // A head too small to survive the preview scale: previews of face-adjacent fixes are refused.
        }
        finally {
            preview.image.data.fill(0);
        }
    }
    intake.subscribe((snapshot) => {
        if (disposed)
            return;
        const frame = intake.accepted;
        syncGuard(frame);
        if (snapshot.digest !== historyDigest) {
            if (snapshot.digest)
                history.open(snapshot.digest);
            else
                history.close();
            historyDigest = snapshot.digest;
        }
        else if (snapshot.digest && snapshot.revision !== historyRevision && !snapshot.accepted) {
            // A marking changed: every stored edit described another outline.
            history.invalidate(snapshot.digest);
        }
        historyRevision = snapshot.revision;
        if (!snapshot.accepted || (shown && shown.digest !== snapshot.digest))
            shown = null;
        if (snapshot.digest) {
            screen.setPhoto({ digest: snapshot.digest, width: snapshot.width, height: snapshot.height,
                view: frame ? frame.view : snapshot.view, personMask: frame !== null, headMask: frame !== null });
        }
        else {
            screen.clearPhoto();
        }
        redraw();
    });
    async function step(direction) {
        const digest = intake.digest;
        if (!digest || !history.snapshot.open)
            return false;
        replaying = true;
        try {
            const outcome = await history.replay(digest, direction, async (edit) => {
                if (edit === null) {
                    shown = null;
                    redraw();
                    return true;
                }
                screen.panel.show(edit.fix, edit.level, edit.lockLevel);
                const frame = await screen.renderRelease(edit.fix, edit.level, edit.lockLevel);
                if (!frame)
                    throw new RangeError("replay render was refused");
                return true;
            });
            redraw();
            return outcome === true;
        }
        catch {
            report("That step could not be re-rendered.");
            return false;
        }
        finally {
            replaying = false;
        }
    }
    const handle = {
        element: root,
        annotation: { intake, controls },
        screen,
        history,
        get readiness() { return readiness(); },
        get evidence() { return proof.report; },
        get coverage() { return coveragePlan.plan; },
        async openFile(file, view, facing = view === "front" ? 0 : 1) {
            if (disposed)
                throw new RangeError("studio has been disposed");
            const token = ++importToken;
            importAbort?.abort();
            importAbort = new AbortController();
            const signal = importAbort.signal;
            try {
                const photo = await importPostureFile(file, { decoder: options.decoder ?? browserImageDecoder, signal });
                if (token !== importToken || disposed) {
                    photo.image.data.fill(0);
                    throw new PostureFileRefused("import_cancelled");
                }
                intake.setSource(photo.digest, photo.image, view, facing);
                photo.image.data.fill(0);
                status.textContent = "Photo opened on this device. Mark the person, head and points.";
                return photo.digest;
            }
            catch (error) {
                const code = error instanceof PostureFileRefused ? error.code : "decode_failed";
                if (token === importToken)
                    report(FILE_MESSAGES[code] ?? FILE_MESSAGES.decode_failed);
                throw error;
            }
        },
        setSource(digest, image, view, facing = view === "side" ? 1 : 0) {
            if (disposed)
                throw new RangeError("studio has been disposed");
            importToken++;
            importAbort?.abort();
            intake.setSource(digest, image, view, facing);
        },
        release: () => screen.release(),
        undo: () => step("undo"),
        redo: () => step("redo"),
        async export(settings = {}) {
            const state = readiness();
            if (!state.ready) {
                const message = READINESS_MESSAGES[state.gaps[0]];
                report(message);
                throw new RangeError(message);
            }
            return screen.export(settings, options.encoder ?? canvasEncoder());
        },
        setEvidenceReport(aggregate) {
            if (disposed)
                throw new RangeError("studio has been disposed");
            try {
                const verified = proof.show(verifiedEvidenceReport(aggregate));
                summary.show(verified);
                return verified;
            }
            catch (error) {
                proof.reset();
                summary.show(null);
                report("That evidence report was refused.");
                throw error;
            }
        },
        clearEvidenceReport() {
            proof.reset();
            summary.show(null);
        },
        async importEvidenceFile(file) {
            if (disposed)
                throw new RangeError("studio has been disposed");
            let read;
            try {
                read = await evidenceReader.read(file);
            }
            catch (error) {
                report(fileProblem(error));
                throw error;
            }
            return read.status === "done" && !disposed ? handle.setEvidenceReport(read.value) : null;
        },
        setCoveragePlan(plan) {
            if (disposed)
                throw new RangeError("studio has been disposed");
            try {
                return coveragePlan.show(plan);
            }
            catch (error) {
                report("That coverage plan was refused.");
                throw error;
            }
        },
        async importCoverageFile(file) {
            if (disposed)
                throw new RangeError("studio has been disposed");
            let read;
            try {
                read = await coverageReader.read(file);
            }
            catch (error) {
                report(fileProblem(error));
                throw error;
            }
            return read.status === "done" && !disposed ? handle.setCoveragePlan(read.value) : null;
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            importAbort?.abort();
            proof.dispose();
            summary.dispose();
            coveragePlan.dispose();
            evidenceReader.dispose();
            coverageReader.dispose();
            screen.dispose();
            controls.dispose();
            syncGuard(null);
            intake.dispose();
            history.close();
            stage.clear();
            shown = null;
            root.remove();
        },
    };
    redraw();
    return handle;
}
