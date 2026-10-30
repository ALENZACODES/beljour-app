function create(doc, tag, className, content = "") {
    const element = doc.createElement(tag);
    element.className = className;
    if (content) {
        element.textContent = content;
    }
    return element;
}
function label(doc, text) {
    return create(doc, "span", "lg-season-eyebrow", text);
}
function citation(doc, value) {
    const anchor = create(doc, "a", "lg-season-source", `${value.publisher} · ${value.published}`);
    anchor.href = value.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.title = value.title;
    return anchor;
}
function houseSection(doc, house, looks) {
    const section = create(doc, "article", "lg-season-house");
    section.setAttribute("data-season-house", house.id);
    const top = create(doc, "div", "lg-season-house-top");
    top.append(label(doc, "Reported trend"));
    top.append(create(doc, "span", "lg-season-date", house.reportedOn));
    section.append(top);
    section.append(create(doc, "h3", "lg-season-house-name", house.name));
    section.append(create(doc, "p", "lg-season-quote", house.reportedTrend));
    const sources = create(doc, "div", "lg-season-sources");
    sources.setAttribute("aria-label", `Sources for ${house.name}`);
    for (const source of house.sources) {
        sources.append(citation(doc, source));
    }
    section.append(sources);
    if (looks.length) {
        const translated = create(doc, "div", "lg-season-translations");
        translated.append(label(doc, "BELJOUR translation"));
        for (const look of looks) {
            const row = create(doc, "div", "lg-season-look");
            row.setAttribute("data-season-look", look.id);
            row.append(create(doc, "strong", "lg-season-look-name", look.name));
            row.append(create(doc, "span", "lg-season-look-note", look.note));
            row.append(create(doc, "span", "lg-season-look-state", look.status === "available"
                ? "Local look available"
                : "Illustrative concept"));
            translated.append(row);
        }
        section.append(translated);
    }
    return section;
}
function statusParagraph(doc, message) {
    const paragraph = create(doc, "p", "lg-season-status", message);
    paragraph.setAttribute("role", "status");
    paragraph.setAttribute("aria-live", "polite");
    return paragraph;
}
function matchSection(doc, state, actions) {
    const aside = create(doc, "section", "lg-season-personal");
    aside.setAttribute("aria-label", "Personal season match");
    aside.append(label(doc, "Your season, your tones"));
    aside.append(create(doc, "h3", "lg-season-personal-title", "Find the tones that are yours"));
    aside.append(create(doc, "p", "lg-season-privacy", "Opt in to use saved-look settings, shade history and confirmed undertone. " +
        "No photo is read or uploaded."));
    const controls = create(doc, "div", "lg-season-controls");
    const start = create(doc, "button", "lg-button lg-season-personalize", state.personalizePending
        ? "Reading your confirmed shade mapping…"
        : "Show my season match");
    start.type = "button";
    start.disabled = state.personalizePending;
    start.setAttribute("data-season-action", "personalize");
    start.addEventListener("click", actions.personalize);
    controls.append(start);
    const alertBox = create(doc, "label", "lg-season-alert-option");
    const checkbox = create(doc, "input", "lg-season-alert-input");
    checkbox.type = "checkbox";
    checkbox.checked = state.alertOptedIn;
    checkbox.setAttribute("data-season-action", "alert");
    checkbox.addEventListener("change", () => actions.setAlerts(checkbox.checked));
    alertBox.append(checkbox);
    alertBox.append(create(doc, "span", "", "In-page match alert, opt-in only"));
    controls.append(alertBox);
    aside.append(controls);
    aside.append(create(doc, "p", "lg-season-alert-note", "Alerts stay on this page only. No push permission, background check or subscription is created."));
    if (state.alertMessage) {
        aside.append(statusParagraph(doc, state.alertMessage));
    }
    if (state.personalized && state.matches) {
        const list = create(doc, "ol", "lg-season-matches");
        for (const match of state.matches.matches) {
            const row = create(doc, "li", "lg-season-match");
            const fit = match.fit === "recommended" ? "Recommended" : "Explore";
            row.append(create(doc, "strong", "", `${match.toneId} · ${fit}`));
            row.append(create(doc, "p", "lg-season-match-reason", match.reason));
            list.append(row);
        }
        if (!state.matches.matches.length) {
            aside.append(create(doc, "p", "lg-season-empty", "No supported match from the confirmed mapping yet."));
        }
        else {
            aside.append(list);
        }
        const clear = create(doc, "button", "lg-season-reset", "Clear personal matches");
        clear.type = "button";
        clear.setAttribute("data-season-action", "clear");
        clear.addEventListener("click", actions.clearPersonal);
        aside.append(clear);
    }
    else if (!state.personalizePending) {
        aside.append(create(doc, "p", "lg-season-empty", "Personal recommendations appear only after Lane F returns a reviewed, versioned shade match."));
    }
    aside.append(statusParagraph(doc, state.statusMessage));
    return aside;
}
export function renderSeasonBook(doc, root, state, actions) {
    const previousAction = doc.activeElement?.dataset?.seasonAction;
    root.replaceChildren();
    if (state.status === "not-wired") {
        root.hidden = true;
        return;
    }
    root.hidden = false;
    const frame = create(doc, "div", "lg-season-frame");
    const header = create(doc, "header", "lg-season-header");
    header.append(label(doc, "BELJOUR — FULL BEAUTY STUDIO"));
    header.append(create(doc, "h2", "lg-season-heading", "The Season Book"));
    header.append(create(doc, "p", "lg-season-tagline", "Your best day. Still you."));
    frame.append(header);
    if (state.status !== "ready" || !state.book) {
        frame.append(statusParagraph(doc, state.statusMessage));
        frame.append(create(doc, "p", "lg-season-unverified", "UNVERIFIED · No trends or matches are presented as results."));
        root.append(frame);
        return;
    }
    frame.append(create(doc, "p", "lg-season-intro", `${state.book.seasonName} · Sourced trends and original looks. Reported and reviewed ${state.book.reviewedAt}.`));
    const grid = create(doc, "div", "lg-season-houses");
    for (const house of state.book.houses) {
        const looks = state.book.looks.filter((item) => item.houseId === house.id);
        grid.append(houseSection(doc, house, looks));
    }
    frame.append(grid);
    frame.append(matchSection(doc, state, actions));
    frame.append(create(doc, "p", "lg-season-footnote", "Trends are reported, not verified by popularity. " +
        "Shade recommendations are digital styling suggestions, not product guarantees."));
    frame.append(create(doc, "p", "lg-season-next", `Next edition: ${state.edition.next}.`));
    root.append(frame);
    if (previousAction) {
        const next = root.querySelector(`[data-season-action="${previousAction}"]`);
        next?.focus();
    }
}
//# sourceMappingURL=view.js.map