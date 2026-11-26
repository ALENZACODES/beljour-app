/** The pricing step is informational only: no payment handler, trial or storage. */
import { paywallCopy, PRICES } from "../../screens/paywall.js";
import { judgeButton, judgeHeading, judgeNode, judgeNotice, judgeParagraph } from "./judge-elements.js";
export function judgeBillingExplanation(plan) {
    return plan === "monthly"
        ? `Illustrative price: $${PRICES.monthly.toFixed(2)} per month after a ${PRICES.trialDays}-day trial.`
        : `Illustrative price: $${PRICES.yearly.toFixed(2)} per year after a ${PRICES.trialDays}-day trial.`;
}
export function renderJudgePaywall(doc, host, onFinish) {
    const copy = paywallCopy();
    const section = judgeNode(doc, "section", "lg-judge-plans");
    section.append(judgeHeading(doc, "Pro plan illustration"));
    section.append(judgeNotice(doc, "Demo — no charge", "There is no checkout, no trial activation, no card entry and no billing code in Judge Mode."));
    section.append(judgeParagraph(doc, copy.trial));
    const list = judgeNode(doc, "div", "lg-judge-plan-grid");
    for (const row of copy.plans) {
        const plan = judgeNode(doc, "div", "lg-judge-plan");
        plan.append(judgeNode(doc, "h4", "", row.label));
        plan.append(judgeNode(doc, "strong", "lg-judge-price", row.price));
        plan.append(judgeParagraph(doc, row.note, "lg-judge-small"));
        list.append(plan);
    }
    section.append(list);
    const selection = judgeNode(doc, "div", "lg-judge-choices");
    const explanation = judgeParagraph(doc, judgeBillingExplanation("monthly"));
    const monthly = judgeButton(doc, "View monthly example", "plan-monthly", () => select("monthly"));
    const yearly = judgeButton(doc, "View annual example", "plan-yearly", () => select("yearly"));
    function select(value) {
        explanation.textContent = judgeBillingExplanation(value);
        monthly.setAttribute("aria-pressed", value === "monthly" ? "true" : "false");
        yearly.setAttribute("aria-pressed", value === "yearly" ? "true" : "false");
    }
    selection.append(monthly, yearly);
    section.append(selection, explanation);
    select("monthly");
    section.append(judgeParagraph(doc, "The following remain free: " + copy.free.join(", ") + ".", "lg-judge-small"));
    const final = judgeNode(doc, "div", "lg-judge-actions");
    final.append(judgeButton(doc, "Finish and return home", "finish", onFinish, true));
    const studio = judgeNode(doc, "a", "lg-judge-button", "Open local Studio");
    studio.href = "studio.html";
    final.append(studio);
    section.append(final);
    host.replaceChildren(section);
}
//# sourceMappingURL=judge-paywall.js.map