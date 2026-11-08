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
  backendConfigured: false,
  aiConfigured: false,
  user: null,
  currentProposalId: null,
  currentProposalSlug: null,
  currentAnalysis: null,
  currentTiers: null,
  workspaces: [],
  activeWorkspaceId: null,
  authMode: "sign-in",
};
const bridgeRequests = new Map();

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

function renderWorkspaces(workspaces, activeWorkspaceId = null) {
  state.workspaces = Array.isArray(workspaces) ? workspaces : [];
  state.activeWorkspaceId = activeWorkspaceId;
  const select = $("#workspace-select");
  select.innerHTML = state.workspaces.map((workspace) =>
    `<option value="${escapeHTML(workspace.id)}">${escapeHTML(workspace.name)}</option>`,
  ).join("");
  select.disabled = state.workspaces.length === 0;
  if (activeWorkspaceId) select.value = activeWorkspaceId;
  const active = state.workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  $("#workspace-name").textContent = active?.name || (state.backendConfigured ? "Your workspace" : "Demo workspace");
  $("#workspace-create").hidden = !state.user;
  $(".workspace-picker").hidden = state.backendConfigured && !state.user;
}

function sendToHost(type, data = {}) {
  if (window.parent === window) return false;
  window.parent.postMessage(
    { source: "scopepulse-frame", type, ...data },
    window.location.origin,
  );
  return true;
}

function requestFromHost(type, data = {}, timeoutMs = 50000) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      bridgeRequests.delete(requestId);
      resolve({ error: "The service did not respond. Please try again." });
    }, timeoutMs);
    bridgeRequests.set(requestId, (result) => {
      window.clearTimeout(timeout);
      bridgeRequests.delete(requestId);
      resolve(result);
    });
    sendToHost(type, { ...data, requestId });
  });
}

function updateAuthState(user) {
  state.user = user || null;
  const button = $("#auth-button");
  button.textContent = state.user ? "Sign out" : "Sign in";
  $("#profile-name").textContent = state.user?.user_metadata?.full_name || "Your workspace";
  $("#profile-email").textContent = state.user?.email || (state.backendConfigured ? "Sign in to sync proposals" : "Local preview");
  if (state.user) {
    closeAuthDialog();
    sendToHost("list-proposals");
  } else if (state.backendConfigured) {
    renderSavedProposals([]);
    renderWorkspaces([]);
    state.currentProposalId = null;
    state.currentProposalSlug = null;
    state.currentAnalysis = null;
    state.currentTiers = null;
  }
}

function closeAuthDialog() {
  $("#auth-overlay").classList.remove("open");
  $("#auth-overlay").setAttribute("aria-hidden", "true");
}

