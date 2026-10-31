import { auditContinuousControls, auditLabel } from "./accessibility-audit.js";
import { downloadAuditReport, makeAuditReport } from "./accessibility-report.js";
import { ContinuousFocusSession } from "./focus-session.js";
import { compareContinuousAudits, continuousAuditDeltaCaption } from "./accessibility-delta.js";
import { ContinuousKeyboardSession } from "./keyboard-session.js";
import { renderContinuousKeyboardPanel } from "../../ui/shell/continuous-keyboard-panel.js";
/** Fixed state metadata only. No image, upload, name or form value is persisted. */
function authority(state) {
    return JSON.stringify([
        state.step,
        state.sourceLoaded,
        state.sourceRevision,
        state.selectedId,
        state.identityLock,
        state.permissions.local,
        state.permissions.hair,
        state.permissions.face,
        state.permissions.mock,
        state.levels,
        state.applied,
        state.appearanceCue,
        state.mockMode,
    ]);
}
export class ContinuousAccessibilitySession {
    options;
    focus = new ContinuousFocusSession();
    keyboard;
    report = null;
    status = "Run the local control check when you want to inspect this screen.";
    lastStep = null;
    lastAuthority = null;
    disposed = false;
    constructor(options) {
        this.options = options;
        this.keyboard = new ContinuousKeyboardSession(options.host, {
            exit: options.onExit,
            changed: options.rerender,
        }, this.focus);
    }
    get hasReport() {
        return this.report !== null;
    }
    get helpOpen() {
        return this.keyboard.helpOpen;
    }
    /** Called before DOM replacement, so the original active button still exists. */
    beforeRender(state) {
        if (this.disposed)
            return false;
        this.focus.capture(this.options.doc, this.options.host, this.lastStep);
        const next = authority(state);
        const changed = next !== this.lastAuthority;
        if (changed) {
            this.report = null;
            this.status = "The current controls have not been checked in this state.";
        }
        const newStep = state.step !== this.lastStep;
        this.lastAuthority = next;
        this.lastStep = state.step;
        return newStep;
    }
    panel() {
        return renderContinuousKeyboardPanel(this.options.doc, {
            open: this.keyboard.helpOpen,
            auditStatus: this.status,
            hasReport: this.report !== null,
        }, {
            toggleHelp: () => this.keyboard.toggleHelp(),
            focusStep: () => this.focusStep(),
            runCheck: () => this.check(),
            saveCheck: () => this.save(),
        });
    }
    afterRender(step, title) {
        if (this.disposed)
            return;
        this.focus.restore(this.options.host, step, title);
    }
    focusStep() {
        if (this.disposed)
            return;
        const target = this.options.host.querySelector("#lg-cont-current-step");
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: "nearest" });
    }
    check() {
        if (this.disposed)
            return;
        try {
            const observation = auditContinuousControls(this.options.host);
            const next = makeAuditReport(observation);
            this.status = this.report
                ? continuousAuditDeltaCaption(compareContinuousAudits(this.report, next))
                : auditLabel(observation);
            this.report = next;
        }
        catch {
            this.report = null;
            this.status = "The local control check could not complete. No pass is claimed.";
        }
        this.focus.prefer("keyboard-audit");
        this.options.rerender();
    }
    save() {
        if (this.disposed || !this.report)
            return;
        try {
            downloadAuditReport(this.options.doc, this.report);
            this.status = "Local check download requested. Browser save is not confirmed.";
        }
        catch {
            this.status = "Unable to request the local report. No data was uploaded.";
        }
        this.focus.prefer("keyboard-audit-download");
        this.options.rerender();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.keyboard.dispose();
        this.focus.dispose();
        this.report = null;
        this.lastStep = null;
        this.lastAuthority = null;
    }
}
