/* claudeport docs — interaction layer (vanilla, no deps)
   1. copy-to-clipboard on snippets
   2. command card -> sync-topology highlight
   3. prefers-reduced-motion: freeze the SMIL particle flow
   4. scroll-reveal for sections
*/
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. copy buttons ---------- */
  for (const btn of document.querySelectorAll(".copy")) {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // fallback for non-secure contexts
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch { /* give up quietly */ }
        ta.remove();
      }
      const label = btn.querySelector(".copy__label");
      const prev = label ? label.textContent : "";
      btn.classList.add("is-copied");
      if (label) label.textContent = "Copied";
      setTimeout(() => {
        btn.classList.remove("is-copied");
        if (label) label.textContent = prev;
      }, 1400);
    });
  }

  /* ---------- 2. command -> topology highlight ---------- */
  const svg = document.getElementById("topo-svg");

  if (svg) {
    // freeze particle motion for reduced-motion users
    if (reduceMotion && typeof svg.pauseAnimations === "function") {
      svg.pauseAnimations();
    }

    const el = (id) => document.getElementById(id);
    const lane = (id) => svg.querySelector(`#${id}`);
    const pushLanes = ["pushL", "pushR"];
    const pullLanes = ["pullL", "pullR"];
    const pushPkts = svg.querySelectorAll(".pkt--push");
    const pullPkts = svg.querySelectorAll(".pkt--pull");
    const nodes = { ws: el("node-ws"), repo: el("node-repo"), nb: el("node-nb") };

    // which parts each command lights up
    const FLOWS = {
      init:   { lanes: [...pushLanes, ...pullLanes], pkts: ["push", "pull"], nodes: ["ws", "repo", "nb"] },
      push:   { lanes: pushLanes, pkts: ["push"], nodes: ["ws", "repo", "nb"] },
      pull:   { lanes: pullLanes, pkts: ["pull"], nodes: ["ws", "repo", "nb"] },
      status: { pulse: ["ws", "repo", "nb"] },
      diff:   { pulse: ["ws", "repo", "nb"] },
      config: { pulse: ["ws", "nb"] },
    };

    function clear() {
      svg.classList.remove("dim");
      for (const id of [...pushLanes, ...pullLanes]) lane(id)?.classList.remove("is-active");
      for (const p of [...pushPkts, ...pullPkts]) p.classList.remove("is-active");
      for (const n of Object.values(nodes)) n?.classList.remove("is-active", "is-pulse");
    }

    function activate(flow) {
      const spec = FLOWS[flow];
      if (!spec) return;
      clear();
      svg.classList.add("dim");

      for (const id of spec.lanes || []) lane(id)?.classList.add("is-active");
      if (spec.pkts?.includes("push")) for (const p of pushPkts) p.classList.add("is-active");
      if (spec.pkts?.includes("pull")) for (const p of pullPkts) p.classList.add("is-active");
      for (const key of spec.nodes || []) nodes[key]?.classList.add("is-active");
      for (const key of spec.pulse || []) nodes[key]?.classList.add("is-pulse");
    }

    // hover/focus triggers: command cards (bonus) + the verb chips beside the diagram
    for (const trigger of document.querySelectorAll(".cmd, .key")) {
      const flow = trigger.getAttribute("data-flow");
      trigger.addEventListener("mouseenter", () => activate(flow));
      trigger.addEventListener("focus", () => activate(flow));
      trigger.addEventListener("mouseleave", clearUnlessLocked);
      trigger.addEventListener("blur", clearUnlessLocked);
    }

    // touch/click: chips latch a flow (no hover on touch devices)
    let locked = null;
    function clearUnlessLocked() {
      if (locked) activate(locked);
      else clear();
    }
    for (const key of document.querySelectorAll(".key")) {
      const flow = key.getAttribute("data-flow");
      key.setAttribute("aria-pressed", "false");
      key.addEventListener("click", () => {
        const keys = document.querySelectorAll(".key");
        if (locked === flow) {
          locked = null;
          clear();
        } else {
          locked = flow;
          activate(flow);
        }
        for (const k of keys) {
          const on = locked === k.getAttribute("data-flow");
          k.setAttribute("aria-pressed", String(on));
          k.classList.toggle("is-locked", on);
        }
      });
    }
  }

  /* ---------- 3. scroll reveal ---------- */
  const revealables = document.querySelectorAll("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    for (const n of revealables) n.classList.add("in");
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    for (const n of revealables) io.observe(n);
  }
})();
