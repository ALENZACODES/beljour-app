/** R16B studio render dispatcher. Author: John Khan. */
import { renderLip } from "../../engines/lips/index.js";
import { renderSmile, sequenceStability } from "../../engines/smile/index.js";
import { renderSkinMore } from "../../engines/skin_more/index.js";
import { card } from "./catalogue.js";
const rgbaPhoto = (job) => ({ width: job.image.width, height: job.image.height, channels: 4, data: job.image.data });
function smileAnnotation(job) { const teeth = job.regions.find(r => r.name === "teeth")?.points ?? job.regions[0]?.points ?? []; const gum = job.regions.find(r => r.name === "gum")?.points ?? []; return { teeth, gum, midline_x: .5 }; }
export function renderJob(job, clock = () => performance.now()) {
    const start = clock(), c = card(job.feature), photo = rgbaPhoto(job);
    if (c.mesh && !job.landmarks)
        throw new RangeError("checked face points required");
    let out;
    let warnings = [c.limitation];
    if (c.family === "lips") {
        const r = renderLip(photo, job.landmarks, { feature: job.feature, amount: job.amount, style: job.style });
        out = { data: r.data, report: r.report };
    }
    else if (c.family === "smile") {
        const ann = smileAnnotation(job);
        if (job.feature === "W58") {
            const a2 = { ...ann, teeth: ann.teeth.map(([x, y]) => [Math.min(1, x + .003), y]) };
            const stability = sequenceStability([ann, a2]);
            const r = renderSmile(photo, { feature: "W58", amount: job.amount, frame_annotations: [ann, a2] });
            out = { data: r.data, report: { ...r.report, ...stability } };
        }
        else {
            const r = renderSmile(photo, { feature: job.feature, amount: job.amount, annotation: ann });
            out = { data: r.data, report: r.report };
        }
    }
    else {
        const r = renderSkinMore(photo, { feature: job.feature, amount: job.amount, style: job.style, masks: job.regions, diary_values: job.diary_values, consent_local_health_data: job.health_consent });
        out = { data: r.data, report: r.report };
    }
    return { pixels: out.data, label: String(out.report.label ?? "Local cosmetic simulation."), warnings, metrics: out.report, elapsedMs: Math.max(0, clock() - start) };
}
//# sourceMappingURL=render.js.map