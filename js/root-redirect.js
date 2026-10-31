"use strict";
/** The bare site root opens Home; a hash link (index.html#/photo) still opens the Photo lab. */
if (!location.hash || location.hash === "#")
    location.replace("home.html");
