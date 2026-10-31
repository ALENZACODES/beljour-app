/** BELJOUR — FULL BEAUTY STUDIO uses the own-brand header component. */
/** One continuous, optional web rehearsal. It never reads the production session. */
import { TOUR_STEPS, TOUR_EFFECTS, stepIndex, } from "./contract.js";
import { ContinuousDemoState } from "./state.js";
import { CassetteSession } from "./cassette-session.js";
import { OfflineImportController } from "./offline-import-controller.js";
import { offlineImportAuthority, sameOfflineImportAuthority } from "./offline-import-contract.js";
import { downloadPreparedManifest, prepareOfflineReplayManifest, preparedManifestBlob } from "./offline-import-preparation.js";
import { cassetteJourney, cassetteJourneyCaption } from "./cassette-journey.js";
import { renderCassettePanel } from "../../ui/shell/continuous-cassette-panel.js";
import { renderOfflineImportPanel } from "../../ui/shell/continuous-offline-import-panel.js";
import { ContinuousEvidence } from "./evidence.js";
import { ContinuousTimings, performanceText } from "./performance.js";
import { checkedTourOutcome, localTourTryon } from "./ports.js";
import { publicProCommands } from "./pro-commands.js";
import { SeasonalCatalogueController } from "./seasonal.js";
import { advancedGuide, drawContinuousPreview } from "./preview.js";
import { reviewContinuousDemo } from "./release-review.js";
import { ContinuousExportController } from "./export-controller.js";
import { DrawnFrameController } from "./frame-controller.js";
import { CachedFramePlayback } from "./frame-playback.js";
import { createDrawnFrameRenderer } from "./frame-render.js";
import { downloadFrameReport } from "./frame-report.js";
import { renderContinuousFramePanel } from "../../ui/shell/continuous-frame-panel.js";
import { createEditorialCover } from "../editorial/cover.js";
import { renderContinuousHeader } from "./header.js";
import { ContinuousAccessibilitySession } from "./accessibility-session.js";
import { renderProofExperience } from "../editorial/proof-experience.js";
import { applyEditorialMotion } from "../editorial/motion.js";
import { LocalExportReceipt } from "./export-receipt.js";
import { LocalEditSequence } from "./sequence-runner.js";
import { checkedShotList, downloadShotList } from "./sequence-shotlist.js";
import { OperatorRehearsal } from "./operator-state.js";
import { safeOperatorReport, saveOperatorReport, serializeOperatorReport } from "./operator-report.js";
import { renderContinuousOperator } from "../../ui/shell/continuous-operator-panel.js";
import { renderContinuousExportStatus } from "../../ui/shell/continuous-export-panel.js";
import { renderLocalSequencePanel } from "../../ui/shell/continuous-sequence-panel.js";
import { operatorPreflight, preflightCaption } from "./operator-preflight.js";
import { inspectOperatorDevice, operatorDeviceCaption } from "./operator-device.js";
import { PreviewDebouncer } from "../strength-scale.js";
import { JudgeImage } from "../../ui/shell/judge-image.js";
import { encodeJudgeCanvas, startJudgeDownload } from "../../ui/shell/judge-export.js";
import { drawJudgeComparison } from "../../ui/shell/judge-canvas.js";
import { renderSubjectButtons } from "../../ui/shell/subject-picker.js";
import { judgeNode, judgeParagraph, judgeStatus } from "../../ui/shell/judge-elements.js";
import { tourButton, tourCheck, tourConsentPanel, tourEffectPanel, tourFooter, tourProPanel, tourProgress, tourSeasonalPanel, tourTryonPanel, } from "../../ui/shell/continuous-panels.js";
export function mountContinuousDemo(doc, host, onExit, options = {}) {
    const state = new ContinuousDemoState();
    const cassette = new CassetteSession(options.providerScreensEnabled === true);
    const offlineImport = new OfflineImportController({
        current: () => ({
            state: state.snapshot,
            drawn: image.subjects.snapshot.source === "drawn",
        }),
        onChange: () => {
            if (!disposed && state.snapshot.step === "tryon")
                render();
        },
    });
    const image = new JudgeImage(doc, options.subjectDetector ?? null);
    const frames = new DrawnFrameController({
        current: () => ({
            state: state.snapshot,
            drawn: image.subjects.snapshot.source === "drawn",
        }),
        capture: options.drawnFrameCapture ?? createDrawnFrameRenderer(doc, () => ({
            state: state.snapshot, subjects: image.subjects.snapshot, original: image.original,
        })),
        now: options.now,
        changed: () => { if (!disposed && state.snapshot.step === "tryon")
            render(); },
    });
    const evidence = new ContinuousEvidence();
    const timing = new ContinuousTimings();
    const seasonal = new SeasonalCatalogueController(options.seasonal ?? null);
    const debounce = new PreviewDebouncer(75);
    const now = options.now ?? (() => performance.now());
    const sequenceScheduler = options.sequenceTimer ?? {
        schedule: (callback, delay) => setTimeout(callback, delay),
        cancel: (handle) => clearTimeout(handle),
    };
    const sequence = new LocalEditSequence({
        state,
        environment: {
            clock: now,
            scheduler: sequenceScheduler,
            drawnSource: () => image.subjects.snapshot.source === "drawn",
            hidden: () => doc.hidden === true,
            reducedMotion: () => doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            onUpdate: () => { if (!disposed)
                render(); },
            intervalMs: options.sequenceIntervalMs,
        },
    });
    const replay = new CachedFramePlayback({
        cache: () => frames.snapshot,
        select: (id) => frames.select(id),
        scheduler: sequenceScheduler,
        hidden: () => doc.hidden === true,
        reducedMotion: () => doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
        changed: () => { if (!disposed && state.snapshot.step === "tryon")
            render(); },
    });
    const onVisibility = () => {
        sequence.visibilityChanged();
        replay.visibilityChanged();
    };
    doc.addEventListener("visibilitychange", onVisibility);
    const operator = new OperatorRehearsal(now);
    const receipt = new LocalExportReceipt(undefined, () => {
        if (!disposed && state.snapshot.step === "save")
            render();
    });
    const exporter = new ContinuousExportController({
        current: () => ({
            state: state.snapshot, subjects: image.subjects.snapshot, original: image.original,
        }),
        makeCanvas: () => doc.createElement("canvas"),
        render: (canvas, source) => drawContinuousPreview(source.original, canvas, source.state, source.subjects, true),
        encode: (canvas) => encodeJudgeCanvas(canvas, "image/png"),
        requestDownload: (output) => startJudgeDownload(doc, output),
        now,
        notify: () => {
            if (!disposed && state.snapshot.step === "save")
                render();
        },
        requested: (elapsedMs, output) => {
            void receipt.stage(output.file, {
                width: output.width, height: output.height, size: output.file.size,
            });
            state.recordDownload();
            if (elapsedMs <= 300_000)
                timing.record("export", elapsedMs);
            message = "Labelled PNG download requested, not independently confirmed.";
        },
    });
    const started = now();
    let disposed = false;
    let message = "Open the drawn pair to begin.";
    let seasonalRequested = false;
    let preparationRevision = 0;
    let previewElement = null;
    const accessibility = new ContinuousAccessibilitySession({
        doc, host, onExit: () => exit(), rerender: () => render(),
    });
    const observe = (code) => {
        if (disposed)
            return;
        evidence.record(code, state.snapshot.step, Math.max(0, now() - started));
    };
    function safePreview() {
        if (disposed || !previewElement || !image.hasImage)
            return;
        const before = now();
        try {
            const snapshot = state.snapshot;
            const result = drawContinuousPreview(image.original, previewElement, snapshot, image.subjects.snapshot);
            const note = host.querySelector("#lg-cont-pixel-note");
            if (note)
                note.textContent = result.note;
        }
        catch {
            const note = host.querySelector("#lg-cont-pixel-note");
            if (note)
                note.textContent = "Preview unavailable. Original drawing was retained.";
        }
        const elapsed = Math.max(0, now() - before);
        if (elapsed <= 300_000)
            timing.record("preview", elapsed);
        const metrics = host.querySelector("#lg-cont-timing");
        if (metrics)
            metrics.textContent = performanceText(timing.summary("preview"));
    }
    function render() {
        if (disposed)
            return;
        const snapshot = state.snapshot;
        const index = stepIndex(snapshot.step);
        const step = TOUR_STEPS[index];
        const body = judgeNode(doc, "div", "lg-continuous");
        body.dataset.clientTheme = "french";
        body.className += " lg-editorial-surface";
        applyEditorialMotion(body, doc);
        const stepChanged = accessibility.beforeRender(snapshot);
        const { header, title } = renderContinuousHeader(doc, {
            index, total: TOUR_STEPS.length, title: step.title, caption: step.caption,
            announce: stepChanged,
        });
        const stage = judgeNode(doc, "main", "lg-cont-stage");
        stage.setAttribute("aria-label", "Continuous walkthrough step");
        const visual = judgeNode(doc, "section", "lg-cont-visual");
        if (image.hasImage) {
            const canvas = judgeNode(doc, "canvas", "lg-cont-canvas");
            canvas.width = 512;
            canvas.height = 640;
            canvas.setAttribute("role", "img");
            canvas.setAttribute("aria-label", "Drawn figures with local illustrative edits");
            previewElement = canvas;
            visual.append(createEditorialCover(doc, canvas, {
                origin: "drawn", subject: snapshot.selectedId === "drawn-main" ? "main" : "second",
                step: snapshot.step, position: index + 1, total: TOUR_STEPS.length,
            }));
            const pixelNote = judgeParagraph(doc, "Visual evidence is synthetic only", "lg-cont-caption");
            pixelNote.id = "lg-cont-pixel-note";
            visual.append(pixelNote);
            if (snapshot.step === "subject") {
                visual.append(renderSubjectButtons(doc, image.subjects.snapshot, {
                    choose(id) {
                        chooseSubject(id);
                    },
                }));
            }
        }
        else {
            previewElement = null;
            visual.append(createEditorialCover(doc, null, {
                origin: "unavailable", subject: "none",
                step: snapshot.step, position: index + 1, total: TOUR_STEPS.length,
            }));
            visual.append(judgeParagraph(doc, "No sample selected; original pixels are not available."));
        }
        const stageContent = judgeNode(doc, "section", "lg-cont-stage-content");
        stageContent.id = "lg-cont-current-step";
        stageContent.tabIndex = -1;
        if (snapshot.step === "source") {
            stageContent.append(judgeParagraph(doc, "The sample contains only two original drawn figures. Nothing is uploaded."));
            stageContent.append(tourButton(doc, "Open drawn two-person sample", "sample", openSample));
        }
        else if (snapshot.step === "faces") {
            stageContent.append(judgeParagraph(doc, `${snapshot.faceCount} known drawn figure boxes. Their locations are authored, not inferred. `
                + "Automatic detection on real photos requires the checked Workstream A subject port."));
        }
        else if (snapshot.step === "subject") {
            stageContent.append(judgeParagraph(doc, "Main subject is selected by default. Tap a box or use Tab and Enter to choose the other person."));
            for (const face of image.subjects.snapshot.boxes) {
                const choice = tourButton(doc, `Select ${face.id === "drawn-main" ? "main figure" : "second figure"}`, `subject-${face.id}`, () => chooseSubject(face.id));
                choice.setAttribute("aria-pressed", String(snapshot.selectedId === face.id));
                stageContent.append(choice);
            }
        }
        else if (snapshot.step === "consent") {
            stageContent.append(tourConsentPanel(doc, snapshot, actions));
        }
        else if (["hair", "colour", "concealer", "appearance", "ratio", "turn", "posture"]
            .includes(snapshot.step)) {
            const effect = snapshot.step;
            stageContent.append(tourEffectPanel(doc, snapshot, effect, actions));
            stageContent.append(judgeParagraph(doc, advancedGuide(snapshot.step, snapshot), "lg-cont-caption"));
            stageContent.append(renderLocalSequencePanel(doc, sequence.snapshot, sequenceActions));
        }
        else if (snapshot.step === "pro") {
            if (sequence.snapshot.phase === "complete") {
                stageContent.append(renderLocalSequencePanel(doc, sequence.snapshot, sequenceActions));
            }
            stageContent.append(tourProPanel(doc, snapshot, publicProCommands(options.proCommands ?? null), actions));
        }
        else if (snapshot.step === "seasonal") {
            stageContent.append(tourSeasonalPanel(doc, seasonal.snapshot, snapshot, actions));
            if (!seasonalRequested) {
                seasonalRequested = true;
                void seasonal.load().then(() => {
                    if (!disposed && state.snapshot.step === "seasonal")
                        render();
                });
            }
        }
        else if (snapshot.step === "tryon") {
            stageContent.append(tourTryonPanel(doc, snapshot, actions));
            stageContent.append(renderCassettePanel(doc, snapshot, image.subjects.snapshot.source === "drawn", cassette, cassetteActions));
            stageContent.append(renderOfflineImportPanel(doc, offlineImport.snapshot, offlineImport.previewUrl, offlineImportActions));
            stageContent.append(renderContinuousFramePanel(doc, frames.snapshot, frames.readSelected(), frameActions, { snapshot: replay.snapshot, actions: replayActions }));
        }
        else if (snapshot.step === "compare") {
            stageContent.append(judgeParagraph(doc, "Before is on the left. Move the divider to compare."));
            const comparison = judgeNode(doc, "label", "lg-cont-level");
            const slider = judgeNode(doc, "input", "");
            slider.type = "range";
            slider.min = "0";
            slider.max = "100";
            slider.step = "1";
            slider.value = String(snapshot.comparePercent);
            slider.dataset.tourAction = "comparison";
            slider.setAttribute("aria-label", "Percentage showing the original illustration");
            slider.addEventListener("input", () => actions.setComparison(Number(slider.value)));
            comparison.append(slider);
            stageContent.append(comparison);
        }
        else {
            stageContent.append(judgeParagraph(doc, "Save a locally generated image. The simulation label is permanently burned into the pixels."));
            const save = tourButton(doc, "Download labelled PNG", "save", actions.download);
            save.disabled = exporter.snapshot.pending;
            stageContent.append(save);
            stageContent.append(renderContinuousExportStatus(doc, exporter.snapshot, receipt.snapshot, {
                cancel: () => exporter.cancel(),
                inspect: (file) => { void receipt.check(file); },
            }));
            stageContent.append(judgeParagraph(doc, snapshot.requestedDownload
                ? "Download requested; browser or operator confirmation is still required."
                : "No download has been requested."));
            const summary = evidence.summary(snapshot);
            const review = reviewContinuousDemo(snapshot, summary, publicProCommands(options.proCommands ?? null), seasonal.snapshot, timing.summary("preview"));
            stageContent.append(judgeParagraph(doc, `Rehearsal checklist: ${review.observationalCount} observed steps; `
                + "live provider, real-face and release gates remain unverified.", "lg-cont-caption"));
            stageContent.append(judgeParagraph(doc, `${summary.completed} steps visited with actions; ${summary.skipped} skipped. `
                + "No live provider or real-face acceptance evidence."));
            stageContent.append(renderContinuousOperator(doc, operator.snapshot, operatorActions));
            stageContent.append(renderProofExperience(doc, {
                drawnLoaded: image.subjects.snapshot.source === "drawn",
                subjectChosen: snapshot.selectedId !== null,
                localPermission: snapshot.permissions.local,
                editCount: TOUR_EFFECTS.filter((effect) => snapshot.applied[effect]).length,
                requestedDownload: snapshot.requestedDownload,
                mockTryon: snapshot.mockResult === "mock-applied",
                cacheFrames: frames.snapshot.available,
            }));
            stageContent.append(judgeParagraph(doc, cassetteJourneyCaption(cassetteJourney(snapshot, cassette.snapshot)), "lg-cont-caption"));
            stageContent.append(judgeParagraph(doc, operatorDeviceCaption(inspectOperatorDevice({ doc })), "lg-cont-caption"));
            stageContent.append(judgeParagraph(doc, preflightCaption(operatorPreflight(state.snapshot, operator.snapshot, timing.summary("preview"))), "lg-cont-caption"));
        }
        stage.append(visual, stageContent);
        const identity = tourCheck(doc, "Identity lock requested (ON by default)", "identity-lock", snapshot.identityLock, actions.setLock);
        const lockNote = judgeParagraph(doc, "Turning this off blocks new illustrations and exports. No identity engine is certified here.", "lg-cont-caption");
        const controls = judgeNode(doc, "section", "lg-cont-identity");
        controls.append(identity, lockNote);
        const status = judgeStatus(doc, message);
        const time = judgeParagraph(doc, performanceText(timing.summary("preview")), "lg-cont-caption");
        time.id = "lg-cont-timing";
        const footer = tourFooter(doc, actions);
        const disclosures = judgeParagraph(doc, "Drawn sample. Local simulation. Mock or disabled YouCam branch. "
            + "No voice, logos, API units or tracking.", "lg-cont-caption");
        body.append(header, accessibility.panel(), tourProgress(doc, snapshot), stage, controls, status, time, footer, disclosures);
        host.replaceChildren(body);
        safePreview();
        accessibility.afterRender(snapshot.step, title);
    }
    function openSample() {
        sequence.invalidate("source-changed");
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        image.samplePair();
        const subjects = image.subjects.snapshot;
        state.chooseDrawnSource(subjects.revision, subjects.boxes.length, subjects.selectedId);
        cassette.warm(state.snapshot, true);
        evidence.reset();
        timing.reset();
        operator.reset(subjects.revision);
        message = "Two original drawn figures opened. Main subject selected.";
        render();
    }
    function chooseSubject(id) {
        sequence.invalidate("source-changed");
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        const accepted = image.chooseSubject(id);
        if (state.selectSubject(id, accepted)) {
            cassette.warm(state.snapshot, image.subjects.snapshot.source === "drawn");
            operator.reset(state.snapshot.sourceRevision);
            message = "Selected figure updated; stale edits and export proof cleared.";
            render();
        }
    }
    function setConsent(key, enabled) {
        sequence.invalidate("source-changed");
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        state.setPermission(key, enabled);
        cassette.warm(state.snapshot, image.subjects.snapshot.source === "drawn");
        if (!enabled)
            operator.reset(state.snapshot.sourceRevision);
        message = enabled ? "Permission granted for this local session."
            : "Permission withdrawn; dependent effects cleared.";
        render();
    }
    function setLock(enabled) {
        sequence.invalidate("source-changed");
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        state.setIdentityLock(enabled);
        cassette.warm(state.snapshot, image.subjects.snapshot.source === "drawn");
        if (!enabled)
            operator.reset(state.snapshot.sourceRevision);
        message = enabled ? "Identity lock requested; actual engine still unverified."
            : "Identity lock is off; further edits and export are disabled.";
        render();
    }
    function setStrength(effect, level) {
        sequence.invalidate("source-changed");
        try {
            replay.stop("idle", false);
            frames.invalidate();
            offlineImport.invalidate();
            preparationRevision += 1;
            exporter.invalidate();
            receipt.invalidate();
            state.setStrength(effect, level);
            cassette.warm(state.snapshot, image.subjects.snapshot.source === "drawn");
            debounce.schedule(`level-${state.snapshot.sourceRevision}-${effect}-${level}`, safePreview);
        }
        catch {
            message = "Intensity must be between 1.0 and 5.0 in 0.1 increments.";
        }
    }
    function applyEffect(effect) {
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        const success = state.apply(effect);
        message = success ? "Illustrative setting recorded. Production engine evidence is separate."
            : "Choose the main figure, give consent and enable identity lock first.";
        render();
    }
    function setAppearance(cue) {
        sequence.invalidate("source-changed");
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        state.setAppearance(cue);
        message = "Style cue selected. This is not a gender inference.";
        render();
    }
    function reviewCommand(name) {
        if (state.reviewCommand(name)) {
            message = "Command reviewed. Public owner execution is not asserted.";
            render();
        }
    }
    function selectSeasonal(id) {
        exporter.invalidate();
        receipt.invalidate();
        const available = seasonal.snapshot.cards.find((card) => card.id === id && card.available);
        if (!available)
            return;
        state.selectSeason(id);
        message = "Seasonal card selected. No styling action has run.";
        render();
    }
    function setMode(mode) {
        sequence.invalidate("source-changed");
        replay.stop("idle", false);
        frames.invalidate();
        offlineImport.invalidate();
        preparationRevision += 1;
        exporter.invalidate();
        receipt.invalidate();
        state.chooseMockMode(mode);
        cassette.warm(state.snapshot, image.subjects.snapshot.source === "drawn");
        message = mode === "off" ? "Provider branch switched off." : "Mock-only branch selected.";
        render();
    }
    function tryon() {
        sequence.invalidate("source-changed");
        exporter.invalidate();
        receipt.invalidate();
        const snapshot = state.snapshot;
        const port = snapshot.mockMode === "off" ? localTourTryon("off") : options.tryon ?? localTourTryon();
        try {
            if (port.mode !== snapshot.mockMode)
                throw new Error("Mock provider mode mismatch");
            const answer = checkedTourOutcome(port.preview({
                sourceRevision: snapshot.sourceRevision,
                selectedId: snapshot.selectedId ?? "",
                localConsent: snapshot.permissions.local,
                mockConsent: snapshot.permissions.mock,
                identityLock: snapshot.identityLock,
            }));
            state.recordTryon(answer.result);
            if (answer.result === "mock-applied")
                observe("mock");
            message = answer.copy;
        }
        catch {
            message = "Mock preview refused. Original image retained without provider activity.";
        }
        render();
    }
    function setComparison(percent) {
        state.compare(percent);
        const compare = host.querySelector(".lg-cont-canvas");
        if (!compare || !image.hasImage)
            return;
        const altered = doc.createElement("canvas");
        try {
            drawContinuousPreview(image.original, altered, state.snapshot, image.subjects.snapshot);
            drawJudgeComparison(image.original, altered, compare, percent);
        }
        catch {
            message = "Comparison unavailable. Original image retained.";
        }
        finally {
            altered.width = 0;
            altered.height = 0;
        }
    }
    async function download() {
        const result = await exporter.start();
        if (disposed)
            return;
        message = result.message;
        render();
    }
    function next() {
        sequence.invalidate("step-changed");
        const current = state.snapshot.step;
        if (!state.next()) {
            message = state.readiness(current).reason || "Complete the current action or choose Skip.";
            render();
            return;
        }
        evidence.record("completed", current, Math.max(0, now() - started));
        message = "";
        render();
    }
    function skip() {
        sequence.invalidate("step-changed");
        const previous = state.snapshot.step;
        if (state.next(true)) {
            evidence.record("skipped", previous, Math.max(0, now() - started));
            message = "Skipped steps are not evidence of a working effect.";
            render();
        }
    }
    function back() {
        sequence.invalidate("step-changed");
        if (state.back()) {
            message = "";
            render();
        }
    }
    function exit() {
        if (disposed)
            return;
        dispose();
        onExit();
    }
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        sequence.dispose();
        accessibility.dispose();
        doc.removeEventListener("visibilitychange", onVisibility);
        debounce.dispose();
        exporter.dispose();
        receipt.dispose();
        seasonal.dispose();
        evidence.dispose();
        timing.dispose();
        operator.dispose();
        cassette.dispose();
        offlineImport.dispose();
        replay.dispose();
        frames.dispose();
        preparationRevision += 1;
        state.dispose();
        image.dispose();
        host.replaceChildren();
    }
    function operatorCommand(fn) {
        try {
            fn();
            message = "Operator self-report updated; no external result has been certified.";
        }
        catch {
            message = "Manual check unavailable. No status was accepted.";
        }
        render();
    }
    const cassetteActions = {
        choose(id) {
            const result = cassette.choose(id, state.snapshot, image.subjects.snapshot.source === "drawn");
            message = result?.status === "ready"
                ? "Offline illustration viewed; no provider result or unit expenditure."
                : "Cached illustration unavailable. No live fallback will run.";
            render();
        },
        addToBag() {
            const added = cassette.addToBag(state.snapshot, image.subjects.snapshot.source === "drawn");
            message = added ? "Example category added to a demo-only bag. No price or payment."
                : "No eligible cached example. The bag is unchanged.";
            render();
        },
        removeFromBag(id) {
            cassette.removeFromBag(id);
            message = "Example removed from the local demonstration bag.";
            render();
        },
        acknowledge(checked) {
            cassette.acknowledge(checked);
            message = "Separate page acknowledgement does not transfer consent or start a task.";
            render();
        },
    };
    const replayActions = {
        play: () => { replay.start(); },
        pause: () => replay.pause(),
        resume: () => { replay.resume(); },
        advance: () => { replay.advance(); },
        stop: () => replay.stop(),
    };
    const frameActions = {
        prepare() {
            replay.stop("idle", false);
            void frames.prepare().then((result) => {
                if (disposed)
                    return;
                message = result.phase === "ready"
                    ? "Three local drawings cached. No provider work or upload occurred."
                    : "Cache refused or invalidated; no live fallback is available.";
                render();
            });
        },
        choose(id) {
            replay.stop("idle", false);
            message = frames.select(id)
                ? "Local drawing replayed from temporary memory, without provider units."
                : "Cached drawing was unavailable or expired. No provider task ran.";
            render();
        },
        clear() {
            replay.stop("idle", false);
            frames.invalidate();
            message = "Temporary local images cleared; original drawing unchanged.";
            render();
        },
        report() {
            try {
                downloadFrameReport(doc, frames.snapshot);
                message = "Photo-free local cache report requested; no live results asserted.";
            }
            catch {
                message = "Unable to prepare local cache report. No image was sent.";
            }
            render();
        },
    };
    const offlineImportActions = {
        async load(manifest, png) {
            const result = await offlineImport.load(manifest, png);
            if (disposed)
                return;
            message = result.phase === "ready"
                ? "Local PNG checksum verified. Provider and real-face provenance remain unverified."
                : "Local file inspection did not pass. No live fallback was requested.";
            render();
        },
        clear() {
            offlineImport.invalidate();
            message = "Temporary local preview cleared. No image was stored.";
            render();
        },
        async prepare(png, family) {
            if (!(png instanceof Blob))
                return;
            const current = () => offlineImportAuthority(state.snapshot, image.subjects.snapshot.source === "drawn", family);
            const authority = current();
            if (!authority) {
                message = "Local consent, selected figure and identity lock are required.";
                render();
                return;
            }
            const ticket = ++preparationRevision;
            try {
                const manifest = await prepareOfflineReplayManifest(png, family);
                if (disposed || ticket !== preparationRevision
                    || !sameOfflineImportAuthority(authority, current()))
                    return;
                downloadPreparedManifest(doc, preparedManifestBlob(manifest));
                message = "Companion JSON requested. It contains a local image hash, not provider proof.";
            }
            catch {
                if (disposed || ticket !== preparationRevision)
                    return;
                message = "Companion JSON could not be prepared. No file was uploaded.";
            }
            render();
        },
    };
    const sequenceActions = {
        play: () => { sequence.play(); },
        pause: () => sequence.pause(),
        resume: () => { sequence.resume(); },
        advance: () => { sequence.advance(); },
        stop: () => sequence.stop(),
        clear: () => sequence.clear(),
        shotList: () => {
            try {
                downloadShotList(doc, checkedShotList(sequence.snapshot));
                message = "Photo-free shot list requested; it does not establish a production result.";
            }
            catch {
                message = "Shot list unavailable; a completed local sequence is required.";
            }
            render();
        },
    };
    const operatorActions = {
        start: () => operatorCommand(() => operator.start()),
        pause: () => operatorCommand(() => { operator.clock.pause(); }),
        resume: () => operatorCommand(() => { operator.clock.resume(); }),
        stop: () => operatorCommand(() => operator.clock.stop()),
        visit: (id) => operatorCommand(() => { operator.open(id); }),
        acknowledge: (id) => operatorCommand(() => { operator.acknowledge(id); }),
        refuse: (id, reason) => operatorCommand(() => {
            operator.refuse(id, reason);
        }),
        clear: (id) => operatorCommand(() => { operator.clear(id); }),
        export: () => operatorCommand(() => {
            const report = safeOperatorReport(operator.snapshot);
            saveOperatorReport(doc, serializeOperatorReport(report));
        }),
    };
    const actions = {
        openSample, selectSubject: chooseSubject, setConsent, setLock, setStrength,
        applyEffect, setAppearance, reviewCommand, selectSeasonal,
        setMode, tryon, setComparison, download: () => { void download(); },
        back, next, skip, exit,
    };
    render();
    return { state, image, render, dispose };
}
