const state = {
  tone: "collaborative",
  selectedTier: "standard",
  basePrice: 4800,
  proposals: 4,
  opens: 28,
  views: 0,
  sectionTimes: { overview: 0, approach: 0, investment: 0 },
  connected: new Set(["Notion", "Trello"]),
  portalActive: false,
};

const toneCopy = {
  collaborative: {
    label: "Collaborative",
    angle: "Position yourself as a thoughtful partner: align on the highest-impact workflow first, then build momentum together.",
    proofLabel: "PROOF POINT TO PERSONALIZE",
    proofCopy: "Choose a relevant project that shows how you partnered with a team, iterated on feedback, and handed the work over. Add a real example before sending.",
    intro: "Your analytics experience should make the next right decision obvious. We’ll start by understanding where users get stuck, then shape a focused experience around the moments that matter.",
    note: "The best work happens when we make the hard choices together. I’m looking forward to learning what matters most to your team and finding the right first step.",
  },
  formal: {
    label: "Data-driven",
    angle: "Lead with evidence and measurable outcomes. Tie each phase to a decision, a validation point, and a clear definition of done.",
    proofLabel: "EVIDENCE TO LEAD WITH",
    proofCopy: "Connect a relevant case study to a measurable outcome, baseline, and decision this work should improve. Add verified project results before sending.",
    intro: "We will assess the current analytics workflow, prioritize user needs, and validate a focused design direction against agreed success criteria before expanding scope.",
    note: "This proposal is structured to make scope, decision points, and outcomes explicit. I look forward to aligning on the measures that will define success.",
  },
  bold: {
    label: "Disruptive",
    angle: "Challenge the default: frame the product as a competitive advantage and make the cost of a confusing experience tangible.",
    proofLabel: "VISION TO MAKE TANGIBLE",
    proofCopy: "Lead with one verified example of how your work changed a product experience or market position. Insert a real result—never an unverified claim.",
    intro: "Your dashboard can do more than report the numbers. Let’s turn the analytics experience into the product advantage that helps your customers move first.",
    note: "There is an opportunity to make this experience a reason customers choose Brightforge. Let’s start with the one bold move that changes the trajectory.",
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function toast(message) {
  const region = $("#toast-region");
  const item = document.createElement("div");
  item.className = "toast";
  item.innerHTML = `<span>✳</span><span>${escapeHTML(message)}</span>`;
  region.append(item);
  window.setTimeout(() => {
    item.classList.add("leaving");
    item.addEventListener("animationend", () => item.remove(), { once: true });
  }, 2900);
}

function showView(name) {
  const view = $(`#view-${name}`);
  if (!view) return;
  $$(".view").forEach((item) => item.classList.toggle("active", item === view));
  $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  const title = name === "client" ? "Client preview" : name.charAt(0).toUpperCase() + name.slice(1);
  $("#current-crumb").textContent = title;
  if (name !== "client" && window.location.hash.startsWith("#/p/")) {
    history.replaceState(null, "", "#overview");
  }
  if (name === "client") startPortalTracking();
  else stopPortalTracking();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let currentPortalSection = "";
let sectionStartedAt = 0;
let portalInterval;

function commitSectionTime() {
  if (!currentPortalSection || !sectionStartedAt) return;
  const elapsed = Math.max(0, Math.round((Date.now() - sectionStartedAt) / 1000));
  state.sectionTimes[currentPortalSection] += elapsed;
  sectionStartedAt = Date.now();
}

function startPortalTracking() {
  if (!state.portalActive) {
    state.portalActive = true;
    state.views += 1;
    state.opens += 1;
    toast("Client preview opened · demo analytics are now tracking this session");
  }
  updatePortalSection();
  window.addEventListener("scroll", updatePortalSection, { passive: true });
  window.addEventListener("beforeunload", flushPortalTracking, { once: true });
  if (!portalInterval) {
    portalInterval = window.setInterval(() => {
      commitSectionTime();
      updateInsights();
    }, 5000);
  }
}

function stopPortalTracking() {
  if (!state.portalActive) return;
  commitSectionTime();
  state.portalActive = false;
  currentPortalSection = "";
  window.removeEventListener("scroll", updatePortalSection);
  if (portalInterval) {
    window.clearInterval(portalInterval);
    portalInterval = undefined;
  }
  updateInsights();
}

function flushPortalTracking() {
  commitSectionTime();
}

function updatePortalSection() {
  if (!state.portalActive) return;
  const viewportMiddle = window.innerHeight * 0.55;
  const sections = [
    ["overview", $("#portal-overview-section")],
    ["approach", $("#portal-approach-section")],
    ["investment", $("#portal-investment-section")],
  ];
  let visible = "overview";
  for (const [name, element] of sections) {
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.top <= viewportMiddle && rect.bottom >= viewportMiddle) visible = name;
  }
  if (visible !== currentPortalSection) {
    commitSectionTime();
    currentPortalSection = visible;
    sectionStartedAt = Date.now();
  }
}

function updateInsights() {
  $("#open-count").innerHTML = `${state.opens} <span class="stat-change positive">↑ ${Math.min(49, 24 + state.views)}%</span>`;
  const total = Object.values(state.sectionTimes).reduce((sum, seconds) => sum + seconds, 0);
  const rows = $$(".heat-row");
  if (total > 0) {
    const names = ["investment", "approach", "overview"];
    names.forEach((name, index) => {
      const percent = Math.max(4, Math.round((state.sectionTimes[name] / total) * 100));
      const row = rows[index];
      if (!row) return;
      $("strong", row).textContent = `${percent}%`;
      $(".heat-track i", row).style.width = `${percent}%`;
    });
  }
}

function parseBudget(text) {
  const match = text.match(/(?:\$|USD\s?)(\d[\d,]*(?:\.\d{1,2})?)(?:\s?k\b)?/i);
  if (!match) return null;
  const suffixK = /k\b/i.test(match[0]);
  return Math.round(Number(match[1].replace(/,/g, "")) * (suffixK ? 1000 : 1));
}

function countScopeSignals(text) {
  const signals = [
    /research|discovery|interview|audit/i,
    /\b\d+\+?\s*(?:screens|pages|flows|features)\b/i,
    /design system|component library/i,
    /prototype|wireframe/i,
    /handoff|documentation/i,
    /analytics|dashboard|integration/i,
    /ongoing|long.?term|future phases/i,
  ];
  return signals.filter((pattern) => pattern.test(text)).length;
}

function buildRisks(description) {
  const text = description.trim();
  const risks = [];
  const scopeCount = countScopeSignals(text);
  const budget = parseBudget(text);
  const hasUrgency = /immediately|asap|urgent|right away|start today/i.test(text);
  const timeline = text.match(/(?:in|within|under)\s+(\d+)\s+(day|week|month)s?\b/i);
  const veryShortTimeline = timeline && ((timeline[2].startsWith("day") && Number(timeline[1]) <= 14) || (timeline[2].startsWith("week") && Number(timeline[1]) <= 2));
  const estimatedFloor = Math.max(2200, scopeCount * 650);

  if (scopeCount >= 3 || /complete product|everything|full platform|end.to.end/i.test(text)) {
    risks.push({ level: "high", icon: "!", title: "Scope is doing a lot of work", detail: "Several distinct deliverables are bundled together. Name what is in, what is out, and what needs client review." });
  } else {
    risks.push({ level: "medium", icon: "↗", title: "Make the finish line explicit", detail: "Turn the brief into 2–3 concrete outcomes and agree on how many review rounds are included." });
  }
  if (budget !== null && budget < estimatedFloor) {
    risks.push({ level: "high", icon: "↗", title: "Budget may not cover the ask", detail: `The stated ${formatMoney(budget)} budget is below a rough ${formatMoney(estimatedFloor)} scope signal. Offer a smaller first milestone.` });
  } else if (budget === null) {
    risks.push({ level: "medium", icon: "$", title: "Budget isn't stated", detail: "Offer a right-sized starting option, then confirm investment before committing to the full scope." });
  } else {
    risks.push({ level: "low", icon: "✓", title: "Budget has room for a clear outcome", detail: "Tie your fee to the highest-value deliverable and make assumptions visible." });
  }
  if (veryShortTimeline || (hasUrgency && scopeCount >= 2)) {
    risks.push({ level: "medium", icon: "◷", title: "Timeline needs a reality check", detail: "A short deadline plus several deliverables leaves little room for feedback. Add review gates or phase the work." });
  } else if (scopeCount >= 3) {
    risks.push({ level: "medium", icon: "◷", title: "Protect time for client decisions", detail: "Set feedback windows at each milestone; delays in review should shift the delivery date." });
  } else {
    risks.push({ level: "low", icon: "✓", title: "No obvious rush signal", detail: "Still confirm when stakeholders can review so the delivery plan stays realistic." });
  }
  return risks.slice(0, 3);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function getBaseBudget(description) {
  const parsed = parseBudget(description);
  if (parsed && parsed >= 2000) return Math.round(parsed * 1.2 / 100) * 100;
  const scopeCount = countScopeSignals(description);
  return Math.max(3600, 3000 + scopeCount * 450);
}

function updatePrices(base) {
  state.basePrice = base;
  const prices = { quick: Math.round(base * .5 / 100) * 100, standard: base, enterprise: Math.round(base * 1.5 / 100) * 100 };
  Object.entries(prices).forEach(([tier, price]) => {
    const display = $(`[data-price="${tier}"]`);
    if (display) display.textContent = formatMoney(price);
    const portalPrice = $(`[data-portal-price="${tier}"]`);
    if (portalPrice) portalPrice.textContent = formatMoney(price);
  });
  const selected = $(`.tier-card[data-tier="${state.selectedTier}"] .tier-price`);
  $("#list-brightforge-amount").textContent = selected ? selected.textContent : formatMoney(base);
  $("#stat-active").innerHTML = `${state.proposals} <span class="stat-change positive">↑ 2</span>`;
  $("#proposal-count").textContent = String(state.proposals);
  $("#usage-count").textContent = String(state.proposals);
  $("#usage-progress").style.width = `${Math.min(100, state.proposals / 20 * 100)}%`;
}

function renderRisks(risks) {
  $("#risk-list").innerHTML = risks.map((risk) => `
    <div class="risk-item risk-${escapeHTML(risk.level)}">
      <span class="risk-mark">${escapeHTML(risk.icon)}</span>
      <div><strong>${escapeHTML(risk.title)}</strong><p>${escapeHTML(risk.detail)}</p></div>
    </div>`).join("");
}

function setTone(tone) {
  if (!toneCopy[tone]) return;
  state.tone = tone;
  $$(".tone-option").forEach((button) => {
    const selected = button.dataset.tone === tone;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  $("#angle-copy").textContent = toneCopy[tone].angle;
  $("#tone-tag").textContent = toneCopy[tone].label;
  const documentPreview = $(".client-document");
  documentPreview.dataset.tone = tone;
  $("#proof-focus-label").textContent = toneCopy[tone].proofLabel;
  $("#proof-focus-copy").textContent = toneCopy[tone].proofCopy;
  const proofFocus = $("#proof-focus");
  if (tone === "formal") $("#portal-overview-section").before(proofFocus);
  else if (tone === "bold") $("#portal-approach-section").after(proofFocus);
  else $("#portal-overview-section").after(proofFocus);
  $("#portal-note").textContent = toneCopy[tone].note;
  updatePortalOverview();
}

function updatePortalOverview() {
  $("#portal-client-name").textContent = $("#client-name").value.trim() || "Your project";
  $("#proposal-client-name").innerHTML = `${escapeHTML($("#client-name").value.trim() || "Your project")} <span>· Product design</span>`;
  $("#portal-overview").textContent = toneCopy[state.tone].intro;
  $("#portal-note").textContent = toneCopy[state.tone].note;
}

function renderPortalTiers() {
  const tiers = [
    { key: "quick", title: "MVP / Quick Win", detail: "Discovery and one high-impact workflow · 1 week" },
    { key: "standard", title: "Standard Scale", detail: "Research and the core product experience · 3 weeks" },
    { key: "enterprise", title: "Enterprise Growth", detail: "System-wide design and team enablement · 5 weeks" },
  ];
  $("#portal-tier-list").innerHTML = tiers.map((tier) => `
    <button class="portal-tier ${tier.key === state.selectedTier ? "selected" : ""}" data-portal-tier="${tier.key}">
      <strong>${tier.title}</strong><span class="portal-price" data-portal-price="${tier.key}">${$(`[data-price="${tier.key}"]`).textContent}</span><small>${tier.detail}</small>
    </button>`).join("");
}

function selectTier(tier) {
  if (!["quick", "standard", "enterprise"].includes(tier)) return;
  state.selectedTier = tier;
  $$(".tier-card").forEach((card) => {
    const selected = card.dataset.tier === tier;
    card.classList.toggle("selected", selected);
    $(".tier-check", card).textContent = selected ? "✓" : "○";
  });
  const selectedTier = $(`.tier-card[data-tier="${tier}"]`);
  $("#proposal-summary").textContent = `${selectedTier.querySelector(".tier-caption").textContent}. ${selectedTier.querySelector(".tier-detail").textContent}.`;
  updatePrices(state.basePrice);
  renderPortalTiers();
}

function openPortal() {
  updatePortalOverview();
  renderPortalTiers();
  const slug = ($("#client-name").value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "client";
  history.replaceState(null, "", `#/p/${slug}`);
  showView("client");
  toast("Shareable demo link ready: scopepulse.demo/p/" + slug);
}

function openCommandPalette() {
  const overlay = $("#command-overlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  $("#command-input").value = "";
  $$(".command-results button").forEach((item) => item.classList.remove("filtered-out", "highlighted"));
  const first = $(".command-results button");
  if (first) first.classList.add("highlighted");
  $("#command-input").focus();
}

function closeCommandPalette() {
  $("#command-overlay").classList.remove("open");
  $("#command-overlay").setAttribute("aria-hidden", "true");
}

function runCommand(command) {
  closeCommandPalette();
  if (command === "generate") {
    showView("overview");
    $("#client-name").focus();
    $("#brief-form").scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Your strategy desk is ready.");
    return;
  }
  showView(command);
}

function readClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    toast("Clipboard access needs a secure browser context. Paste your brief into the text field instead.");
    $("#job-description").focus();
    return;
  }
  navigator.clipboard.readText().then((text) => {
    if (!text.trim()) {
      toast("Your clipboard is empty. Copy a job post first, then try again.");
      return;
    }
    $("#job-description").value = text.trim();
    toast("Job post added. Run the brief scan to uncover scope signals.");
  }).catch((error) => {
    console.error("Clipboard read failed:", error);
    toast("Clipboard access was denied. Paste the job post into the brief field.");
    $("#job-description").focus();
  });
}

function generateProposal(event) {
  event.preventDefault();
  const description = $("#job-description").value.trim();
  if (!description) {
    $("#job-description").focus();
    toast($("#job-url").value.trim()
      ? "This browser-only demo cannot fetch a job-post URL. Paste the visible job description to analyze it."
      : "Add a job description before starting the brief scan.");
    return;
  }
  const button = $("#generate-button");
  const status = $("#scan-status");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span class=\"loading-spark\">✦</span> Analyzing client requirements…";
  status.textContent = "SCANNING";
  const steps = [
    ["Mapping scope & milestones…", "STRUCTURING"],
    ["Calibrating a right-sized offer…", "CALIBRATING"],
    ["Polishing the proposal angle…", "REFINING"],
  ];
  let step = 0;
  const interval = window.setInterval(() => {
    const current = steps[step];
    if (!current) return;
    button.innerHTML = `<span class="loading-spark">✦</span> ${current[0]}`;
    status.textContent = current[1];
    step += 1;
  }, 650);
  window.setTimeout(() => {
    window.clearInterval(interval);
    const client = $("#client-name").value.trim() || "Your project";
    $("#client-name").value = client;
    $("#proposal-client-name").innerHTML = `${escapeHTML(client)} <span>· Product design</span>`;
    $("#portal-client-name").textContent = client;
    $("#analysis-title").textContent = "Signals worth getting ahead of";
    renderRisks(buildRisks(description));
    updatePrices(getBaseBudget(description));
    setTone(state.tone);
    selectTier("standard");
    state.proposals += 1;
    $("#proposal-summary").textContent = "Research + core product experience. Validated, ready to build in 3 weeks.";
    button.innerHTML = original;
    button.disabled = false;
    status.textContent = "SCAN COMPLETE";
    $("#proposal-title-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Brief scanned. Your strategy and tiered offer are ready to refine.");
    updatePrices(state.basePrice);
  }, 2100);
}

function copyProposal() {
  const text = [
    `Proposal for ${$("#client-name").value.trim() || "Your project"}`,
    "",
    toneCopy[state.tone].intro,
    "",
    `MVP / Quick Win: ${$('[data-price="quick"]').textContent}`,
    `Standard Scale: ${$('[data-price="standard"]').textContent}`,
    `Enterprise Growth: ${$('[data-price="enterprise"]').textContent}`,
    "",
    toneCopy[state.tone].note,
  ].join("\n");
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    toast("Clipboard access needs a secure browser context. Open this prototype over localhost to copy.");
    return;
  }
  navigator.clipboard.writeText(text).then(() => toast("Proposal summary copied to your clipboard.")).catch((error) => {
    console.error("Proposal copy failed:", error);
    toast("Could not access the clipboard. Select and copy the proposal manually.");
  });
}

function acceptProposal() {
  const signer = $("#signature-name").value.trim();
  if (!signer) {
    $("#signature-name").focus();
    toast("Add your full name to sign the proposal.");
    return;
  }
  if (!$("#accept-terms").checked) {
    $("#accept-terms").focus();
    toast("Please confirm the selected scope before accepting.");
    return;
  }
  const button = $("#accept-proposal");
  button.disabled = true;
  button.textContent = "Preparing secure checkout…";
  window.setTimeout(() => {
    button.innerHTML = "✓ Accepted — deposit checkout simulated";
    button.style.background = "#c4f16d";
    toast(`Thanks, ${signer}. Your acceptance was recorded in this demo.`);
  }, 750);
}

function initCommandPalette() {
  const input = $("#command-input");
  const buttons = $$(".command-results button");
  input.addEventListener("input", () => {
    const query = input.value.toLowerCase().trim();
    buttons.forEach((button) => button.classList.toggle("filtered-out", !button.textContent.toLowerCase().includes(query)));
    const visible = buttons.filter((button) => !button.classList.contains("filtered-out"));
    buttons.forEach((button) => button.classList.remove("highlighted"));
    if (visible[0]) visible[0].classList.add("highlighted");
  });
  input.addEventListener("keydown", (event) => {
    const visible = buttons.filter((button) => !button.classList.contains("filtered-out"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const activeIndex = visible.findIndex((button) => button.classList.contains("highlighted"));
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = visible[(activeIndex + direction + visible.length) % visible.length];
      buttons.forEach((button) => button.classList.remove("highlighted"));
      if (next) next.classList.add("highlighted");
    } else if (event.key === "Enter") {
      const active = $(".command-results button.highlighted");
      if (active) runCommand(active.dataset.command);
    } else if (event.key === "Escape") closeCommandPalette();
  });
  buttons.forEach((button) => button.addEventListener("click", () => runCommand(button.dataset.command)));
  $("#command-overlay").addEventListener("click", (event) => {
    if (event.target === $("#command-overlay")) closeCommandPalette();
  });
}

function initNavigation() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-view]");
    if (target) {
      const view = target.dataset.view;
      if (view === "overview" && target.id === "new-proposal-shortcut") {
        showView(view);
        $("#client-name").focus();
      } else {
        showView(view);
      }
    }
    const tier = event.target.closest("[data-tier], [data-portal-tier]");
    if (tier) selectTier(tier.dataset.tier || tier.dataset.portalTier);
  });

  $$(".filter-tab").forEach((button) => button.addEventListener("click", () => {
    $$(".filter-tab").forEach((item) => item.classList.toggle("active", item === button));
    $$(".proposal-list-card").forEach((card) => card.classList.toggle("hidden", button.dataset.filter !== "all" && card.dataset.status !== button.dataset.filter));
  }));
}

function initKeyboardShortcuts() {
  let lastKey = "";
  let lastKeyAt = 0;
  document.addEventListener("keydown", (event) => {
    const isTyping = event.target.matches("input, textarea, select, [contenteditable='true']");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if (event.key === "Escape" && $("#command-overlay").classList.contains("open")) {
      closeCommandPalette();
      return;
    }
    if (isTyping || event.metaKey || event.ctrlKey || event.altKey || $("#command-overlay").classList.contains("open")) return;
    if (event.key.toLowerCase() === "n") {
      runCommand("generate");
    } else if (lastKey.toLowerCase() === "g" && Date.now() - lastKeyAt < 900) {
      const shortcuts = { o: "overview", p: "proposals", i: "insights", c: "integrations" };
      if (shortcuts[event.key.toLowerCase()]) runCommand(shortcuts[event.key.toLowerCase()]);
      lastKey = "";
    } else {
      lastKey = event.key;
      lastKeyAt = Date.now();
    }
  });
}

function initRoute() {
  window.addEventListener("hashchange", () => {
    if (window.location.hash.startsWith("#/p/")) showView("client");
    else if (window.location.hash === "#overview") showView("overview");
  });
  if (window.location.hash.startsWith("#/p/")) showView("client");
}

function initIntegrations() {
  $$(".integration-action").forEach((button) => button.addEventListener("click", () => {
    if (button.id === "integrations-paste") {
      readClipboard();
      return;
    }
    const integration = button.dataset.integration;
    if (state.connected.has(integration)) {
      toast(`${integration} is connected in this demo. Real account settings need a provider authorization flow.`);
    } else {
      toast(`${integration} setup needs a backend and provider credentials. This prototype won't collect or store secrets.`);
    }
  }));
}

function init() {
  const proofFocus = document.createElement("aside");
  proofFocus.id = "proof-focus";
  proofFocus.className = "proof-focus";
  proofFocus.setAttribute("aria-live", "polite");
  proofFocus.innerHTML = '<span class="proof-focus-label" id="proof-focus-label"></span><p id="proof-focus-copy"></p>';
  $("#portal-overview-section").after(proofFocus);
  initNavigation();
  initCommandPalette();
  initKeyboardShortcuts();
  initIntegrations();
  initRoute();
  $$(".tone-option").forEach((button) => button.addEventListener("click", () => setTone(button.dataset.tone)));
  $("#brief-form").addEventListener("submit", generateProposal);
  $("#clipboard-parse").addEventListener("click", readClipboard);
  $("#open-portal").addEventListener("click", openPortal);
  $("#copy-proposal").addEventListener("click", copyProposal);
  $("#accept-proposal").addEventListener("click", acceptProposal);
  $("#command-open").addEventListener("click", openCommandPalette);
  $("#new-proposal-shortcut").addEventListener("click", () => $("#client-name").focus());
  $("#notification-button").addEventListener("click", () => toast("No new client activity. Preview the proposal link to try live demo analytics."));
  $("#proposal-menu").addEventListener("click", () => toast("Draft is ready to preview, copy, or refine."));
  $("#proposal-search").addEventListener("click", () => {
    const query = window.prompt("Search proposals by client or project");
    if (query === null) return;
    $$(".proposal-list-card").forEach((card) => card.classList.toggle("hidden", !card.textContent.toLowerCase().includes(query.toLowerCase())));
    $$(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.filter === "all"));
  });
  $("#insights-period").addEventListener("click", () => toast("Showing the last 30 days of sample data and this session's local engagement."));
  $("#save-settings").addEventListener("click", () => toast("Profile preferences saved for this preview session."));
  $$(".toggle").forEach((toggle) => toggle.addEventListener("click", () => {
    const active = toggle.classList.toggle("active");
    toggle.setAttribute("aria-pressed", String(active));
    toast(active ? "Preference enabled for this preview session." : "Preference disabled for this preview session.");
  }));
  $("#client-name").addEventListener("input", updatePortalOverview);
  updatePrices(state.basePrice);
  setTone(state.tone);
  renderPortalTiers();
  updateInsights();
}

init();
