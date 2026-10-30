import { DEFAULT_STUDIO_CONTROLS, CpuStudioQuality } from './studio-quality.js';
import { CpuPoseOnly, validatePose } from './pose-only.js';
import { PhotoRegions } from './regions.js';
import { R2HBrowserSession } from './r2h-session.js';
import { checkedFrame } from './runtime.js';
export class R3HBrowserSession {
    regions = new PhotoRegions();
    studio;
    pose;
    root;
    posePresent = false;
    constructor(identity, settings = DEFAULT_STUDIO_CONTROLS, budget, clock = () => performance.now()) {
        this.studio = new CpuStudioQuality(this.regions, settings);
        this.pose = new CpuPoseOnly(this.regions);
        this.root = new R2HBrowserSession(identity, {
            studioquality: async (image, step, quality, signal) => this.studio.render(image, step.level, quality === 'preview', signal),
            poseonly: async (image, step, quality, signal) => this.pose.render(image, step.level, quality === 'preview', signal),
        }, budget, clock);
    }
    openPhoto(source, key, supplier = null, spots = [], pose = null) {
        checkedFrame(source);
        const validatedPose = pose === null ? null : validatePose(pose, source);
        const regions = supplier?.(source) ?? null;
        const held = regions === null ? null : () => regions;
        this.root.openPhoto(source, key, held, spots);
        this.regions.open(source, held);
        this.pose.openPhoto(source, validatedPose);
        this.posePresent = validatedPose !== null;
    }
    closePhoto() {
        this.root.closePhoto();
        this.regions.close();
        this.pose.closePhoto();
        this.posePresent = false;
    }
    run(plan, quality = 'export', signal, current) {
        return this.root.run(plan, quality, signal, current);
    }
    request(plan, quality = 'preview') {
        return this.root.request(plan, quality);
    }
    renderReady(ticket, scaler) {
        return this.root.renderReady(ticket, scaler);
    }
    undo() {
        return this.root.undo();
    }
    get studioMetrics() {
        return this.studio.lastMetrics;
    }
    get poseMetrics() {
        return this.pose.lastMetrics;
    }
    get state() {
        return {
            ...this.root.state,
            poseAvailable: this.posePresent,
            studioLastLevel: this.studio.lastMetrics?.level ?? null,
            poseLastLevel: this.pose.lastMetrics?.level ?? null,
        };
    }
}
//# sourceMappingURL=r3h-session.js.map