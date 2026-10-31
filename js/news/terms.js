/** Reviewed word lists for the "What's new in beauty" feed (web/data/beauty-news.json).
 *
 * TITLES is the allow-list: every entry's title must be one of these ingredient, product-type
 * or rule-change names, each checked by hand to name no brand, product line or trademark. A new
 * entry needs its title added here in the same review. Brand names themselves are never written
 * in the repo: web/data/news-deny-hashes.json holds only hashes (scripts/build_news_denylist.py).
 * Author: John Khan.
 */
export const TITLES = new Set([
    "PDRN and polynucleotide serums",
    "Exosome serums and treatments",
    "Signal peptides",
    "Copper peptides",
    "Ceramide barrier-repair creams",
    "Mineral sunscreens (zinc oxide and titanium dioxide)",
    "Bemotrizinol, a UV filter proposed in the United States",
    "Tinted sunscreens with iron oxides",
    "Skin tints and makeup with SPF",
    "Bakuchiol",
    "Retinal (retinaldehyde)",
    "Adapalene gel 0.1% without a prescription",
    "Trifarotene, a prescription retinoid",
    "Clascoterone cream, a prescription acne cream",
    "Azelaic acid",
    "Tranexamic acid serums and creams",
    "Cysteamine cream",
    "Niacinamide",
    "Vitamin C serums",
    "Alpha-arbutin strength limits in the EU",
    "Retinol strength limits in the EU",
    "Microbiome skincare (prebiotics, probiotics and postbiotics)",
    "Hydrocolloid pimple patches",
    "Microneedle spot patches",
    "Benzoyl peroxide: storage and benzene testing",
    "Hypochlorous acid sprays",
    "Centella asiatica (cica) creams",
    "Ectoin",
]);
/** Where a product type is usually found: kinds of shop or service only, never a named one. */
export const CHANNELS = new Set([
    "drugstore", "pharmacy", "prescription", "dermatologist offices", "clinics",
    "k-beauty and j-beauty shops", "online shops", "online clean-beauty shops",
]);
/** Words the feed and any partner copy must never use: no promises, no cures, nothing that
 * sells lighter skin (women-first rule 8). Matched on whole words, any case. */
export const BANNED_WORDS = /\b(cure[sd]?|curing|guarantee[sd]?|guaranteeing|miracle|miraculous|risk-free|permanent(ly)?|whiten(s|ed|ing)?|bleach(es|ed|ing)?)\b/i;
/** Hosts a "Sources" link may point at: regulators, medical and dermatology associations, a
 * dermatology reference and peer-reviewed journals. No shops, no brand sites. */
export const SOURCE_HOSTS = new Set([
    "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "www.pubmed.gov",
    "www.fda.gov", "fda.gov", "www.ema.europa.eu", "eur-lex.europa.eu", "health.ec.europa.eu",
    "www.canada.ca", "dermatology.ca", "www.aad.org", "aad.org", "www.aafp.org",
    "dermnetnz.org", "www.dermnetnz.org", "pro.dermnetnz.org",
    "mdpi.com", "www.mdpi.com", "link.springer.com", "www.dovepress.com",
]);
export const SOURCE_KINDS = new Set([
    "peer-reviewed", "regulator", "dermatology association", "medical association", "dermatology reference",
]);
/** How much of a source was read when the entry was written (docs/NEWS-SOURCES.md). An entry
 * must rest on at least one source read beyond its title. */
export const SOURCE_READ = new Set(["full text", "abstract", "summary page", "title only"]);
