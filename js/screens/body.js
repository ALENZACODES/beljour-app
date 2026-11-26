import { bmi, posture, ratio, waistToHeight } from "../body/measure.js";
import { announce, clear, h } from "../dom.js";
import { addBody, listBody } from "../store.js";
import { spark } from "../ui/widgets.js";
import { bodyPhotoPicker } from "./bodyphoto.js";
function num(id, label, value, hint) {
    const input = h("input", { type: "number", id, inputmode: "decimal", step: "0.1", min: "0", value, "aria-describedby": `${id}-hint` });
    return [h("p", { class: "field" }, h("label", { for: id }, label), input, h("small", { id: `${id}-hint` }, hint)), input];
}
export async function renderBody(main, ctx) {
    clear(main);
    main.append(h("h1", {}, "Body check"), h("p", { class: "lede" }, "A few standard numbers, worked out on this device and kept here. Bodies come in every shape; these are general reference points, not a judgement."), h("p", { class: "notice" }, "General information, not medical advice. If anything here worries you, a doctor or nurse can put it in context."));
    const [hRow, hIn] = num("b-height", "Height (cm)", ctx.body?.heightCm ? String(ctx.body.heightCm) : "", "Needed for everything below.");
    const [wRow, wIn] = num("b-weight", "Weight (kg)", "", "Optional, for BMI.");
    const [waRow, waIn] = num("b-waist", "Waist (cm)", "", "Measured with a tape, halfway between your lowest rib and the top of your hip bone, after breathing out.");
    const [hiRow, hiIn] = num("b-hip", "Hips (cm)", "", "Optional, around the widest part.");
    const out = h("div", { "aria-live": "polite" });
    const trends = h("div", {});
    const showTrends = async () => {
        clear(trends);
        let entries = [];
        try {
            entries = await listBody();
        }
        catch {
            return;
        }
        if (entries.length < 2)
            return;
        const series = (k) => entries.map((e) => e[k]).filter((v) => typeof v === "number");
        trends.append(h("h2", {}, "Your trend on this device"), ...[["Waist (cm)", "waistCm"], ["Waist to height", "whtr"], ["BMI", "bmi"], ["Weight (kg)", "weightKg"]].map(([label, k]) => {
            const v = series(k);
            return v.length >= 2 ? h("p", { class: "trend" }, h("span", {}, `${label}: ${v[0]} then ${v[v.length - 1]}`), spark(v, label)) : "";
        }));
    };
    const calc = h("button", { class: "btn" }, "Work it out");
    calc.addEventListener("click", async () => {
        clear(out);
        const H = Number(hIn.value), W = Number(wIn.value), WA = Number(waIn.value), HI = Number(hiIn.value);
        if (!(H >= 120 && H <= 230)) {
            out.append(h("p", { class: "notice notice-error", role: "alert" }, "Enter your height in centimetres, between 120 and 230."));
            return;
        }
        const b = bmi(W, H);
        const wh = waistToHeight(WA, H, b?.value);
        const items = [
            b ? h("li", {}, h("strong", {}, `BMI ${b.value}`), `: ${b.band}. `, h("small", {}, `${b.source}. BMI doesn't tell muscle from fat and reads differently across ethnic groups and older ages.`)) : null,
            wh ? h("li", {}, h("strong", {}, `Waist to height ${wh.value}`), `: ${wh.band}. `, h("small", {}, `${wh.source}.`)) : null,
            ratio(WA, HI) ? h("li", {}, h("strong", {}, `Waist to hip ${ratio(WA, HI)}`), ". Shown as a number to track; there's no single cut off that fits everyone.") : null,
            ctx.body?.estimate && WA ? h("li", {}, h("strong", {}, `Shoulder to waist ${ratio(ctx.body.estimate.shoulders[0], WA)}`), ", using the shoulder width from your photo.") : null,
        ].filter(Boolean);
        out.append(items.length ? h("ul", { class: "plain-list" }, ...items) : h("p", {}, "Add your weight or waist to see a result."));
        try {
            await addBody({ at: new Date().toISOString(), heightCm: H, weightKg: W || undefined, waistCm: WA || undefined, hipCm: HI || undefined, bmi: b?.value, whtr: wh?.value });
        }
        catch { /* storage blocked: results still shown */ }
        announce("Body check ready.");
        await showTrends();
    });
    const postureBox = h("div", {});
    const showPosture = () => {
        clear(postureBox);
        const p = ctx.body?.pose;
        if (!p)
            return;
        postureBox.append(h("h2", {}, "Posture in this photo"), h("ul", { class: "plain-list" }, ...posture(p.landmarks, p.width, p.height).map((x) => h("li", {}, `${x.name}: ${x.note} (${Math.abs(x.degrees)} degrees).`))), h("p", { class: "fine" }, "From one front photo. Standing, camera height and loose clothes all change these. A side photo would be needed to see a forward head position."));
    };
    main.append(hRow, wRow, waRow, hiRow, h("div", { class: "row" }, calc), out, h("h2", {}, "Photo check (optional)"), bodyPhotoPicker(ctx, () => { showPosture(); }, false), postureBox, trends);
    showPosture();
    await showTrends();
}
//# sourceMappingURL=body.js.map