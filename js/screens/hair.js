import { clear, h } from "../dom.js";
import { HairStudio } from "../ui/studios/hair/view.js";
export function renderHair(main, ctx) {
    clear(main);
    const context = {
        mode: "classic",
        photoId: null,
        originalSrc: ctx.photoSrc,
        image: ctx.size ? { width: ctx.size.w, height: ctx.size.h, landmarks: ctx.face?.points ?? null, synthetic: false } : null,
    };
    const studio = new HairStudio(context);
    const head = h("div", { class: "hair-classic-head" }, h("h1", {}, "Hair Studio"), h("p", { class: "lede" }, "Browse cuts, see each one as a diagram, and take a salon brief to your stylist. Hair colour, grey and men's styles are drawn on your own photo in the Studio."), h("div", { class: "row" }, h("a", { href: "studio.html#studio=grey", class: "btn" }, "Hair colour and grey on my photo"), h("a", { href: "studio.html#studio=studio", class: "btn btn-quiet" }, "Open the Studio")));
    main.append(head, studio.element);
}
//# sourceMappingURL=hair.js.map