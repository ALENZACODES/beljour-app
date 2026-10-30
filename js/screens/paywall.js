/** Paywall demo screen (round 2 plan §5.3 and §6). DEMO ONLY: no billing, no card, no store
 * payment and no network call of any kind. It exists so judges and investors can see the
 * planned model: a 3-day free trial, then $5.99 a month or $49.99 a year.
 *
 * Binding rules, enforced by `paywallDecision` and tested:
 * - Pro appears only at Save, never over a preview.
 * - Bad Day Rescue, every slider, the Trust Centre and deleting her data are never locked.
 * - The screen always says it is a demo and that nothing is charged.
 * Author: John Khan.
 */
export const PRICES = Object.freeze({ trialDays: 3, monthly: 5.99, yearly: 49.99, currency: "USD" });
export const DEMO_NOTE = "Demo — no billing. Nothing is charged and no card is asked for.";
/** Things the paywall may never stand in front of. */
export const NEVER_LOCKED = Object.freeze(["rescue", "sliders", "trust", "delete", "preview", "export-original"]);
export function paywallDecision(ctx) {
    if (ctx.moment !== "save")
        return { show: false, reason: `The paywall never appears at ${ctx.moment}; only at Save.` };
    if (!ctx.usesPro)
        return { show: false, reason: "Nothing in this look is Pro, so saving is free." };
    if (ctx.trialStarted)
        return { show: false, reason: "The demo trial is running." };
    return { show: true, reason: "This look uses a Pro preset; the demo plan is shown before saving." };
}
/** True when a feature is never behind the paywall. */
export function isAlwaysFree(feature) {
    return NEVER_LOCKED.includes(feature);
}
export const money = (v) => `$${v.toFixed(2)}`;
export function paywallCopy() {
    const yearlyPerMonth = PRICES.yearly / 12;
    const saving = Math.round((1 - PRICES.yearly / (PRICES.monthly * 12)) * 100);
    return {
        title: "BELJOUR Pro",
        trial: `${PRICES.trialDays}-day free trial, then ${money(PRICES.monthly)}/month or ${money(PRICES.yearly)}/year.`,
        plans: [
            { id: "monthly", label: "Monthly", price: `${money(PRICES.monthly)}/month`, note: "Cancel any time." },
            { id: "yearly", label: "Yearly", price: `${money(PRICES.yearly)}/year`, note: `About ${money(yearlyPerMonth)} a month, ${saving}% less than monthly.` },
        ],
        free: ["Bad Day Rescue", "Every slider", "Trust Centre", "Delete my data", "Save the photo without the Pro preset"],
        demo: DEMO_NOTE,
        actions: [
            { id: "trial", label: `Start the ${PRICES.trialDays}-day demo trial` },
            { id: "save-free", label: "Save without Pro" },
            { id: "close", label: "Not now" },
        ],
    };
}
export const TRIAL_KEY = "beljour.demo-trial";
/** Demo trial state, kept in this browser only. No account, no server, no card. */
export class DemoTrial {
    store;
    now;
    constructor(store, now = () => Date.now()) {
        this.store = store;
        this.now = now;
    }
    start() {
        const started = this.now();
        try {
            this.store.setItem(TRIAL_KEY, String(started));
        }
        catch { /* page-only demo */ }
        return started;
    }
    daysLeft() {
        let raw = null;
        try {
            raw = this.store.getItem(TRIAL_KEY);
        }
        catch {
            return null;
        }
        if (raw === null || !/^\d+$/.test(raw))
            return null;
        const left = PRICES.trialDays - (this.now() - Number(raw)) / 86_400_000;
        return Math.max(0, Math.ceil(left));
    }
    get active() { const d = this.daysLeft(); return d !== null && d > 0; }
}
/** Render the dialog into `host`. `onAction` gets the chosen action id. Never calls the network. */
export function renderPaywall(doc, host, onAction) {
    const copy = paywallCopy();
    const dialog = doc.createElement("section");
    dialog.className = "lg-paywall";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-labelledby", "lg-paywall-title");
    const title = doc.createElement("h2");
    title.id = "lg-paywall-title";
    title.textContent = copy.title;
    const demo = doc.createElement("p");
    demo.className = "lg-paywall-demo";
    demo.textContent = copy.demo;
    const trial = doc.createElement("p");
    trial.textContent = copy.trial;
    const plans = doc.createElement("ul");
    for (const plan of copy.plans) {
        const li = doc.createElement("li");
        li.textContent = `${plan.label}: ${plan.price}. ${plan.note}`;
        plans.append(li);
    }
    const free = doc.createElement("p");
    free.className = "lg-small";
    free.textContent = "Always free: " + copy.free.join(", ") + ".";
    const actions = doc.createElement("div");
    actions.className = "lg-paywall-actions";
    for (const a of copy.actions) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = a.id === "trial" ? "shell-button shell-primary" : "shell-button";
        b.dataset.action = a.id;
        b.textContent = a.label;
        b.addEventListener("click", () => onAction(a.id));
        actions.append(b);
    }
    dialog.append(title, demo, trial, plans, free, actions);
    host.replaceChildren(dialog);
    return dialog;
}
//# sourceMappingURL=paywall.js.map