function openAuthDialog() {
  const overlay = $("#auth-overlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  $("#auth-notice").textContent = state.backendConfigured
    ? ""
    : "Supabase isn't configured yet. Add the NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables to enable accounts.";
  $("#auth-password").value = "";
  $("#auth-email").focus();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const signingUp = mode === "sign-up";
  $("#auth-title").textContent = signingUp ? "Create your workspace" : "Welcome back";
  $("#auth-submit").innerHTML = signingUp ? "Create account <span>→</span>" : "Sign in <span>→</span>";
  $("#auth-password").autocomplete = signingUp ? "new-password" : "current-password";
  $("#auth-switch").textContent = signingUp ? "Sign in" : "Create an account";
  $(".auth-switch").firstChild.textContent = signingUp ? "Already have an account? " : "New to ScopePulse? ";
}

function renderSavedProposals(proposals) {
  if (!Array.isArray(proposals)) return;
  state.proposals = proposals.length;
  const onboarding = proposals.length === 0;
  $("#first-run-empty").hidden = !onboarding;
  $("#proposal-empty").hidden = !onboarding;
  $(".stats-grid").hidden = onboarding;
  $("#recent-proposals").hidden = onboarding;
  $("#recent-proposals").innerHTML = proposals.slice(0, 3).map((proposal) => `
    <div class="recent-row saved-proposal-row" data-proposal-id="${escapeHTML(proposal.id)}">
      <span class="recent-mark mark-blue">${escapeHTML((proposal.client_name || "?").slice(0, 1).toUpperCase())}</span>
      <div class="recent-name"><strong>${escapeHTML(proposal.client_name)}</strong><small>${escapeHTML(proposal.project_name || "Product design")}</small></div>
      <span class="recent-amount">${formatMoney(proposal.tiers?.[proposal.selected_tier]?.price || 0)}</span>
      <span class="status-pill status-${escapeHTML(proposal.status || "draft")}">${escapeHTML(proposal.status || "draft")}</span>
      <span class="recent-time">${new Date(proposal.created_at).toLocaleDateString()}</span>
      <button class="row-arrow" data-open-proposal="${escapeHTML(proposal.id)}" aria-label="Open proposal for ${escapeHTML(proposal.client_name)}">↗</button>
    </div>`).join("");
  $("#proposal-list").innerHTML = proposals.map((proposal) => `
    <article class="proposal-list-card" data-status="${escapeHTML(proposal.status || "draft")}" data-proposal-id="${escapeHTML(proposal.id)}">
      <span class="recent-mark mark-blue">${escapeHTML((proposal.client_name || "?").slice(0, 1).toUpperCase())}</span>
      <div class="list-main"><strong>${escapeHTML(proposal.client_name)}</strong><small>${escapeHTML(proposal.project_name || "Product design")} · ${new Date(proposal.created_at).toLocaleDateString()}</small></div>
      <span class="list-amount">${formatMoney(proposal.tiers?.[proposal.selected_tier]?.price || 0)}</span>
      <span class="status-pill status-${escapeHTML(proposal.status || "draft")}">${escapeHTML(proposal.status || "draft")}</span>
      <button class="button button-secondary small-button" data-open-proposal="${escapeHTML(proposal.id)}">Open</button>
    </article>`).join("");
  $("#stat-active").innerHTML = `${proposals.length} <span class="stat-change positive">saved</span>`;
  $("#proposal-count").textContent = String(proposals.length);
  $("#usage-count").textContent = String(proposals.length);
  $("#usage-progress").style.width = `${Math.min(100, proposals.length / 20 * 100)}%`;
}

function openSavedProposal(id) {
  requestFromHost("get-proposal", { proposalId: id }).then((result) => {
    if (result.error || !result.proposal) {
      toast(result.error || "Could not open this proposal.");
      return;
    }
    const proposal = result.proposal;
    state.currentProposalId = proposal.id;
    state.currentProposalSlug = proposal.share_slug;
    state.currentAnalysis = {
      tone: proposal.tone,
      summary: proposal.summary,
      proposalBody: proposal.proposal_body,
      risks: proposal.risks || [],
      pricing: Object.fromEntries(
        Object.entries(proposal.tiers || {}).map(([key, value]) => [key, value.price]),
      ),
    };
    state.currentTiers = proposal.tiers;
    $("#client-name").value = proposal.client_name;
    $("#job-description").value = proposal.brief;
    setTone(proposal.tone);
    updatePrices(proposal.tiers?.standard?.price || getBaseBudget(proposal.brief));
    renderRisks((proposal.risks || []).map((risk) => ({
      ...risk,
      icon: risk.level === "high" ? "!" : risk.level === "medium" ? "◷" : "✓",
    })));
    $("#analysis-title").textContent = "Your saved strategy";
    $("#proposal-summary").textContent = proposal.summary;
    $("#portal-overview").textContent = proposal.proposal_body;
    selectTier(proposal.selected_tier || "standard");
    showView("overview");
    toast(`Opened ${proposal.client_name}'s saved proposal.`);
  });
}

function handleHostMessage(event) {
  if (event.source !== window.parent || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== "scopepulse-host") return;
  if (message.type === "host-ready") {
    sendToHost("ready");
    return;
  }
  if (message.requestId && bridgeRequests.has(message.requestId)) {
    bridgeRequests.get(message.requestId)(message);
  }
  if (message.type === "backend-state") {
    state.backendConfigured = Boolean(message.configured);
    state.aiConfigured = Boolean(message.aiConfigured);
    $(".demo-label").textContent = state.aiConfigured ? "AI-READY" : state.backendConfigured ? "ACCOUNT SYNC" : "LOCAL PREVIEW";
    $("#analysis-disclaimer").innerHTML = state.aiConfigured
      ? "<span>✦</span> Your brief is securely sent to Anthropic for analysis when you generate a proposal."
      : state.backendConfigured
        ? "<span>⌁</span> Add ANTHROPIC_API_KEY to enable AI. Your proposals will still sync to your Supabase workspace."
        : "<span>⌁</span> Local preview uses heuristic analysis. Connect your workspace to enable AI-powered insights.";
    if (!state.backendConfigured) $("#profile-email").textContent = "Local preview";
    return;
  }
  if (message.type === "auth-state") {
    updateAuthState(message.user);
    if (message.error) toast(message.error);
    return;
  }
  if (message.type === "auth-result") {
    $("#auth-submit").disabled = false;
    $("#google-signin").disabled = false;
    $("#google-signin").textContent = "Continue with Google";
    if (message.error) {
      $("#auth-notice").textContent = message.error;
    } else if (message.message) {
      $("#auth-notice").textContent = message.message;
    } else if (message.success && state.authMode === "sign-out") {
      updateAuthState(null);
      toast("You are signed out.");
    } else if (message.success) {
      toast(state.authMode === "sign-up" ? "Your account is ready." : "Welcome back.");
    }
    return;
  }
  if (message.type === "analysis-result" && message.error) {
    return;
  }
  if (message.type === "proposal-saved") {
    if (message.error) {
      toast(`Analysis complete, but this proposal could not be saved: ${message.error}`);
      return;
    }
    state.currentProposalId = message.proposal.id;
    state.currentProposalSlug = message.proposal.share_slug;
    toast("Proposal saved to your workspace.");
    return;
  }
  if (message.type === "proposal-list") {
    if (message.error) {
      toast(`Could not load saved proposals: ${message.error}`);
      return;
    }
    renderSavedProposals(message.proposals);
    return;
  }
  if (message.type === "proposal-detail" && message.error) {
    toast(`Could not open this proposal: ${message.error}`);
    return;
  }
  if (message.type === "workspace-list") {
    if (message.error) {
      toast(`Could not load workspaces: ${message.error}`);
      return;
    }
    renderWorkspaces(message.workspaces, message.activeWorkspaceId);
    return;
  }
  if (message.type === "workspace-created" && message.error) {
    $("#workspace-submit").disabled = false;
    $("#workspace-notice").textContent = message.error;
    return;
  }
  if (message.type === "workspace-created" && message.workspaceId) {
    $("#workspace-submit").disabled = false;
    $("#workspace-overlay").classList.remove("open");
    $("#workspace-overlay").setAttribute("aria-hidden", "true");
    $("#workspace-input").value = "";
    toast("Your new workspace is ready.");
    return;
  }
  if (message.type === "workspace-selected" && message.error) {
    toast(message.error);
    return;
  }
  if (message.type === "proposal-published" && message.error) {
    toast(`Could not create the client link: ${message.error}`);
  }
}

function showView(name) {
  const view = $(`#view-${name}`);
  if (!view) return;
  $$(".view").forEach((item) => item.classList.toggle("active", item === view));
  $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  const title = name === "client" ? "Client preview" : name.charAt(0).toUpperCase() + name.slice(1);
  $("#current-crumb").textContent = title;
  closeMobileNavigation();
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
  const exampleAmount = $("#list-brightforge-amount");
  if (exampleAmount) exampleAmount.textContent = selected ? selected.textContent : formatMoney(base);
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
  $("#portal-overview").textContent = state.currentAnalysis?.tone === state.tone
    ? state.currentAnalysis.proposalBody
    : toneCopy[state.tone].intro;
  $("#portal-note").textContent = toneCopy[state.tone].note;
}

function renderPortalTiers() {
  const defaultTiers = {
    quick: { title: "MVP / Quick Win", detail: "Discovery and one high-impact workflow · 1 week" },
    standard: { title: "Standard Scale", detail: "Research and the core product experience · 3 weeks" },
    enterprise: { title: "Enterprise Growth", detail: "System-wide design and team enablement · 5 weeks" },
  };
  const tiers = state.currentTiers || defaultTiers;
  $("#portal-tier-list").innerHTML = ["quick", "standard", "enterprise"].map((key) => {
    const tier = tiers[key] || defaultTiers[key];
    return `
    <button class="portal-tier ${key === state.selectedTier ? "selected" : ""}" data-portal-tier="${key}">
      <strong>${escapeHTML(tier.title)}</strong><span class="portal-price" data-portal-price="${key}">${$(`[data-price="${key}"]`).textContent}</span><small>${escapeHTML(tier.detail)}</small>
    </button>`;
  }).join("");
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

async function openPortal() {
  updatePortalOverview();
  renderPortalTiers();
  const slug = ($("#client-name").value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "client";
  history.replaceState(null, "", `#/p/${slug}`);
  if (state.backendConfigured && state.user && state.currentProposalId) {
    const result = await requestFromHost("publish-proposal", {
      proposal: { id: state.currentProposalId, selectedTier: state.selectedTier },
    });
    if (result.error || !result.url) {
      toast(result.error || "Could not create a shareable client link.");
      return;
    }
    window.parent.location.assign(result.url);
    return;
  }
  if (state.backendConfigured && state.user && !state.currentProposalId) {
    toast("Save this proposal before creating its client link.");
    return;
  }
  showView("client");
  toast(`Local preview for ${slug}. Sign in to publish a shareable client link.`);
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

async function generateProposal(event) {
  event.preventDefault();
  const description = $("#job-description").value.trim();
  if (!description) {
    $("#job-description").focus();
    toast($("#job-url").value.trim()
      ? "This browser-only demo cannot fetch a job-post URL. Paste the visible job description to analyze it."
      : "Add a job description before starting the brief scan.");
    return;
  }
  if (state.backendConfigured && !state.user) {
    toast("Sign in to analyze and save a proposal.");
    openAuthDialog();
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
  try {
    let analysis;
    if (state.backendConfigured) {
      const result = await requestFromHost("analyze", {
        description,
        clientName: $("#client-name").value.trim() || "Your project",
        tone: state.tone,
      });
      if (result.error) throw new Error(result.error);
      analysis = result.analysis;
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 2100));
      analysis = {
        summary: "A focused first step, with room to grow into the full experience.",
        proposalBody: toneCopy[state.tone].intro,
        suggestedFirstStep: "Start with a focused discovery sprint. Agree on outcomes, scope, and feedback milestones before committing to later phases.",
        risks: buildRisks(description),
        pricing: (() => {
          const standard = getBaseBudget(description);
          return {
            quick: Math.round(standard * .5 / 100) * 100,
            standard,
            enterprise: Math.round(standard * 1.5 / 100) * 100,
          };
        })(),
      };
    }

    const client = $("#client-name").value.trim() || "Your project";
    $("#client-name").value = client;
    const tiers = {
      quick: {
        title: "MVP / Quick Win",
        price: analysis.pricing.quick,
        detail: "A focused first milestone with the highest-impact workflow.",
      },
      standard: {
        title: "Standard Scale",
        price: analysis.pricing.standard,
        detail: "A complete, validated product experience with clear delivery milestones.",
      },
      enterprise: {
        title: "Enterprise Growth",
        price: analysis.pricing.enterprise,
        detail: "A broader design partnership with team alignment and a scalable system.",
      },
    };
    state.currentProposalId = crypto.randomUUID();
    state.currentProposalSlug = null;
    state.currentTiers = tiers;
    state.currentAnalysis = { ...analysis, tone: state.tone };
    $("#proposal-client-name").innerHTML = `${escapeHTML(client)} <span>· Product design</span>`;
    $("#portal-client-name").textContent = client;
    $("#analysis-title").textContent = "Signals worth getting ahead of";
    renderRisks(analysis.risks.map((risk) => ({
      ...risk,
      icon: risk.level === "high" ? "!" : risk.level === "medium" ? "◷" : "✓",
    })));
    updatePrices(analysis.pricing.standard);
    setTone(state.tone);
    selectTier("standard");
    $("#portal-overview").textContent = analysis.proposalBody;
    $("#proposal-summary").textContent = analysis.summary;
    $(".analysis-footer span:last-child").textContent = analysis.suggestedFirstStep;
    state.currentTiers = tiers;
    renderPortalTiers();
    status.textContent = "SCAN COMPLETE";
    $("#proposal-title-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (state.backendConfigured && state.user) {
      const saved = await requestFromHost("save-proposal", {
        proposal: {
          id: state.currentProposalId,
          clientName: client,
          projectName: "Product design",
          brief: description,
          tone: state.tone,
          summary: analysis.summary,
          proposalBody: analysis.proposalBody,
          risks: analysis.risks,
          tiers,
          selectedTier: state.selectedTier,
        },
      });
      if (saved.error) toast(`Analysis complete, but the proposal could not be saved: ${saved.error}`);
      else {
        state.currentProposalId = saved.proposal.id;
        state.currentProposalSlug = saved.proposal.share_slug;
        toast("AI analysis complete. Proposal saved to your workspace.");
      }
    } else {
      state.proposals += 1;
      updatePrices(state.basePrice);
      toast("Local demo analysis complete. Sign in to save proposals and publish client links.");
    }
  } catch (error) {
    console.error("Proposal generation failed:", error);
    status.textContent = "ANALYSIS FAILED";
    toast(error instanceof Error ? error.message : "Proposal analysis failed. Please try again.");
  } finally {
    window.clearInterval(interval);
    button.innerHTML = original;
    button.disabled = false;
  }
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
    const savedProposal = event.target.closest("[data-open-proposal]");
    if (savedProposal) openSavedProposal(savedProposal.dataset.openProposal);
    const tier = event.target.closest("[data-tier], [data-portal-tier]");
    if (tier) selectTier(tier.dataset.tier || tier.dataset.portalTier);
  });

  $$(".filter-tab").forEach((button) => button.addEventListener("click", () => {
    $$(".filter-tab").forEach((item) => item.classList.toggle("active", item === button));
    $$(".proposal-list-card").forEach((card) => card.classList.toggle("hidden", button.dataset.filter !== "all" && card.dataset.status !== button.dataset.filter));
  }));
}

function closeMobileNavigation() {
  $(".sidebar").classList.remove("mobile-open");
  $("#mobile-nav-backdrop").classList.remove("visible");
  $("#mobile-menu-button").setAttribute("aria-expanded", "false");
}

function initAuth() {
  $("#auth-button").addEventListener("click", async () => {
    if (!state.user) {
      openAuthDialog();
      return;
    }
    state.authMode = "sign-out";
    await requestFromHost("auth", { action: "sign-out" });
  });
  $("#profile-button").addEventListener("click", () => {
    if (state.user) {
      state.authMode = "sign-out";
      requestFromHost("auth", { action: "sign-out" });
    } else {
      openAuthDialog();
    }
  });
  $("#auth-close").addEventListener("click", closeAuthDialog);
  $("#auth-overlay").addEventListener("click", (event) => {
    if (event.target === $("#auth-overlay")) closeAuthDialog();
  });
  $("#auth-switch").addEventListener("click", () => {
    setAuthMode(state.authMode === "sign-in" ? "sign-up" : "sign-in");
    $("#auth-notice").textContent = "";
  });
  $("#google-signin").addEventListener("click", async () => {
    if (!state.backendConfigured) {
      $("#auth-notice").textContent = "Connect Supabase before signing in with Google.";
      return;
    }
    const button = $("#google-signin");
    button.disabled = true;
    button.textContent = "Connecting to Google…";
    $("#auth-notice").textContent = "";
    const result = await requestFromHost("auth", { action: "google-sign-in" });
    if (result.error) {
      $("#auth-notice").textContent = result.error;
      button.disabled = false;
      button.textContent = "Continue with Google";
    }
  });
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.backendConfigured) {
      openAuthDialog();
      return;
    }
    const email = $("#auth-email").value.trim();
    const password = $("#auth-password").value;
    if (password.length < 8) {
      $("#auth-notice").textContent = "Use a password with at least 8 characters.";
      return;
    }
    $("#auth-submit").disabled = true;
    $("#auth-submit").textContent = state.authMode === "sign-up" ? "Creating account…" : "Signing in…";
    $("#auth-notice").textContent = "";
    const result = await requestFromHost("auth", {
      action: state.authMode,
      email,
      password,
    });
    if (result.error) {
      $("#auth-notice").textContent = result.error;
      $("#auth-submit").disabled = false;
      setAuthMode(state.authMode);
    } else if (result.message) {
      $("#auth-notice").textContent = result.message;
      $("#auth-submit").disabled = false;
      setAuthMode(state.authMode);
    }
  });
  $("#mobile-menu-button").addEventListener("click", () => {
    const open = !$(".sidebar").classList.contains("mobile-open");
    $(".sidebar").classList.toggle("mobile-open", open);
    $("#mobile-nav-backdrop").classList.toggle("visible", open);
    $("#mobile-menu-button").setAttribute("aria-expanded", String(open));
  });
  $("#mobile-nav-backdrop").addEventListener("click", closeMobileNavigation);
  $("#workspace-select").addEventListener("change", async (event) => {
    const workspaceId = event.target.value;
    const result = await requestFromHost("select-workspace", { workspaceId });
    if (result.error) {
      toast(result.error);
      return;
    }
    toast("Workspace switched.");
  });
  $("#workspace-create").addEventListener("click", () => {
    if (!state.user) {
      toast("Sign in to create a workspace.");
      openAuthDialog();
      return;
    }
    $("#workspace-overlay").classList.add("open");
    $("#workspace-overlay").setAttribute("aria-hidden", "false");
    $("#workspace-input").focus();
  });
  $("#workspace-close").addEventListener("click", () => {
    $("#workspace-overlay").classList.remove("open");
    $("#workspace-overlay").setAttribute("aria-hidden", "true");
  });
  $("#workspace-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspaceName = $("#workspace-input").value.trim();
    if (workspaceName.length < 2) {
      $("#workspace-notice").textContent = "Workspace names need at least 2 characters.";
      return;
    }
    $("#workspace-submit").disabled = true;
    $("#workspace-submit").textContent = "Creating workspace…";
    $("#workspace-notice").textContent = "";
    const result = await requestFromHost("workspace-create", { workspaceName });
    if (result.error) {
      $("#workspace-submit").disabled = false;
      $("#workspace-submit").innerHTML = 'Create workspace <span>→</span>';
      $("#workspace-notice").textContent = result.error;
    } else {
      $("#workspace-submit").innerHTML = 'Create workspace <span>→</span>';
    }
  });
  $("#empty-start").addEventListener("click", () => {
    $("#job-description").focus();
    $("#brief-form").scrollIntoView({ behavior: "smooth", block: "center" });
  });
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
    if (event.key === "Escape" && $("#auth-overlay").classList.contains("open")) {
      closeAuthDialog();
      return;
    }
    if (event.key === "Escape") closeMobileNavigation();
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
  window.addEventListener("message", handleHostMessage);
  initNavigation();
  initCommandPalette();
  initKeyboardShortcuts();
  initAuth();
  initIntegrations();
  initRoute();
  $$(".tone-option").forEach((button) => button.addEventListener("click", () => {
    const nextTone = button.dataset.tone;
    if (state.currentAnalysis && nextTone !== state.tone) {
      state.currentAnalysis = null;
      state.currentProposalId = null;
      state.currentProposalSlug = null;
      state.currentTiers = null;
      toast("Proposal angle changed. Re-run the analysis to refresh your saved proposal.");
    }
    setTone(nextTone);
  }));
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
  sendToHost("ready");
}

init();
