(() => {
  const DATASET_URL = "data/customerData.json";
  const REF_URL = "data/reference_master_data.json";
  const COLORS_URL = "data/reference_colors.json";

  const ICONS = {
    GLOBAL_CUSTOMER: "icons/global_customer.svg",
    CUSTOMER: "icons/customer_big.svg",
    CUSTOMER_SME: "icons/customer_sme.svg",
    ACCOUNT: "icons/document.svg",
    CONTRACT: "icons/contract.svg",
    BILLING: "icons/billing.svg",
    ADDRESS: "icons/address.svg",
    CONTACT: "icons/contact.svg",
    PLATFORM: "icons/platform.svg",
    PICKUP_WAREHOUSE: "icons/pickup_warehouse.svg",
    STORE: "icons/store.svg",
    SHOP: "icons/shop_rgb_red.svg",
    INDIVIDUAL: "icons/individual_customer.svg",
  };

  const els = {
    scenarioSelector: document.getElementById("scenarioSelector"),
    filterCustomerType: document.getElementById("filterCustomerType"),
    filterIndustry: document.getElementById("filterIndustry"),
    filterSalesChannel: document.getElementById("filterSalesChannel"),
    layoutMode: document.getElementById("layoutMode"),
    clearFilters: document.getElementById("clearFilters"),

    collapseAll: document.getElementById("collapseAll"),
    expandAll: document.getElementById("expandAll"),
    fitScreen: document.getElementById("fitScreen"),
    toggleInspector: document.getElementById("toggleInspector"),

    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText"),

    inspector: document.getElementById("inspector"),
    classificationPills: document.getElementById("classificationPills"),
    meaningBox: document.getElementById("meaningBox"),
    objectSummary: document.getElementById("objectSummary"),
    readableJson: document.getElementById("readableJson"),
    rawJson: document.getElementById("rawJson"),

    legend: document.getElementById("legend"),
    viz: document.getElementById("viz"),
  };

  const LEGEND_TYPES = [
    { key: "GLOBAL_CUSTOMER", label: "Global Customer", colorVar: "--c-global" },
    { key: "CUSTOMER", label: "Customer", colorVar: "--c-customer" },
    { key: "ACCOUNT", label: "Account", colorVar: "--c-account" },
    { key: "CONTRACT", label: "Contract", colorVar: "--c-contract" },
    { key: "BILLING", label: "Billing", colorVar: "--c-billing" },
    { key: "ADDRESS", label: "Address", colorVar: "--c-address" },
    { key: "CONTACT", label: "Contact", colorVar: "--c-contact" },
    { key: "PLATFORM", label: "Platform", colorVar: "--c-platform" },
  ];

  // Business-facing channel definitions
  const channelDefinitions = {
    MAJOR_ACCOUNT: {
      title: "Major Account",
      definition: "High-value, complex customers with dedicated ownership and governance cadence (QBRs, tailored KPIs, contractual customization).",
      primaryContact: "Global / Regional Account Manager.",
    },
    KEY_ACCOUNT: {
      title: "Key Account",
      definition: "Strategic customers managed by Key Account teams with end-to-end performance management and controlled onboarding changes.",
      primaryContact: "Key Account Manager.",
    },
    FIELD_SALES: {
      title: "Field Sales",
      definition: "Face-to-face commercial ownership for domestic customers. Focus on growth, retention and local operational alignment.",
      primaryContact: "Field Sales Executive.",
    },
    TELESALES: {
      title: "Telesales",
      definition: "Remote account ownership for SME customers at scale; standardized onboarding, digital enablement and retention plays.",
      primaryContact: "Inside Sales / Telesales Agent.",
    },
    MULTICHANNEL: {
      title: "Multichannel / Digital",
      definition: "Self-serve onboarding via portal, plugins or API. Low-touch operations and automated lifecycle journeys.",
      primaryContact: "Digital channel support (self-service + CS).",
    },
    SERVICE_POINTS_RETAIL: {
      title: "Service Point Retail",
      definition: "Transactional retail/cash customers served via physical network (parcel shops, lockers).",
      primaryContact: "ServicePoint Agent / POS.",
    },
    PARTNER_MANAGERS: {
      title: "Partner Managers",
      definition: "Indirect channel where partners resell/integrate DHL services and onboard their sellers/shippers.",
      primaryContact: "Partner Manager.",
    },
    INTERNAL: {
      title: "Internal",
      definition: "DHL internal customer relationships for inter-company services and internal transfers.",
      primaryContact: "Internal Ops Lead.",
    },
  };

  // --- state ---
  let ref = null;
  let dataset = [];
  let currentScenario = null;

  let hiddenTypes = new Set();
  let collapsedKeys = new Set();

  // d3
  let svg, rootG, zoom, tooltip, resizeObs;
  let fitRequested = false;

  // Layout constants
  const CARD_W = 268;
  const CARD_H = 92;

  const GAP_MAIN = 120;     // spacing along hierarchy axis
  const GAP_SIDE = 108;     // spacing along side axis between side objects
  const OFFSET_SIDE = 260;  // how far side objects go from the parent

  Promise.all([
    fetchJson(DATASET_URL),
    fetchJson(REF_URL),
    fetchJson(COLORS_URL).catch(() => null),
  ])
    .then(([data, reference, colors]) => {
      dataset = Array.isArray(data) ? data : [];
      ref = reference || null;
      if (colors && typeof colors === "object") applyColors(colors);

      initScenarioSelector(dataset);
      initFilters(ref);
      initD3();
      bindUI();

      filterScenarioListByTopFilters(true);

      if (dataset.length) {
        const preferred =
          dataset.find(s => s?.customer?.customerType === "RELATIONSHIP_CUSTOMERS") ||
          dataset[0];

        els.scenarioSelector.value = preferred?.scenarioName || dataset[0]?.scenarioName || "";
        setScenario(els.scenarioSelector.value, { fit: true });
      } else {
        console.warn("Dataset empty");
      }
    })
    .catch((err) => {
      console.error("Load failed:", err);
      alert("Failed to load JSON data. Ensure you serve via HTTP (GitHub Pages is OK) and /data paths are correct.");
    });

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.json();
    });
  }

  function applyColors(colorsJson) {
    const tokens = colorsJson.tokens || colorsJson;
    const map = {
      "--c-global": tokens.globalCustomer || tokens["--c-global"] || tokens.c_global,
      "--c-customer": tokens.customer || tokens["--c-customer"] || tokens.c_customer,
      "--c-account": tokens.account || tokens["--c-account"] || tokens.c_account,
      "--c-contract": tokens.contract || tokens["--c-contract"] || tokens.c_contract,
      "--c-address": tokens.address || tokens["--c-address"] || tokens.c_address,
      "--c-contact": tokens.contact || tokens["--c-contact"] || tokens.c_contact,
      "--c-billing": tokens.billing || tokens["--c-billing"] || tokens.c_billing,
      "--c-platform": tokens.platform || tokens["--c-platform"] || tokens.c_platform,
    };
    Object.entries(map).forEach(([k, v]) => {
      if (typeof v === "string" && v.trim()) document.documentElement.style.setProperty(k, v.trim());
    });
  }

  // ---------- UI init ----------
  function initScenarioSelector(data, keepSelection = null) {
    const sel = keepSelection ?? els.scenarioSelector.value ?? "";
    els.scenarioSelector.innerHTML = "";
    data.forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = s.scenarioName || `Scenario ${i + 1}`;
      opt.textContent = s.scenarioName || `Scenario ${i + 1}`;
      els.scenarioSelector.appendChild(opt);
    });

    if (sel && Array.from(els.scenarioSelector.options).some(o => o.value === sel)) {
      els.scenarioSelector.value = sel;
    }
  }

  function initFilters(reference) {
    const domains = (reference && reference.domains) || {};
    fillSelect(els.filterCustomerType, ["", ...((domains.customerType) || [])], "All");
    fillSelect(els.filterIndustry, ["", ...((domains.industrySector) || [])], "All");
    fillSelect(els.filterSalesChannel, ["", ...((domains.salesChannel) || [])], "All");
    els.dqDot.style.background = "#9ca3af";
    els.dqText.textContent = "DQ: N/A";
  }

  function fillSelect(selectEl, values, labelAll) {
    selectEl.innerHTML = "";
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v === "" ? labelAll : v;
      selectEl.appendChild(opt);
    });
  }

  function bindUI() {
    els.scenarioSelector.addEventListener("change", () => {
      setScenario(els.scenarioSelector.value, { fit: true, keepCollapse: true });
    });

    const onFilterChange = () => {
      filterScenarioListByTopFilters(false);
      applyDQAndMeaning();
      requestFit(true);
      render();
    };

    els.filterCustomerType.addEventListener("change", onFilterChange);
    els.filterIndustry.addEventListener("change", onFilterChange);
    els.filterSalesChannel.addEventListener("change", onFilterChange);

    els.layoutMode.addEventListener("change", () => {
      requestFit(true);
      render();
    });

    els.clearFilters.addEventListener("click", () => {
      els.filterCustomerType.value = "";
      els.filterIndustry.value = "";
      els.filterSalesChannel.value = "";
      onFilterChange();
    });

    els.toggleInspector.addEventListener("click", () => {
      els.inspector.classList.toggle("is-collapsed");
      requestFit(true);
      setTimeout(() => requestFit(true), 240);
      render();
    });

    els.collapseAll.addEventListener("click", () => {
      if (!currentScenario) return;
      collapsedKeys = new Set();
      const root = buildRootNode(currentScenario);
      walk(root, (n) => {
        if (n.__hasChildrenOriginal && n.__depth >= 1) collapsedKeys.add(n.__stableKey);
      });
      requestFit(true);
      render();
    });

    els.expandAll.addEventListener("click", () => {
      collapsedKeys = new Set();
      requestFit(true);
      render();
    });

    els.fitScreen.addEventListener("click", () => {
      requestFit(true);
      render();
    });
  }

  function requestFit(force = false) {
    fitRequested = true;
    scheduleZoomToFit(force);
  }

  // ---------- Scenario filtering ----------
  function filterScenarioListByTopFilters(isBoot) {
    const t = els.filterCustomerType.value;
    const i = els.filterIndustry.value;
    const c = els.filterSalesChannel.value;

    const filtered = dataset.filter((s) => {
      const cust = s.customer || {};
      const okT = t ? cust.customerType === t : true;
      const okI = i ? cust.industrySector === i : true;
      const okC = c ? (s.accounts || []).some((a) => a.salesChannel === c) : true;
      return okT && okI && okC;
    });

    const prevSelected = els.scenarioSelector.value;
    initScenarioSelector(filtered.length ? filtered : dataset, prevSelected);

    const stillExists = Array.from(els.scenarioSelector.options).some((o) => o.value === prevSelected);
    if (!stillExists && !isBoot) {
      const next = els.scenarioSelector.options[0]?.value || "";
      if (next) setScenario(next, { fit: true, keepCollapse: true });
    }
  }

  // ---------- scenario selection ----------
  function setScenario(name, opts = {}) {
    const { fit = false, keepCollapse = false } = opts;

    currentScenario = dataset.find((s) => s.scenarioName === name) || dataset[0] || null;
    hiddenTypes = new Set();
    if (!keepCollapse) collapsedKeys = new Set();

    renderLegend();
    applyDQAndMeaning();
    render();
    setSelectedObject(null, currentScenario);

    if (fit) setTimeout(() => requestFit(true), 0);
  }

  function applyDQAndMeaning() {
    if (!currentScenario) return;

    const t = els.filterCustomerType.value;
    const i = els.filterIndustry.value;
    const c = els.filterSalesChannel.value;

    const rootCustomer = currentScenario.customer || {};
    const okT = t ? rootCustomer.customerType === t : true;
    const okI = i ? rootCustomer.industrySector === i : true;
    const okC = c ? (currentScenario.accounts || []).some((a) => a.salesChannel === c) : true;

    const ok = okT && okI && okC;
    els.dqDot.style.background = ok ? "#22c55e" : "#f59e0b";
    els.dqText.textContent = ok ? "DQ: OK" : "DQ: CHECK";

    const ct = t || rootCustomer.customerType || "—";
    const ind = i || rootCustomer.industrySector || "—";
    const ch = c || pickDominantChannel(currentScenario) || "—";
    renderBusinessMeaning(ct, ind, ch);
    renderClassificationPills(ct, ind, ch);
  }

  function pickDominantChannel(scenario) {
    const counts = new Map();
    (scenario?.accounts || []).forEach((a) => {
      if (!a.salesChannel) return;
      counts.set(a.salesChannel, (counts.get(a.salesChannel) || 0) + 1);
    });
    let best = null, bestN = -1;
    for (const [k, v] of counts.entries()) {
      if (v > bestN) { bestN = v; best = k; }
    }
    return best;
  }

  // ---------- legend ----------
  function renderLegend() {
    els.legend.innerHTML = "";
    LEGEND_TYPES.forEach((t) => {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.dataset.type = t.key;

      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = getCssVar(t.colorVar);

      const txt = document.createElement("span");
      txt.textContent = t.label;

      item.appendChild(dot);
      item.appendChild(txt);

      item.addEventListener("click", () => {
        if (hiddenTypes.has(t.key)) hiddenTypes.delete(t.key);
        else hiddenTypes.add(t.key);

        item.classList.toggle("off", hiddenTypes.has(t.key));
        requestFit(true);
        render();
      });

      els.legend.appendChild(item);
    });
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---------- D3 ----------
  function initD3() {
    els.viz.innerHTML = "";
    svg = d3.select("#viz").append("svg");
    rootG = svg.append("g");

    const resizeSvg = () => {
      const w = els.viz.clientWidth;
      const h = els.viz.clientHeight;
      if (!w || !h) return;
      svg.attr("width", w).attr("height", h);
    };

    resizeSvg();

    if (resizeObs) {
      try { resizeObs.disconnect(); } catch (_) { }
    }
    resizeObs = new ResizeObserver(() => {
      resizeSvg();
      requestFit(true);
    });
    resizeObs.observe(els.viz);

    window.addEventListener("resize", () => {
      resizeSvg();
      requestFit(true);
    }, { passive: true });

    zoom = d3.zoom()
      .scaleExtent([0.2, 3.2])
      .on("zoom", (event) => rootG.attr("transform", event.transform));

    svg.call(zoom);
    svg.style("user-select", "none");

    tooltip = d3.select("#viz")
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);
  }

  function render() {
    if (!currentScenario) return;

    // Build nodes/edges + compute custom layout
    const root = buildRootNode(currentScenario);
    markDepth(root, 0);
    markHasChildrenOriginal(root);
    applyCollapse(root);

    const layoutMode = els.layoutMode?.value || "VERTICAL";
    const isHorizontal = layoutMode === "HORIZONTAL";

    // Build edges (after collapse is applied)
    const edges = [];
    walk(root, (n) => {
      (n.children || []).forEach((c) => edges.push({ sourceKey: n.__stableKey, targetKey: c.__stableKey }));
    });

    // Compute positions with a tidy tree for hierarchy nodes + side-object fan-out
    const placed = computePositions(root, isHorizontal);

    // Render
    rootG.selectAll("*").remove();

    const isHidden = (node) => hiddenTypes.has(node.__type);

    // Links
    const visibleEdges = edges.filter(e => {
      const s = placed.get(e.sourceKey)?.node;
      const t = placed.get(e.targetKey)?.node;
      if (!s || !t) return false;
      return !isHidden(s) && !isHidden(t);
    });

    rootG.selectAll(".link")
      .data(visibleEdges)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("d", (e) => {
        const s = placed.get(e.sourceKey);
        const t = placed.get(e.targetKey);
        const sx = s.x, sy = s.y;
        const tx = t.x, ty = t.y;

        // Clean orthogonal path
        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;

        // If mostly horizontal vs vertical
        const dx = Math.abs(tx - sx);
        const dy = Math.abs(ty - sy);

        if (dx > dy) {
          return `M${sx},${sy} L${midX},${sy} L${midX},${ty} L${tx},${ty}`;
        }
        return `M${sx},${sy} L${sx},${midY} L${tx},${midY} L${tx},${ty}`;
      });

    // Nodes list
    const nodesArr = Array.from(placed.values())
      .map(v => v.node)
      .filter(n => !isHidden(n));

    const nodes = rootG.selectAll(".node")
      .data(nodesArr, d => d.__stableKey)
      .enter()
      .append("g")
      .attr("class", d => `node node--${d.__type}`)
      .attr("transform", d => {
        const p = placed.get(d.__stableKey);
        return `translate(${p.x},${p.y})`;
      })
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseout", hideTooltip);

    // Card
    nodes.append("rect")
      .attr("x", -CARD_W / 2)
      .attr("y", -CARD_H / 2)
      .attr("width", CARD_W)
      .attr("height", CARD_H)
      .attr("fill", d => typeFill(d.__type))
      .attr("stroke", "rgba(17,24,39,.10)");

    // Click selects (card)
    nodes.select("rect")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        setSelectedObject(d.__raw, currentScenario, d.__type);
      });

    // Icon (top-left)
    nodes.append("image")
      .attr("href", d => pickIcon(d))
      .attr("x", -CARD_W / 2 + 12)
      .attr("y", -CARD_H / 2 + 12)
      .attr("width", 22)
      .attr("height", 22)
      .attr("opacity", d => d.__type === "PLATFORM" ? 0.75 : 0.92)
      .style("pointer-events", "none");

    // +/- toggle group (only if has children original)
    const pm = nodes.append("g")
      .attr("class", "pmg")
      .style("pointer-events", "all")
      .style("cursor", d => (d.__hasChildrenOriginal ? "pointer" : "default"))
      .on("click", (event, d) => {
        event.stopPropagation();
        if (!d.__hasChildrenOriginal) return;
        if (collapsedKeys.has(d.__stableKey)) collapsedKeys.delete(d.__stableKey);
        else collapsedKeys.add(d.__stableKey);
        requestFit(true);
        render();
      });

    pm.append("rect")
      .attr("class", "pm-hit")
      .attr("x", CARD_W / 2 - 44)
      .attr("y", -CARD_H / 2 + 8)
      .attr("width", 36)
      .attr("height", 36)
      .attr("rx", 12)
      .attr("ry", 12)
      .attr("fill", "transparent");

    pm.append("text")
      .attr("class", "pm")
      .attr("x", CARD_W / 2 - 26)
      .attr("y", -CARD_H / 2 + 33)
      .attr("text-anchor", "middle")
      .text(d => (d.__hasChildrenOriginal ? (collapsedKeys.has(d.__stableKey) ? "+" : "−") : ""))
      .style("pointer-events", "none");

    // Title
    const titleText = nodes.append("text")
      .attr("class", "node-title")
      .attr("text-anchor", "middle")
      .attr("dy", "-18")
      .style("font-weight", 900)
      .style("font-size", "13px")
      .style("pointer-events", "none")
      .text(d => d.__title || "");

    titleText.each(function () { truncateSvgTextToWidth(this, CARD_W - 58, false); });

    // Key line 1
    const k1 = nodes.append("text")
      .attr("class", "node-k1")
      .attr("text-anchor", "middle")
      .attr("dy", "6")
      .style("font-weight", 900)
      .style("font-size", "11px")
      .style("pointer-events", "none")
      .text(d => d.__k1 || "");

    k1.each(function (d) { truncateSvgTextToWidth(this, CARD_W - 28, shouldMiddleTruncate(d.__k1)); });

    // Key line 2
    const k2 = nodes.append("text")
      .attr("class", "node-k2")
      .attr("text-anchor", "middle")
      .attr("dy", "24")
      .style("font-weight", 900)
      .style("font-size", "11px")
      .style("pointer-events", "none")
      .text(d => d.__k2 || "");

    k2.each(function (d) { truncateSvgTextToWidth(this, CARD_W - 28, shouldMiddleTruncate(d.__k2)); });

    applyDimming(nodes);

    if (fitRequested) {
      fitRequested = false;
      scheduleZoomToFit(true);
    }
  }

  function typeFill(type) {
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (type === "GLOBAL_CUSTOMER") return css("--c-global");
    if (type === "CUSTOMER") return css("--c-customer");
    if (type === "ACCOUNT") return css("--c-account");
    if (type === "CONTRACT") return css("--c-contract");
    if (type === "BILLING") return css("--c-billing");
    if (type === "ADDRESS") return css("--c-address");
    if (type === "CONTACT") return css("--c-contact");
    if (type === "PLATFORM") return css("--c-platform");
    return "#9ca3af";
  }

  function pickIcon(node) {
    if (node.__type === "GLOBAL_CUSTOMER") return ICONS.GLOBAL_CUSTOMER;
    if (node.__type === "CUSTOMER") {
      const lvl = (node.__raw?.customerLevel || "").toUpperCase();
      if (lvl === "SME" || lvl === "RETAIL") return ICONS.CUSTOMER_SME;
      return ICONS.CUSTOMER;
    }
    if (node.__type === "ACCOUNT") return ICONS.DOCUMENT;
    if (node.__type === "CONTRACT") return ICONS.CONTRACT;
    if (node.__type === "BILLING") return ICONS.BILLING;
    if (node.__type === "ADDRESS") {
      if ((node.__raw?.addressType || "").toUpperCase() === "PICKUP") return ICONS.PICKUP_WAREHOUSE;
      return ICONS.ADDRESS;
    }
    if (node.__type === "CONTACT") return ICONS.CONTACT;
    if (node.__type === "PLATFORM") return ICONS.PLATFORM;
    return ICONS.DOCUMENT;
  }

  function applyDimming(nodesSel) {
    const t = els.filterCustomerType.value;
    const i = els.filterIndustry.value;
    const c = els.filterSalesChannel.value;

    if (!t && !i && !c) {
      nodesSel.classed("is-dimmed", false);
      return;
    }

    nodesSel.classed("is-dimmed", (d) => {
      const raw = d.__raw || {};
      if (d.__type === "CUSTOMER" || d.__type === "GLOBAL_CUSTOMER") {
        const okT = t ? raw.customerType === t : true;
        const okI = i ? raw.industrySector === i : true;
        return !(okT && okI);
      }
      if (d.__type === "ACCOUNT") {
        const okC = c ? raw.salesChannel === c : true;
        return !okC;
      }
      return false;
    });
  }

  // ---------- Positioning (tidy hierarchy + side fan-out) ----------
  // Hierarchy rules:
  // - For ACCOUNT: only child ACCOUNTs are hierarchy children (parentAccountId structure)
  // - For CUSTOMER / GLOBAL_CUSTOMER: all children are hierarchy (country customers + root accounts)
  // - For CONTRACT and other side objects: no hierarchy children
  // Side objects:
  // - Any remaining children that are NOT hierarchy children are rendered as side objects
  //   (placed perpendicular to the hierarchy direction).
  function hierarchyChildren(node) {
    if (!node) return [];
    if (node.__type === "ACCOUNT") {
      return (node.children || []).filter((c) => c.__type === "ACCOUNT");
    }
    if (node.__type === "CUSTOMER" || node.__type === "GLOBAL_CUSTOMER") {
      return (node.children || []);
    }
    return [];
  }

  function sideChildren(node) {
    const hier = new Set(hierarchyChildren(node).map((c) => c.__stableKey));
    return (node.children || []).filter((c) => !hier.has(c.__stableKey));
  }

  function computePositions(root, isHorizontal) {
    const placed = new Map(); // stableKey -> {x,y,node}

    // 1) Place hierarchy nodes with a tidy tree (prevents overlaps)
    const h = d3.hierarchy(root, (d) => hierarchyChildren(d));

    // Spacing tuned for CARD_W/CARD_H
    const dx = CARD_W + 120; // sibling spacing
    const dy = CARD_H + 160; // level spacing

    const tree = d3.tree().nodeSize([dx, dy]);
    tree(h);

    // d3.tree uses x (horizontal) and y (depth). We rotate if horizontal mode is selected.
    h.descendants().forEach((hn) => {
      const n = hn.data;
      const x = isHorizontal ? hn.y : hn.x;
      const y = isHorizontal ? hn.x : hn.y;
      placed.set(n.__stableKey, { x, y, node: n });
    });

    // 2) Place side objects for ANY placed node (ACCOUNT side objects, CONTRACT children, etc.)
    //    We do BFS: when we place a side node, it becomes eligible to place its own side children.
    const queue = Array.from(placed.values()).map((v) => v.node);
    const seen = new Set(queue.map((n) => n.__stableKey));

    while (queue.length) {
      const parent = queue.shift();
      const p = placed.get(parent.__stableKey);
      if (!p) continue;

      const kids = sideChildren(parent);
      if (!kids.length) continue;

      const total = kids.length;
      const start = -(total - 1) / 2;

      kids.forEach((k, idx) => {
        const t = start + idx;

        // Perpendicular fan-out:
        // - Vertical mode: hierarchy goes DOWN => side goes RIGHT and stacks vertically
        // - Horizontal mode: hierarchy goes RIGHT => side goes DOWN and stacks horizontally
        const sideDx = isHorizontal ? 0 : OFFSET_SIDE;
        const sideDy = isHorizontal ? OFFSET_SIDE : 0;

        const stackDx = isHorizontal ? t * (CARD_W + 70) : 0;
        const stackDy = isHorizontal ? 0 : t * (CARD_H + 60);

        const nx = p.x + sideDx + stackDx;
        const ny = p.y + sideDy + stackDy;

        // If already placed (shouldn't happen often), nudge slightly to avoid collisions
        const key = k.__stableKey;
        if (!placed.has(key)) {
          placed.set(key, { x: nx, y: ny, node: k });
          if (!seen.has(key)) {
            seen.add(key);
            queue.push(k);
          }
        }
      });
    }

    return placed;
  }

  // ---------- Zoom-to-fit ----------
  function scheduleZoomToFit(force = false) {
    requestAnimationFrame(() => requestAnimationFrame(() => zoomToFit(force)));
  }

  function zoomToFit(force = false) {
    const g = rootG?.node?.();
    if (!g) return;

    const vw = els.viz.clientWidth;
    const vh = els.viz.clientHeight;
    if (!vw || !vh || vw < 80 || vh < 80) {
      scheduleZoomToFit(true);
      return;
    }
    svg.attr("width", vw).attr("height", vh);

    const bbox = g.getBBox();
    if (!bbox || bbox.width === 0 || bbox.height === 0) {
      scheduleZoomToFit(true);
      return;
    }

    const pad = 90;
    const scale = Math.min(vw / (bbox.width + pad), vh / (bbox.height + pad), 2.0) * 1.08;
    const tx = vw / 2 - (bbox.x + bbox.width / 2) * scale;
    const ty = vh / 2 - (bbox.y + bbox.height / 2) * scale;

    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    svg.interrupt();
    svg.transition().duration(force ? 260 : 200).call(zoom.transform, t);
  }

  // ---------- Tree builder ----------
  function buildRootNode(scenario) {
    const rootCustomer = scenario.customer || {};
    const hasMultiCountry = Array.isArray(scenario.relatedCustomers) && scenario.relatedCustomers.length >= 2;
    const isStrategic =
      rootCustomer.customerType === "STRATEGIC_CUSTOMERS" || rootCustomer.customerLevel === "STRATEGIC";

    // Global customer only when strategic + multi-country
    const rootNode =
      isStrategic && hasMultiCountry
        ? makeNode("GLOBAL_CUSTOMER", stableKey("GLOBAL_CUSTOMER", rootCustomer.mdmCustomerId || "GLOBAL"), rootCustomer.tradingName || rootCustomer.officialName || "Global Customer", rootCustomer)
        : makeNode("CUSTOMER", stableKey("CUSTOMER", rootCustomer.mdmCustomerId || "CUSTOMER"), rootCustomer.tradingName || rootCustomer.officialName || "Customer", rootCustomer);

    // accounts grouped by parentAccountId
    const accounts = scenario.accounts || [];
    const byParent = new Map();
    accounts.forEach((a) => {
      const p = a.parentAccountId || "__ROOT__";
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(a);
    });

    const attachAccountsForCustomer = (custId, parentNode) => {
      const roots = accounts.filter((a) => a.mdmCustomerId === custId && !a.parentAccountId);
      roots.forEach((acc) => parentNode.children.push(buildAccountSubtree(acc, byParent)));
    };

    if (rootNode.__type === "GLOBAL_CUSTOMER") {
      (scenario.relatedCustomers || []).forEach((rc) => {
        const cn = makeNode("CUSTOMER", stableKey("CUSTOMER", rc.mdmCustomerId), rc.tradingName || rc.officialName || "Country Customer", rc);
        attachAccountsForCustomer(rc.mdmCustomerId, cn);
        rootNode.children.push(cn);
      });
      attachAccountsForCustomer(rootCustomer.mdmCustomerId, rootNode);
    } else {
      attachAccountsForCustomer(rootCustomer.mdmCustomerId, rootNode);
    }

    return rootNode;
  }

  function buildAccountSubtree(acc, byParent) {
    const node = makeNode("ACCOUNT", stableKey("ACCOUNT", acc.mdmAccountId), acc.tradingName || acc.mdmAccountId, acc);
    const pk = node.__stableKey;

    // Side objects first (so they become sideKids in layout)
    (acc.contactPersons || []).forEach((c, idx) => {
      const nm = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.contactPersonId || "Contact";
      const key = childKey(pk, "CONTACT", c.contactPersonId || nm, idx, c);
      node.children.push(makeNode("CONTACT", key, nm, c));
    });

    (acc.addresses || []).forEach((a, idx) => {
      const nm = `${a.addressType || "ADDRESS"} · ${a.city || ""}`.trim() || "Address";
      const key = childKey(pk, "ADDRESS", a.addressId || nm, idx, a);
      node.children.push(makeNode("ADDRESS", key, nm, a));
    });

    if (acc.platformObject) {
      const p = acc.platformObject;
      const label = p.name || "Platform";
      const key = childKey(pk, "PLATFORM", p.platformId || p.name || label, 0, p);
      node.children.push(makeNode("PLATFORM", key, label, p));
    }

    (acc.contracts || []).forEach((c, cIdx) => {
      const cLabel = c.contractName || "Contract";
      const cKey = childKey(pk, "CONTRACT", c.contractId || cLabel, cIdx, c);
      const cn = makeNode("CONTRACT", cKey, cLabel, c);

      if (c.billingProfile) {
        const b = c.billingProfile;
        const bLabel = b.billingAccountNumber || "Billing Profile";
        const bKey = childKey(cKey, "BILLING", b.billingProfileId || b.billingAccountNumber || bLabel, 0, b);
        cn.children.push(makeNode("BILLING", bKey, bLabel, b));
      }

      (c.contactPersons || []).forEach((cp, idx) => {
        const nm = `${cp.firstName || ""} ${cp.lastName || ""}`.trim() || cp.contactPersonId || "Contact";
        const key = childKey(cKey, "CONTACT", cp.contactPersonId || nm, idx, cp);
        cn.children.push(makeNode("CONTACT", key, nm, cp));
      });

      (c.addresses || []).forEach((ad, idx) => {
        const nm = `${ad.addressType || "ADDRESS"} · ${ad.city || ""}`.trim() || "Address";
        const key = childKey(cKey, "ADDRESS", ad.addressId || nm, idx, ad);
        cn.children.push(makeNode("ADDRESS", key, nm, ad));
      });

      node.children.push(cn);
    });

    // Child accounts (these will be hierarchyKids in layout)
    const kids = byParent.get(acc.mdmAccountId) || [];
    kids.forEach((k) => node.children.push(buildAccountSubtree(k, byParent)));

    return node;
  }

  function stableKey(type, id) {
    return `${type}:${String(id || "").trim()}`;
  }

  // Ensures uniqueness even when source objects are missing IDs (common for contacts/addresses/platforms).
  // Deterministic: same parent + same preferredId + same idx => same key.
  function childKey(parentStableKey, type, preferredId, idx, raw) {
    const base = String(preferredId || "").trim();
    if (base) return `${type}:${base}@${parentStableKey}#${idx}`;

    // Fallback: create a compact signature from common fields (still deterministic)
    const sig = [
      raw?.mdmAccountId,
      raw?.mdmCustomerId,
      raw?.contactPersonId,
      raw?.addressId,
      raw?.billingProfileId,
      raw?.contractId,
      raw?.platformId,
      raw?.name,
      raw?.officialName,
      raw?.tradingName,
      raw?.city,
      raw?.postalcode,
      raw?.street,
      raw?.houseNumber,
      raw?.firstName,
      raw?.lastName,
      raw?.jobTitle,
      raw?.addressType,
      raw?.type,
      raw?.provider,
    ]
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v).trim())
      .join("|")
      .slice(0, 120);

    return `${type}:__NOID__:${sig}@${parentStableKey}#${idx}`;
  }

  function markDepth(node, d) {
    node.__depth = d;
    (node.children || []).forEach((c) => markDepth(c, d + 1));
  }

  function markHasChildrenOriginal(node) {
    node.__hasChildrenOriginal = Array.isArray(node.children) && node.children.length > 0;
    (node.children || []).forEach(markHasChildrenOriginal);
  }

  function applyCollapse(node) {
    const hasChildrenNow = Array.isArray(node.children) && node.children.length > 0;
    const hasSaved = Array.isArray(node.__savedChildren) && node.__savedChildren.length > 0;

    if (!collapsedKeys.has(node.__stableKey) && !hasChildrenNow && hasSaved) {
      node.children = node.__savedChildren;
      node.__savedChildren = null;
    }

    if (collapsedKeys.has(node.__stableKey) && hasChildrenNow) {
      node.__savedChildren = node.children;
      node.children = [];
    }

    (node.children || []).forEach(applyCollapse);
  }

  function makeNode(type, stableKeyValue, title, raw) {
    const r = raw || {};
    const { k1, k2 } = keyAttrs(type, r);
    return {
      __type: type,
      __stableKey: stableKeyValue,
      __title: title || stableKeyValue,
      __raw: r,
      __k1: k1,
      __k2: k2,
      children: [],
      __depth: 0,
      __hasChildrenOriginal: false,
      __savedChildren: null,
    };
  }

  function keyAttrs(type, r) {
    if (type === "GLOBAL_CUSTOMER" || type === "CUSTOMER") {
      return {
        k1: `mdmCustomerId: ${r.mdmCustomerId || "—"}`,
        k2: `${r.customerType || "—"} · ${(r.countryOfRegistration || r.country || "—")}`,
      };
    }
    if (type === "ACCOUNT") {
      const roles = (r.businessRoles || []).join(", ");
      return { k1: `roles: ${roles || "—"}`, k2: `channel: ${r.salesChannel || "—"}` };
    }
    if (type === "CONTRACT") return { k1: `contractId: ${r.contractId || "—"}`, k2: `start: ${r.startDate || "—"}` };
    if (type === "BILLING") return { k1: `currency: ${r.billingCurrency || "—"}`, k2: `delivery: ${r.invoiceDelivery || "—"}` };
    if (type === "ADDRESS") return { k1: `${r.addressType || "ADDRESS"} · ${r.city || "—"}`, k2: `${r.country || "—"} · ${r.postalcode || "—"}` };
    if (type === "CONTACT") {
      const name = `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—";
      return { k1: name, k2: `${r.jobTitle || "—"}` };
    }
    if (type === "PLATFORM") return { k1: `${r.type || "—"}`, k2: `${r.provider || "—"}` };
    return { k1: "", k2: "" };
  }

  function walk(node, fn) {
    fn(node);
    (node.children || []).forEach((c) => walk(c, fn));
    if (node.__savedChildren) node.__savedChildren.forEach((c) => walk(c, fn));
  }

  // ---------- inspector ----------
  function setSelectedObject(raw, scenario, typeHint) {
    const obj = raw || (scenario ? scenario.customer : null) || {};

    const ct = obj.customerType || scenario?.customer?.customerType || "—";
    const ind = obj.industrySector || scenario?.customer?.industrySector || "—";
    const ch = obj.salesChannel || pickDominantChannel(scenario) || "—";

    renderClassificationPills(ct, ind, ch);
    renderBusinessMeaning(ct, ind, ch);

    els.objectSummary.innerHTML = "";
    buildSummaryPairs(obj, typeHint).forEach(([k, v]) => els.objectSummary.appendChild(kvRow(k, v)));

    els.readableJson.innerHTML = "";
    els.readableJson.appendChild(buildReadable(obj));
    els.rawJson.textContent = JSON.stringify(obj, null, 2);
  }

  function renderClassificationPills(customerType, industry, channel) {
    els.classificationPills.innerHTML = "";
    els.classificationPills.appendChild(pill(`customerType: ${customerType || "—"}`));
    els.classificationPills.appendChild(pill(`industry: ${industry || "—"}`));
    els.classificationPills.appendChild(pill(`channel: ${channel || "—"}`));
  }

  function renderBusinessMeaning(customerType, industry, channel) {
    const parts = [];
    parts.push(`<b>Customer Type:</b> ${escapeHtml(customerType || "—")}<br/>`);
    parts.push(`<b>Sales Channel:</b> ${escapeHtml(channel || "—")}<br/>`);
    parts.push(`<b>Industry:</b> ${escapeHtml(industry || "—")}<br/><br/>`);

    const def = channelDefinitions[channel];
    if (def) {
      parts.push(`<b>${escapeHtml(def.title)}</b><br/>`);
      parts.push(`${escapeHtml(def.definition)}<br/><br/>`);
      parts.push(`<b>Primary contact:</b> ${escapeHtml(def.primaryContact)}<br/>`);
    } else {
      parts.push(`No standard channel definition found for <b>${escapeHtml(channel || "—")}</b>.`);
    }
    els.meaningBox.innerHTML = parts.join("");
  }

  function kvRow(k, v) {
    const row = document.createElement("div");
    row.className = "kv-row";
    const kk = document.createElement("div");
    kk.className = "kv-k";
    kk.textContent = k;
    const vv = document.createElement("div");
    vv.className = "kv-v";
    vv.textContent = v == null ? "—" : String(v);
    row.appendChild(kk);
    row.appendChild(vv);
    return row;
  }

  function pill(text) {
    const p = document.createElement("span");
    p.className = "pill";
    p.textContent = text;
    return p;
  }

  function buildSummaryPairs(obj, typeHint) {
    const pairs = [];
    const type = typeHint || guessType(obj);
    pairs.push(["Object type", type || "—"]);
    if (obj.mdmCustomerId) pairs.push(["mdmCustomerId", obj.mdmCustomerId]);
    if (obj.mdmAccountId) pairs.push(["mdmAccountId", obj.mdmAccountId]);
    if (obj.contractId) pairs.push(["contractId", obj.contractId]);
    if (obj.billingProfileId) pairs.push(["billingProfileId", obj.billingProfileId]);
    if (obj.addressId) pairs.push(["addressId", obj.addressId]);
    if (obj.contactPersonId) pairs.push(["contactPersonId", obj.contactPersonId]);
    if (obj.platformId) pairs.push(["platformId", obj.platformId]);

    if (obj.officialName) pairs.push(["officialName", obj.officialName]);
    if (obj.tradingName) pairs.push(["tradingName", obj.tradingName]);
    if (obj.customerType) pairs.push(["customerType", obj.customerType]);
    if (obj.industrySector) pairs.push(["industrySector", obj.industrySector]);
    if (obj.salesChannel) pairs.push(["salesChannel", obj.salesChannel]);
    if (obj.businessRoles) pairs.push(["roles", obj.businessRoles.join(", ")]);
    if (obj.countryOfRegistration || obj.country) pairs.push(["country", obj.countryOfRegistration || obj.country]);
    return pairs.slice(0, 14);
  }

  function guessType(obj) {
    if (obj.mdmAccountId) return "ACCOUNT";
    if (obj.mdmCustomerId) return "CUSTOMER";
    if (obj.contractId) return "CONTRACT";
    if (obj.billingProfileId) return "BILLING";
    if (obj.addressId) return "ADDRESS";
    if (obj.contactPersonId) return "CONTACT";
    if (obj.platformId) return "PLATFORM";
    return "OBJECT";
  }

  function buildReadable(obj) {
    const wrap = document.createElement("div");
    wrap.appendChild(section("Classification", [
      ["customerType", obj.customerType],
      ["customerLevel", obj.customerLevel],
      ["industrySector", obj.industrySector],
      ["salesChannel", obj.salesChannel],
      ["country", obj.countryOfRegistration || obj.country],
    ]));
    wrap.appendChild(section("Identifiers", [
      ["mdmCustomerId", obj.mdmCustomerId],
      ["mdmAccountId", obj.mdmAccountId],
      ["contractId", obj.contractId],
      ["billingProfileId", obj.billingProfileId],
      ["addressId", obj.addressId],
      ["contactPersonId", obj.contactPersonId],
      ["platformId", obj.platformId],
    ]));
    wrap.appendChild(section("Names / Labels", [
      ["officialName", obj.officialName],
      ["tradingName", obj.tradingName],
      ["contractName", obj.contractName],
      ["billingAccountNumber", obj.billingAccountNumber],
      ["city", obj.city],
      ["jobTitle", obj.jobTitle],
      ["name", obj.name],
    ]));

    if (Array.isArray(obj.communicationChannels)) {
      const items = obj.communicationChannels.map((c) => [c.type, c.value]);
      wrap.appendChild(section("Communication channels", items));
    }
    return wrap;
  }

  function section(title, pairs) {
    const sec = document.createElement("div");
    sec.className = "section";
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = title;
    sec.appendChild(h);

    (pairs || [])
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .forEach(([k, v]) => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `<b>${escapeHtml(k)}</b>: ${escapeHtml(String(v))}`;
        sec.appendChild(item);
      });

    if (!sec.querySelector(".item")) {
      const empty = document.createElement("div");
      empty.className = "item";
      empty.innerHTML = `<b>—</b>: (no data)`;
      sec.appendChild(empty);
    }
    return sec;
  }

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[m]));
  }

  // ---------- Tooltip ----------
  function showTooltip(event, nodeData) {
    const raw = nodeData.__raw || {};
    tooltip.style("opacity", 1);

    const rows = buildTooltipRows(raw, nodeData.__type);
    tooltip.html(`
      <h4>${escapeHtml(nodeData.__type)} · ${escapeHtml(nodeData.__title || "")}</h4>
      ${rows.map((r) => `<div class="trow"><div class="tkey">${escapeHtml(r[0])}</div><div class="tval">${escapeHtml(r[1])}</div></div>`).join("")}
    `);

    const bounds = els.viz.getBoundingClientRect();
    const x = event.clientX - bounds.left + 12;
    const y = event.clientY - bounds.top + 12;
    tooltip.style("left", `${x}px`).style("top", `${y}px`);
  }

  function hideTooltip() { tooltip.style("opacity", 0); }

  function buildTooltipRows(raw, type) {
    const out = [];
    const push = (k, v) => {
      if (v == null) return;
      const s = String(v);
      if (!s.trim()) return;
      out.push([k, s]);
    };

    if (type === "CUSTOMER" || type === "GLOBAL_CUSTOMER") {
      push("mdmCustomerId", raw.mdmCustomerId);
      push("officialName", raw.officialName);
      push("tradingName", raw.tradingName);
      push("customerType", raw.customerType);
      push("industrySector", raw.industrySector);
      push("countryOfRegistration", raw.countryOfRegistration);
      push("globalGroupCode", raw.globalGroupCode);
    } else if (type === "ACCOUNT") {
      push("mdmAccountId", raw.mdmAccountId);
      push("roles", (raw.businessRoles || []).join(", "));
      push("salesChannel", raw.salesChannel);
      push("currency", raw.currency);
      push("paymentTerms", raw.paymentTerms);
    } else if (type === "CONTRACT") {
      push("contractId", raw.contractId);
      push("contractName", raw.contractName);
      push("startDate", raw.startDate);
      if (raw.contractDetail?.contractType) push("contractType", raw.contractDetail.contractType);
      if (raw.contractDetail?.services) push("services", raw.contractDetail.services.join(", "));
    } else if (type === "BILLING") {
      push("billingProfileId", raw.billingProfileId);
      push("billingAccountNumber", raw.billingAccountNumber);
      push("billingCurrency", raw.billingCurrency);
      push("invoiceDelivery", raw.invoiceDelivery);
      if (raw.paymentMethod?.type) push("paymentMethod", raw.paymentMethod.type);
    } else if (type === "ADDRESS") {
      push("addressId", raw.addressId);
      push("addressType", raw.addressType);
      push("street", `${raw.street || ""} ${raw.houseNumber || ""}`.trim());
      push("city", raw.city);
      push("postalcode", raw.postalcode);
      push("country", raw.country);
    } else if (type === "CONTACT") {
      push("contactPersonId", raw.contactPersonId);
      push("name", `${raw.firstName || ""} ${raw.lastName || ""}`.trim());
      push("jobTitle", raw.jobTitle);
      if (Array.isArray(raw.communicationChannels)) raw.communicationChannels.forEach((c) => push(c.type, c.value));
    } else if (type === "PLATFORM") {
      push("platformId", raw.platformId);
      push("name", raw.name);
      push("type", raw.type);
      push("provider", raw.provider);
    }
    return out.slice(0, 18);
  }

  // ---------- SVG text truncation helpers ----------
  function shouldMiddleTruncate(str) {
    const s = String(str || "");
    return (s.includes("CUST-") || s.includes("ACC-") || s.includes("CON-") || s.includes("BPROF-") || s.includes("PLT-") || s.includes("mdm"));
  }

  function truncateSvgTextToWidth(textNode, maxPx, middle = false) {
    if (!textNode) return;
    const full = (textNode.textContent || "").trim();
    if (!full) return;
    try { if (textNode.getComputedTextLength() <= maxPx) return; } catch (_) { return; }

    const ell = "…";
    const minKeep = 6;
    const setText = (s) => { textNode.textContent = s; };

    if (!middle) {
      let lo = 0, hi = full.length, best = "";
      while (lo <= hi) {
        const midLen = (lo + hi) >> 1;
        const candidate = full.slice(0, Math.max(0, midLen)) + ell;
        setText(candidate);
        const w = textNode.getComputedTextLength();
        if (w <= maxPx) { best = candidate; lo = midLen + 1; }
        else hi = midLen - 1;
      }
      setText(best || (full.slice(0, Math.max(0, minKeep)) + ell));
      return;
    }

    let leftKeep = Math.max(minKeep, Math.floor(full.length / 2) - 1);
    let rightKeep = Math.max(minKeep, Math.floor(full.length / 2) - 1);

    const makeMid = (l, r) => full.slice(0, Math.max(0, l)) + ell + full.slice(Math.max(0, full.length - r));
    let candidate = makeMid(leftKeep, rightKeep);
    setText(candidate);

    let guard = 0;
    while (guard++ < 80 && textNode.getComputedTextLength() > maxPx && (leftKeep + rightKeep) > (minKeep * 2)) {
      if (leftKeep > rightKeep) leftKeep -= 1;
      else rightKeep -= 1;
      candidate = makeMid(leftKeep, rightKeep);
      setText(candidate);
    }

    if (textNode.getComputedTextLength() > maxPx) {
      setText(full);
      truncateSvgTextToWidth(textNode, maxPx, false);
    }
  }
})();