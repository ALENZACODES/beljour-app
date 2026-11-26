import { canvasEncoder } from "../save/export.js";
import { checkedPanelPhoto } from "./posture-panel-state.js";
import { mountPosturePanel } from "./posture-panel.js";
import { PostureOutputRefused, exportProtectedPosture, inspectPostureOutput } from "./posture-output.js";
import { preparePostureFrame } from "./posture-preview.js";
import { renderProtectedPosture } from "./posture-safe.js";
import { IdentityLockUnavailable } from "./posture-session.js";
import { PostureWorkflow } from "./posture-workflow.js";
export const REFUSED_OUTPUT_MESSAGE = "The edited image failed its safety checks and was not shown.";
export const FAILED_EDIT_MESSAGE = "This posture edit could not be made.";
export function publicPostureError(error) {
    if (error instanceof PostureOutputRefused)
        return REFUSED_OUTPUT_MESSAGE;
    if (error instanceof IdentityLockUnavailable)
        return "Identity protection is required for this edit.";
    return FAILED_EDIT_MESSAGE;
}
/** Render and gate one request; throws PostureOutputRefused if final pixels fail inspection. */
export function checkedPostureRender(frame, request, guard) {
    const prepared = preparePostureFrame(frame, request.stage === "release");
    const result = renderProtectedPosture(prepared.image, prepared.person, prepared.head, prepared.controls, request.fix, request.level, guard, request.lockLevel);
    const inspection = inspectPostureOutput(prepared.image, result, prepared.head);
    if (!inspection.passed)
        throw new PostureOutputRefused(inspection.reasons);
    return { frame: prepared, result, inspection };
}
export function installPostureScreen(parent, options) {
    let photo = null;
    let latest = null;
    const runner = (request) => {
        if (!photo)
            throw new RangeError("no photo");
        const digest = photo.digest;
        const frame = options.resolveFrame(digest);
        if (frame.image.width !== photo.width || frame.image.height !== photo.height ||
            frame.controls.view !== photo.view) {
            throw new RangeError("frame does not belong to the current photo");
        }
        return { digest, revision: request.revision, stage: request.stage,
            ...checkedPostureRender(frame, request, options.identityGuard) };
    };
    const workflow = new PostureWorkflow(runner, options.schedule);
    const run = async (stage, fix, level, lock) => {
        const outcome = await (stage === "release" ? workflow.release(fix, level, lock) : workflow.drag(fix, level, lock));
        if (outcome.status === "done") {
            if (stage === "release")
                latest = outcome.value;
            options.onFrame(outcome.value);
            return outcome.value;
        }
        if (outcome.status === "failed") {
            if (stage === "release")
                latest = null;
            options.onError(publicPostureError(outcome.error));
        }
        return null;
    };
    const deliver = (stage) => (fix, level, lock) => {
        void run(stage, fix, level, lock);
    };
    const panel = mountPosturePanel(parent, { onPreview: deliver("preview"), onRelease: deliver("release") });
    panel.setGuardAvailable(options.identityGuard !== null);
    let disposed = false;
    const open = () => {
        if (disposed)
            throw new RangeError("posture screen has been disposed");
    };
    return {
        panel,
        setPhoto(next) {
            open();
            photo = checkedPanelPhoto(next);
            latest = null;
            workflow.setPhoto();
            panel.setPhoto(photo);
        },
        clearPhoto() {
            open();
            photo = null;
            latest = null;
            workflow.setPhoto();
            panel.setPhoto(null);
        },
        latest: () => latest,
        async release() {
            open();
            const state = panel.state();
            return state.selected ? run("release", state.selected, state.level, state.lockLevel) : null;
        },
        async renderRelease(fix, level, lockLevel) {
            open();
            return run("release", fix, level, lockLevel);
        },
        async export(settings = {}, encoder = canvasEncoder()) {
            open();
            const current = latest;
            if (!current || current.stage !== "release" || !photo || current.digest !== photo.digest ||
                current.revision !== workflow.revision) {
                throw new RangeError("Release a full-size edit of the current photo before saving.");
            }
            return exportProtectedPosture(current.result, current.inspection, settings, encoder);
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            workflow.dispose();
            panel.dispose();
            photo = null;
            latest = null;
        },
    };
}
//# sourceMappingURL=posture-binding.js.map