/** R17B local studio user interface. Author: John Khan. */
import { CARDS, card } from "./catalogue.js";
import { Cancelled, Client } from "./client.js";
import { downloadPng, openLocal } from "./files.js";
import { fixture } from "./fixture.js";
import { Session } from "./session.js";
function option(value, label = value) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
}
function imageDataPixels(source) {
    const out = new Uint8ClampedArray(new ArrayBuffer(source.length));
    out.set(source);
    return out;
}
export function mount(root) {
    const session = new Session();
    const client = new Client();
    root.innerHTML = `
    <div class="r17-shell">
      <header>
        <p class="eyebrow">LOCAL LAB · ON THIS DEVICE</p>
        <h1>Hair, makeup and finish lab</h1>
        <p>Photos are not uploaded. Local simulations and estimates. The drawn sample is not a test on a real face.</p>
      </header>
      <section class="studio-grid">
        <aside class="panel controls">
          <label>Feature<select id="r17-feature"></select></label>
          <label>Style<select id="r17-style"></select></label>
          <label>Amount <output id="r17-amount-out">55 %</output><input id="r17-amount" type="range" min="0" max="100" value="55"></label>
          <label>Humidity <output id="r17-humidity-out">55 %</output><input id="r17-humidity" type="range" min="0" max="100" value="55"></label>
          <label>Full-look direction<select id="r17-direction"><option>neutral</option><option>feminine</option><option>masculine</option></select></label>
          <label>Signal strength<select id="r17-level"><option>normal</option><option>extra</option><option>hyper</option></select></label>
          <div class="buttons">
            <button id="r17-fixture">Synthetic fixture</button>
            <label class="file-button">Open local photo<input id="r17-file" type="file" accept="image/*"></label>
            <button id="r17-run" class="primary">Run locally</button>
            <button id="r17-cancel">Cancel</button>
          </div>
          <article id="r17-copy"></article>
        </aside>
        <main class="panel canvas-panel">
          <div class="canvas-tools">
            <button id="r17-compare">Show original</button>
            <button id="r17-save">Download labelled PNG</button>
          </div>
          <canvas id="r17-canvas" width="96" height="112"></canvas>
          <p id="r17-status" role="status">Load the synthetic fixture or a local photo.</p>
          <details><summary>Local metrics</summary><pre id="r17-metrics"></pre></details>
        </main>
      </section>
    </div>`;
    const feature = root.querySelector("#r17-feature");
    const style = root.querySelector("#r17-style");
    const amount = root.querySelector("#r17-amount");
    const amountOut = root.querySelector("#r17-amount-out");
    const humidity = root.querySelector("#r17-humidity");
    const humidityOut = root.querySelector("#r17-humidity-out");
    const direction = root.querySelector("#r17-direction");
    const level = root.querySelector("#r17-level");
    const canvas = root.querySelector("#r17-canvas");
    const status = root.querySelector("#r17-status");
    const metrics = root.querySelector("#r17-metrics");
    const copy = root.querySelector("#r17-copy");
    const file = root.querySelector("#r17-file");
    const context = canvas.getContext("2d");
    for (const item of CARDS) {
        feature.append(option(item.id, `${item.id} · ${item.name}`));
    }
    let before = false;
    function draw() {
        const active = session.fixture;
        if (!active) {
            return;
        }
        const source = active.photo;
        const result = session.result;
        const pixels = !before && result ? result.pixels : source.data;
        const width = !before && result ? result.width : source.width;
        const height = !before && result ? result.height : source.height;
        canvas.width = width;
        canvas.height = height;
        context.putImageData(new ImageData(imageDataPixels(pixels), width, height), 0, 0);
    }
    function configure() {
        const selected = card(session.feature);
        style.replaceChildren(...selected.styles.map((value) => option(value)));
        style.value = session.style;
        copy.innerHTML = `<h2>${selected.name}</h2><p>${selected.summary}</p><p class="limit">${selected.limitation}</p>`;
        humidity.closest("label")?.classList.toggle("hidden", selected.id !== "W44");
        direction.closest("label")?.classList.toggle("hidden", selected.family !== "gender");
        level.closest("label")?.classList.toggle("hidden", selected.family !== "gender");
        draw();
    }
    async function run() {
        let job;
        try {
            job = session.job();
            status.textContent = "Rendering locally…";
            const result = await client.run(job);
            if (!session.complete(job, result)) {
                return;
            }
            before = false;
            status.textContent = `${result.label} · ${result.elapsedMs.toFixed(1)} ms on this device`;
            metrics.textContent = JSON.stringify(result.metrics, null, 2);
            draw();
        }
        catch (error) {
            if (job) {
                session.fail(job);
            }
            if (error instanceof Cancelled) {
                return;
            }
            status.textContent = error instanceof Error ? error.message : "Local render failed";
        }
    }
    root.querySelector("#r17-fixture").addEventListener("click", () => {
        session.load(fixture());
        status.textContent = "Synthetic drawn fixture loaded. It is not real-face evidence.";
        configure();
    });
    file.addEventListener("change", async () => {
        const selected = file.files?.[0];
        if (!selected) {
            return;
        }
        try {
            session.load(await openLocal(selected));
            status.textContent =
                "Photo opened locally. Automatic hair/skin masks are not fabricated; features requiring masks remain unavailable until local masks are supplied.";
            configure();
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not open image";
        }
    });
    feature.addEventListener("change", () => {
        session.select(feature.value);
        configure();
    });
    style.addEventListener("change", () => {
        session.style = style.value;
        session.invalidate();
        draw();
    });
    amount.addEventListener("input", () => {
        session.amount = Number(amount.value) / 100;
        amountOut.value = `${amount.value} %`;
        session.invalidate();
        draw();
    });
    humidity.addEventListener("input", () => {
        session.humidity = Number(humidity.value);
        humidityOut.value = `${humidity.value} %`;
        session.invalidate();
        draw();
    });
    direction.addEventListener("change", () => {
        session.direction = direction.value;
        session.invalidate();
    });
    level.addEventListener("change", () => {
        session.level = level.value;
        session.invalidate();
    });
    root.querySelector("#r17-run").addEventListener("click", () => void run());
    root.querySelector("#r17-cancel").addEventListener("click", () => {
        client.cancel();
        status.textContent = "Preview cancelled; original retained.";
    });
    root.querySelector("#r17-compare").addEventListener("click", (event) => {
        before = !before;
        event.currentTarget.textContent = before ? "Show simulation" : "Show original";
        draw();
    });
    root.querySelector("#r17-save").addEventListener("click", () => {
        const result = session.result;
        if (!result) {
            return;
        }
        const output = document.createElement("canvas");
        output.width = result.width;
        output.height = result.height + 42;
        const outputContext = output.getContext("2d");
        outputContext.putImageData(new ImageData(imageDataPixels(result.pixels), result.width, result.height), 0, 0);
        outputContext.fillStyle = "#fff";
        outputContext.fillRect(0, result.height, result.width, 42);
        outputContext.fillStyle = "#111";
        outputContext.font = "12px system-ui";
        outputContext.fillText(`${session.feature} · SIMULATION / ESTIMATE · LOCAL`, 8, result.height + 25);
        downloadPng(output, `beljour-r17b-${session.feature.toLowerCase()}-simulation.png`);
    });
    session.load(fixture());
    configure();
    return () => client.cancel();
}
const root = document.getElementById("r17b-root");
if (root) {
    const dispose = mount(root);
    window.addEventListener("pagehide", dispose, { once: true });
}
