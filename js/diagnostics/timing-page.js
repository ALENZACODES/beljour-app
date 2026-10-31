/** Hash-route timing panel on Home. A run starts only after a user clicks. */
import { measureSyntheticTiming } from "./timing-sampler.js";
import { safeTimingJson, timingReportText } from "./timing-report.js";
function dom(doc, tag, text = "") {
    const node = doc.createElement(tag);
    node.textContent = text;
    return node;
}
/** Parameter for the opt-in headless script; ordinary users get browser timings. */
function measurementEnvironment(location) {
    const query = new URLSearchParams(location.search);
    if (query.get("headless_cpu") === "4" && query.get("mode") === "testing") {
        return { environment: "headless-cpu-throttled", cpuThrottleFactor: 4 };
    }
    return { environment: "browser", cpuThrottleFactor: null };
}
export function mountTimingPage(doc, host, browser) {
    const controller = new AbortController();
    const panel = dom(doc, "section");
    panel.className = "lg-timing-panel";
    panel.setAttribute("aria-label", "Local timing measurements");
    const heading = dom(doc, "h2", "Device timing diagnostics");
    heading.id = "lg-timing-title";
    const intro = dom(doc, "p", "Measure synthetic Canvas preview and 12 MP raster timings on this device.");
    const privacy = dom(doc, "p", "No photos, models, API calls or analytics are used. Nothing is uploaded.");
    const caveat = dom(doc, "p", "This is a raster reference, not the full editor or encoded export.");
    const run = dom(doc, "button", "Measure on this device");
    run.id = "lg-timing-run";
    run.type = "button";
    const cancel = dom(doc, "button", "Stop measuring");
    cancel.id = "lg-timing-cancel";
    cancel.type = "button";
    cancel.disabled = true;
    const back = dom(doc, "a", "Return to Home");
    back.href = "#home";
    const status = dom(doc, "p", "No measurements yet.");
    status.id = "lg-timing-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const reportArea = dom(doc, "section");
    reportArea.id = "lg-timing-results";
    const evidence = dom(doc, "pre");
    evidence.id = "lg-timing-json";
    evidence.hidden = true;
    const download = dom(doc, "button", "Save photo-free timing report");
    download.id = "lg-timing-save";
    download.type = "button";
    download.disabled = true;
    panel.append(heading, intro, privacy, caveat, run, cancel, back, status, reportArea, evidence, download);
    host.replaceChildren(panel);
    let current = null;
    let last = null;
    let disposed = false;
    const stop = () => {
        current?.abort();
        current = null;
        cancel.disabled = true;
        run.disabled = false;
    };
    cancel.addEventListener("click", () => {
        stop();
        status.textContent = "Measurement stopped. No report saved.";
    });
    run.addEventListener("click", () => {
        if (current || disposed)
            return;
        current = new AbortController();
        const active = current;
        last = null;
        download.disabled = true;
        run.disabled = true;
        cancel.disabled = false;
        reportArea.replaceChildren();
        evidence.textContent = "";
        const environment = measurementEnvironment(browser.location);
        void measureSyntheticTiming(doc, {
            iterations: 7,
            signal: active.signal,
            environment: environment.environment,
            cpuThrottleFactor: environment.cpuThrottleFactor,
            onProgress: (done, total) => { status.textContent = `Measuring ${done} of ${total} frames…`; },
        }).then((report) => {
            if (disposed || active.signal.aborted)
                return;
            last = report;
            evidence.textContent = safeTimingJson(report);
            download.disabled = false;
            const headline = dom(doc, "p", timingReportText(report));
            const limitations = dom(doc, "p", report.limitations.join(" "));
            limitations.className = "lg-timing-limits";
            reportArea.replaceChildren(headline, limitations);
            status.textContent = "Measurement complete. Median and p95 shown below.";
        }).catch(() => {
            if (!disposed && !active.signal.aborted) {
                status.textContent = "Timing unavailable: Canvas or memory limits prevented completion.";
            }
        }).finally(() => {
            if (current === active) {
                current = null;
                run.disabled = false;
                cancel.disabled = true;
            }
        });
    });
    download.addEventListener("click", () => {
        if (!last)
            return;
        const blob = new Blob([safeTimingJson(last)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = dom(doc, "a");
        link.href = url;
        link.download = "beljour-local-timing.json";
        doc.body.append(link);
        try {
            link.click();
        }
        finally {
            link.remove();
            browser.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    });
    controller.signal.addEventListener("abort", stop, { once: true });
    return {
        element: panel,
        active: () => !disposed,
        close() {
            if (disposed)
                return;
            disposed = true;
            controller.abort();
            panel.remove();
        },
    };
}
