"use strict";

import { initUsers } from "./users.js";
import { initPutting } from "./putting.js";
import { initRange } from "./range.js";

function activateTab(name) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name)
  );
  document.getElementById("view-putting").hidden = name !== "putting";
  document.getElementById("view-range").hidden = name !== "range";
}

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => activateTab(t.dataset.tab);
});

(async function init() {
  await initUsers();   // load players first; views depend on current user
  initPutting();
  await initRange();
  activateTab("putting");
})();
