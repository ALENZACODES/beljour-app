/** Guided, disposable eight-step demonstration within Home's existing public URL. */
import { JUDGE_STEPS, SIMULATION_MARK, judgeIndex, } from "./judge-contract.js";
import { JudgeSession } from "./judge-session.js";
import { JudgeEvidenceLedger } from "./judge-evidence-ledger.js";
import { JudgeFailureReplay } from "./judge-failure-replay.js";
import { JudgeLiveChecks } from "./judge-live-checks.js";
import { evaluateJudgeWitness } from "./judge-proof-policy.js";
import { judgeRunbook } from "./judge-runbook.js";
import { judgeDemoReadiness } from "./judge-demo-readiness.js";
import { readDemoCapabilities } from "../mobile/judge-demo-preflight.js";
import { renderJudgeRunbookPanel } from "../ui/shell/judge-runbook-panel.js";
import { renderJudgeProofPanel } from "../ui/shell/judge-proof-panel.js";
import { renderJudgePreflightPanel } from "../ui/shell/judge-preflight-panel.js";
import { renderJudgeReadinessPanel } from "../ui/shell/judge-readiness-panel.js";
import { renderJudgeLivePanel } from "../ui/shell/judge-live-panel.js";
import { renderJudgeFailurePanel } from "../ui/shell/judge-failure-panel.js";
import { renderJudgeDeviceSelfCheckPanel } from "../ui/shell/judge-device-selfcheck-panel.js";
import { mockIdentityLock } from "./identity-lock.js";
import { PreviewDebouncer, previewKey } from "./strength-scale.js";
import { JudgeRehearsal, observeRehearsalVisibility } from "./judge-rehearsal.js";
import { attachJudgeKeys, announceJudgeStep, prepareJudgeRegion } from "../mobile/judge-accessibility.js";
import { judgeConnectionState, observeJudgeConnection } from "../mobile/judge-connectivity.js";
import { renderJudgeGuide } from "../ui/shell/judge-guide.js";
import { preflightJudgeFile } from "../ui/shell/judge-file-check.js";
import { renderJudgeReport } from "../ui/shell/judge-report.js";
import { renderJudgeCompare } from "../ui/shell/judge-compare.js";
import { renderJudgeConsent } from "../ui/shell/judge-consent.js";
import { renderJudgeFace, renderJudgeHair, renderJudgeMock } from "../ui/shell/judge-edits.js";
import { JudgePreviewCache } from "../ui/shell/preview-cache.js";
import { judgeButton, judgeNode, judgeParagraph, judgeStatus } from "../ui/shell/judge-elements.js";
import { renderJudgeExport } from "../ui/shell/judge-export-screen.js";
import { prepareJudgeDownload, startJudgeDownload } from "../ui/shell/judge-export.js";
import { JudgeImage } from "../ui/shell/judge-image.js";
import { renderJudgePaywall } from "../ui/shell/judge-paywall.js";
import { renderJudgeSource } from "../ui/shell/judge-source.js";
import { renderJudgeFiveEditPanel } from "../ui/shell/judge-five-edit-panel.js";
import { localJudgeMock } from "./judge-provider-mock.js";
import { attachSubjectPicker } from "../ui/shell/subject-picker.js";
import { renderJudgeIsolationPanel } from "../ui/shell/judge-isolation-panel.js";
/** No general photo/editor/provider state is read or modified by this walkthrough. */
export function mountJudgeMode(doc, host, onExit) {
    const session = new JudgeSession();
    const evidence = new JudgeEvidenceLedger();
    const failureReplay = new JudgeFailureReplay();
    const liveChecks = new JudgeLiveChecks();
    const image = new JudgeImage(doc);
    const lock = mockIdentityLock();
    const mockPreview = localJudgeMock();
    const cache = new JudgePreviewCache();
    const preview = new PreviewDebouncer();
    const rehearsal = new JudgeRehearsal();
    rehearsal.start();
    const stopVisibility = observeRehearsalVisibility(rehearsal, doc);
    let disposed = false;
    let message = "";
    let showGuide = false;
    let sourceRevision = 0;
    let connection = judgeConnectionState(null);
    const capabilities = readDemoCapabilities(doc);
    const observed = (code) => {
        evidence.record(code, rehearsal.elapsedMs());
    };
    prepareJudgeRegion(host, "lg-judge-title");
    const stopKeys = attachJudgeKeys(host, {
        exit: () => exit(),
        toggleHelp: () => {
            showGuide = !showGuide;
            render("guide");
        },
    });
    const stopConnection = doc.defaultView
        ? observeJudgeConnection(doc.defaultView, (state) => {
            connection = state;
            const node = host.querySelector("#lg-judge-connection");
            if (node)
                node.textContent = state.message;
        })
        : () => undefined;
    const ticker = doc.defaultView?.setInterval(() => {
        if (disposed)
            return;
        const node = host.querySelector("#lg-judge-elapsed");
        if (node)
            node.textContent = `Rehearsal time ${rehearsal.snapshot().display}`;
    }, 1000);
    const enhancements = () => ({
        lock,
        cache,
        revision: sourceRevision,
        canEdit: image.canIllustrate,
        onDetail: (detail, enabled) => changeDetail(detail, enabled),
        onStrength: (strength) => {
            if (!session.setStrength(strength))
                return;
            evidence.changedEdit();
            const state = session.snapshot;
            const key = previewKey({
                photo: String(sourceRevision),
                edit: JSON.stringify([state.hair, state.face, state.details, state.mock, state.step, image.activeSubject?.id]),
                strength,
                tuning: lock.snapshot.looseness,
            });
            preview.schedule(key, () => render("edit-strength"));
        },
        onTune: () => {
            evidence.changedEdit();
            preview.reset();
            render("identity-tune");
        },
    });
    const render = (keepFocus = "") => {
        if (disposed)
            return;
        const state = session.snapshot;
        if (state.step === "plans")
            observed("plans-visited");
        const witness = evaluateJudgeWitness(state, evidence.snapshot());
        const runbook = judgeRunbook(state, witness, rehearsal.elapsedMs());
        const number = judgeIndex(state.step) + 1;
        const info = JUDGE_STEPS[number - 1];
        const page = judgeNode(doc, "div", "lg-judge-screen");
        const header = judgeNode(doc, "header", "lg-judge-header");
        const heading = judgeNode(doc, "h2", "lg-judge-title", info.title);
        heading.id = "lg-judge-title";
        heading.tabIndex = -1;
        const marker = judgeParagraph(doc, `Step ${number} of ${JUDGE_STEPS.length}: ${info.short}`, "lg-judge-count");
        announceJudgeStep(marker, number, JUDGE_STEPS.length, info.short);
        const progress = judgeNode(doc, "progress", "lg-judge-progress");
        progress.max = JUDGE_STEPS.length;
        progress.value = number;
        progress.setAttribute("aria-label", "Judge walkthrough progress");
        const intro = judgeParagraph(doc, info.hint);
        const elapsed = judgeParagraph(doc, `Rehearsal time ${rehearsal.snapshot().display}`, "lg-judge-elapsed");
        elapsed.id = "lg-judge-elapsed";
        elapsed.setAttribute("aria-live", "off");
        const target = judgeParagraph(doc, "Target: three minutes. This is a single local rehearsal, not a performance test.", "lg-judge-small");
        const connectivity = judgeParagraph(doc, connection.message, "lg-judge-small");
        connectivity.id = "lg-judge-connection";
        header.append(marker, progress, heading, intro, elapsed, target, connectivity);
        const journey = judgeNode(doc, "ol", "lg-judge-steps");
        for (const [index, item] of JUDGE_STEPS.entries()) {
            const label = judgeNode(doc, "li", "lg-judge-step", `${index + 1}. ${item.short}`);
            if (item.id === state.step)
                label.setAttribute("aria-current", "step");
            if (state.complete.includes(item.id))
                label.dataset.judgeProgress = "done";
            if (state.skipped.includes(item.id))
                label.dataset.judgeProgress = "skipped";
            journey.append(label);
        }
        const surface = judgeNode(doc, "div", "lg-judge-surface");
        if (state.step === "source") {
            renderJudgeSource(doc, surface, state, image, {
                sample: () => {
                    try {
                        sourceRevision += 1;
                        image.sample();
                        cache.clear();
                        lock.reset();
                        session.selectSource("sample");
                        evidence.reset();
                        failureReplay.reset();
                        observed("source-selected");
                        message = "Drawn sample selected. Press Continue to review consent.";
                    }
                    catch {
                        message = "The illustration cannot open in this browser. You may skip this step.";
                    }
                    render("sample");
                },
                samplePair: () => {
                    try {
                        sourceRevision += 1;
                        image.samplePair();
                        cache.clear();
                        lock.reset();
                        session.selectSource("sample");
                        evidence.reset();
                        failureReplay.reset();
                        observed("source-selected");
                        message = "Two drawn adults selected. Main figure is selected; the bystander is unchanged.";
                    }
                    catch {
                        message = "Two-person illustration is unavailable in this browser.";
                    }
                    render("sample-pair");
                },
                upload: (file) => { void upload(file); },
            });
        }
        else if (state.step === "consent") {
            renderJudgeConsent(doc, surface, state, (action, enabled) => {
                consent(action, enabled);
            });
        }
        else if (state.step === "hair") {
            renderJudgeHair(doc, surface, state, image, (shade) => {
                changeHair(shade);
            }, enhancements());
        }
        else if (state.step === "face") {
            renderJudgeFace(doc, surface, state, image, (tone) => {
                changeFace(tone);
            }, enhancements());
            renderJudgeFiveEditPanel(doc, surface, state, {
                allowApply: image.canIllustrate && state.permissions.local
                    && state.permissions.hair && state.permissions.face,
                showApply: true,
                applyAll: () => {
                    if (!image.canIllustrate || !session.applyFiveIllustrations()) {
                        message = "Five edits require a checked target and local, hair and face consent.";
                    }
                    else {
                        evidence.changedEdit();
                        observed("hair-applied");
                        observed("face-applied");
                        cache.clear();
                        preview.reset();
                        message = "Five distinct illustrative layers selected. No provider was contacted.";
                    }
                    render("five-edit-apply");
                },
            });
        }
        else if (state.step === "tryon") {
            renderJudgeMock(doc, surface, state, image, () => {
                failureReplay.reset();
                const result = mockPreview.preview({
                    localConsent: state.permissions.local,
                    mockConsent: state.permissions.mock,
                    sourceReady: Boolean(state.source),
                    subjectSelected: image.canIllustrate,
                });
                if (result.status !== "illustrated" || !session.setMock(true)) {
                    message = result.description;
                }
                else {
                    observed("mock-opened");
                    evidence.changedEdit();
                    message = "Mock try-on applied locally. No provider was contacted.";
                }
                render("mock-tryon");
            }, enhancements());
            renderJudgeFailurePanel(doc, surface, failureReplay, {
                simulate: (id) => {
                    if (!failureReplay.simulate(id))
                        return;
                    session.setMock(false);
                    evidence.changedEdit();
                    cache.clear();
                    preview.reset();
                    message = "Illustrative refusal only. The local source was preserved.";
                    render(`failure-${id}`);
                },
                acknowledge: () => {
                    if (!failureReplay.acknowledge())
                        return;
                    message = "Manual retry available. No provider task has been sent.";
                    render("failure-acknowledge");
                },
                reset: () => {
                    failureReplay.reset();
                    message = "The simulated error is cleared. The original remains available.";
                    render("failure-reset");
                },
            });
        }
        else if (state.step === "compare") {
            renderJudgeCompare(doc, surface, state, image, (percent) => {
                const before = session.snapshot.comparison;
                session.setComparison(percent);
                if (session.snapshot.comparison !== before)
                    observed("comparison-moved");
            });
        }
        else if (state.step === "export") {
            renderJudgeExport(doc, surface, state, image, {
                change: (format, size, focus) => changeExport(format, size, focus),
                save: async () => {
                    if (disposed || !image.hasImage)
                        throw new Error("No image to save");
                    observed("export-attempted");
                    const result = await prepareJudgeDownload(doc, image.original, session.snapshot, image.activeSubject, image.allowUntrackedDrawing);
                    if (disposed)
                        return;
                    startJudgeDownload(doc, result);
                    observed("download-requested");
                },
            });
        }
        else {
            renderJudgePaywall(doc, surface, exit);
            renderJudgeReport(doc, surface, state, rehearsal.snapshot());
            renderJudgeProofPanel(doc, surface, witness, evidence.snapshot(), runbook);
            renderJudgeReadinessPanel(doc, surface, judgeDemoReadiness(witness, evidence.snapshot(), capabilities));
            renderJudgeLivePanel(doc, surface, liveChecks);
            renderJudgeFiveEditPanel(doc, surface, state, {
                allowApply: false,
                applyAll: () => undefined,
            });
        }
        if (image.hasImage && state.step !== "plans") {
            attachSubjectPicker(doc, surface, image.subjects.snapshot, {
                choose: (id) => {
                    if (!image.chooseSubject(id))
                        return;
                    cache.clear();
                    preview.reset();
                    evidence.changedEdit();
                    message = "Target changed. Only the selected person receives illustrative effects.";
                    render("subject-change");
                },
            });
        }
        const guide = judgeNode(doc, "div", "lg-judge-guide-mount");
        renderJudgeGuide(doc, guide, state, {
            isOpen: showGuide,
            toggle: () => {
                showGuide = !showGuide;
                render("guide");
            },
        });
        const extras = judgeNode(doc, "div", "lg-judge-demo-tools");
        renderJudgeRunbookPanel(doc, extras, runbook, witness);
        if (state.step === "source" || state.step === "plans") {
            renderJudgePreflightPanel(doc, extras, capabilities);
        }
        if (state.step === "plans")
            renderJudgeDeviceSelfCheckPanel(doc, extras, host);
        if (state.step === "plans")
            renderJudgeIsolationPanel(doc, extras);
        const status = judgeStatus(doc, message);
        status.className = "lg-judge-feedback";
        const actions = judgeNode(doc, "nav", "lg-judge-footer");
        actions.setAttribute("aria-label", "Walkthrough controls");
        const exitControl = judgeButton(doc, "Exit demo", "exit", exit);
        const backControl = judgeButton(doc, "Back", "back", back);
        backControl.disabled = number === 1;
        actions.append(exitControl, backControl);
        if (state.step !== "plans") {
            actions.append(judgeButton(doc, "Skip step", "skip", skip));
            actions.append(judgeButton(doc, "Continue", "next", next, true));
        }
        else {
            actions.append(judgeButton(doc, "Finish", "finish-footer", exit, true));
        }
        const footer = judgeParagraph(doc, `${SIMULATION_MARK}. No real YouCam request occurs in this demo.`, "lg-judge-disclaimer");
        page.append(header, journey, guide, surface, extras, status, actions, footer);
        host.replaceChildren(page);
        const focusable = [
            ...host.querySelectorAll("button"),
            ...host.querySelectorAll("input"),
            ...host.querySelectorAll("select"),
        ];
        const focussed = focusable.find((node) => node.dataset.judgeAction === keepFocus);
        if (focussed)
            focussed.focus();
        else
            heading.focus({ preventScroll: true });
    };
    async function upload(file) {
        const revision = ++sourceRevision;
        message = "Reading the selected image on this device…";
        render("export-file");
        try {
            await preflightJudgeFile(file);
            if (disposed || revision !== sourceRevision)
                return;
            const accepted = await image.upload(file);
            if (!accepted || disposed || revision !== sourceRevision)
                return;
            cache.clear();
            lock.reset();
            session.selectSource("upload");
            evidence.reset();
            failureReplay.reset();
            observed("source-selected");
            message = "Local image selected. No upload or facial tracking occurred.";
        }
        catch {
            if (disposed)
                return;
            message = "Unable to open that image. Use JPEG, PNG or WebP under 10 MB.";
        }
        render();
    }
    function consent(action, enabled) {
        session.consent(action, enabled);
        if (!enabled) {
            evidence.withdraw(action);
            failureReplay.reset();
        }
        else if (action === "local")
            observed("local-consent");
        message = enabled
            ? "Consent updated for this demonstration only."
            : "Choice withdrawn. Related illustrative edits were cleared.";
        render("consent-" + action);
    }
    function changeHair(shade) {
        const accepted = image.canIllustrate && session.setHair(shade);
        if (accepted) {
            evidence.changedEdit();
            if (shade !== "none")
                observed("hair-applied");
        }
        message = accepted
            ? "Local decorative hair overlay updated."
            : "An approved subject box and hair consent are required.";
        render("hair-" + shade);
    }
    function changeFace(tone) {
        const accepted = image.canIllustrate && session.setFace(tone);
        if (accepted) {
            evidence.changedEdit();
            if (tone !== "none")
                observed("face-applied");
        }
        message = accepted
            ? "Local decorative face overlay updated."
            : "An approved subject box and face consent are required.";
        render("face-" + tone);
    }
    function changeDetail(detail, enabled) {
        const accepted = image.canIllustrate && session.setDetail(detail, enabled);
        if (accepted) {
            evidence.changedEdit();
            cache.clear();
            preview.reset();
        }
        message = accepted
            ? "A separate illustrative detail was updated on the selected subject."
            : "A checked subject and matching local permission are required.";
        render(`detail-${detail}`);
    }
    function changeExport(format, size, focus) {
        if (!session.setExport(format, size))
            return;
        evidence.changedExport();
        message = "Export choices updated. The simulation label remains mandatory.";
        render(focus);
    }
    function next() {
        const reason = session.unmet;
        if (reason) {
            message = reason;
            render("next");
            return;
        }
        if (!session.next())
            return;
        message = "";
        render();
    }
    function skip() {
        if (!session.skip())
            return;
        message = "Previous step skipped. Unapproved actions stay off.";
        render();
    }
    function back() {
        if (!session.back())
            return;
        message = "";
        render();
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
        sourceRevision += 1;
        if (ticker !== undefined)
            doc.defaultView?.clearInterval(ticker);
        stopKeys();
        stopVisibility();
        stopConnection();
        rehearsal.stop();
        preview.dispose();
        cache.clear();
        evidence.dispose();
        failureReplay.dispose();
        liveChecks.dispose();
        image.dispose();
        session.reset();
        host.replaceChildren();
    }
    render();
    return { session, image, render, dispose };
}
//# sourceMappingURL=judge-mode.js.map