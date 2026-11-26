import { announce, clear, h } from "../dom.js";
import { EXPRESSIONS, ExpressionRefusal, renderExpression } from "../engines/shape/expressions.js";
import { PartRefusal } from "../engines/shape/parts.js";
import { controlIcon } from "./shape-art.js";
import { localPreviewError, measuredMesh } from "./local-preview.js";
export function expressionsSection(ctx, dependencies) {
    const source = ctx.photoSrc, points = ctx.face?.points;
    const amount = h("select", { id: "expression-amount", "aria-label": "Expression amount" }, ...[100, 75, 50, 25].map((v) => h("option", { value: String(v) }, `${v}%`)));
    amount.value = "100";
    const output = h("div", { "aria-live": "polite" });
    let revision = 0;
    const show = async (id, button) => {
        const own = ++revision;
        button.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== points || !output.isConnected)
                return;
            const result = renderExpression(image, measuredMesh(points, image.width, image.height), id, { amount: Number(amount.value) });
            clear(output);
            output.append(dependencies.paint(result.image, result.labels.join(" ")), h("p", { class: "fine" }, `Movement guard retained ${Math.round(Number(result.metrics.guardScale) * 100)}% of the requested movement.`));
            announce("Expression preview ready.");
        }
        catch (error) {
            if (own !== revision || ctx.photoSrc !== source)
                return;
            clear(output);
            output.append(error instanceof ExpressionRefusal || error instanceof PartRefusal
                ? h("p", { class: "notice notice-warn", role: "alert" }, `${error.message} Your original is unchanged.`)
                : localPreviewError(error));
        }
        finally {
            button.disabled = false;
        }
    };
    const buttons = EXPRESSIONS.map((row) => {
        const button = h("button", { type: "button", class: "btn btn-quiet", title: row.summary }, controlIcon(row.id), `Show ${row.title.toLowerCase()}`);
        button.addEventListener("click", () => show(row.id, button));
        return button;
    });
    return h("section", { class: "expressions" }, h("h2", {}, "Expressions"), h("p", {}, "Closed-mouth expression simulations on your photo: neutral, serious, surprise, soft smile and raised brows."), h("p", { class: "fine" }, "Features are moved, nothing new is drawn: no teeth, no closed eyes. The mouth must be closed in the photo."), h("label", { for: "expression-amount" }, "Amount "), amount, h("div", { class: "row" }, ...buttons), output);
}
//# sourceMappingURL=expressions.js.map