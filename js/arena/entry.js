/** Judging page entry. The top bar Save writes the answers file, like the in-page button.
 * Author: John Khan. */
import { mountJudge } from "./judge-view.js";
import { wireSave } from "../layout/topbar.js";
mountJudge();
wireSave(document, () => document.querySelector("#lg-judge a[download]")?.click());
