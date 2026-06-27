export class RefractCanvas {
  constructor(width = 600, height = 400) {
    this.width = width;
    this.height = height;
    this.steps = [];
    this.currentStep = 0;
    this.speed = 1;
    this.themeConfig = {
      bg: "#0a0a0a",
      fg: "#ffffff",
      muted: "#a1a1aa",
      accent: "#f59e0b",
      danger: "#ef4444",
      success: "#22c55e"
    };
    this.elements = new Map();
    this.drawOps = [];
    this.captionText = "";
    this.mode = "canvas";
    this.customP5 = null;
    this.customD3 = null;
    this.customRaw = null;
    this.canvas = null;
    this.svg = null;
    this.ctx = null;
    this.timer = null;
    this.raf = null;
    this.isPlaying = false;
    this.stepStartedAt = 0;
    this.stepDuration = 900;
    this.layouts = {};
  }

  theme(config = {}) {
    this.themeConfig = { ...this.themeConfig, ...config };
    return this;
  }

  queue(config = {}) {
    this.drawOps.push((ctx) => this.drawQueue(ctx, config));
    return this;
  }

  stack(config = {}) {
    this.drawOps.push((ctx) => this.drawStack(ctx, config));
    return this;
  }

  tree(config = {}) {
    this.drawOps.push((ctx) => this.drawTree(ctx, config));
    return this;
  }

  graph(config = {}) {
    this.drawOps.push((ctx) => this.drawGraph(ctx, config));
    return this;
  }

  grid(config = {}) {
    this.drawOps.push((ctx) => this.drawGrid(ctx, config));
    return this;
  }

  table(config = {}) {
    this.drawOps.push((ctx) => this.drawTable(ctx, config));
    return this;
  }

  plot(config = {}) {
    this.drawOps.push((ctx) => this.drawPlot(ctx, config));
    return this;
  }

  neuralNetwork(config = {}) {
    this.drawOps.push((ctx) => this.drawNeuralNetwork(ctx, config));
    return this;
  }

  timeline(config = {}) {
    this.drawOps.push((ctx) => this.drawTimeline(ctx, config));
    return this;
  }

  box(x, y, w, h, options = {}) {
    this.drawOps.push((ctx) => this.drawBox(ctx, x, y, w, h, options));
    return this;
  }

  circle(x, y, r, options = {}) {
    this.drawOps.push((ctx) => this.drawCircle(ctx, x, y, r, options));
    return this;
  }

  arrow(from, to, options = {}) {
    this.drawOps.push((ctx) => this.drawArrow(ctx, this.resolvePoint(from), this.resolvePoint(to), options));
    return this;
  }

  label(x, y, text, options = {}) {
    this.drawOps.push((ctx) => this.drawText(ctx, String(text), x, y, options));
    return this;
  }

  connector(fromId, toId, options = {}) {
    return this.arrow(fromId, toId, options);
  }

  highlight(targetId, color) {
    const element = this.elements.get(targetId);
    if (!element) return this;
    this.drawOps.push((ctx) => {
      ctx.save();
      ctx.strokeStyle = color || this.themeConfig.accent;
      ctx.lineWidth = 4;
      if (element.kind === "circle") {
        ctx.beginPath();
        ctx.arc(element.x, element.y, element.r + 5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(element.x - 4, element.y - 4, element.w + 8, element.h + 8);
      }
      ctx.restore();
    });
    return this;
  }

  caption(text) {
    this.captionText = String(text || "");
    return this;
  }

  animate(steps = []) {
    this.steps = Array.isArray(steps) ? steps : [];
    this.currentStep = 0;
    return this;
  }

  step(caption, drawFn) {
    this.steps.push({ action: "custom", caption, fn: drawFn });
    return this;
  }

  p5(sketchFn) {
    this.mode = "p5";
    this.customP5 = sketchFn;
    return this;
  }

  d3(containerFn) {
    this.mode = "d3";
    this.customD3 = containerFn;
    return this;
  }

  raw(fn) {
    this.mode = "raw";
    this.customRaw = fn;
    return this;
  }

  render() {
    window.__refractCanvas = this;
    this.bindOutput();
    this.prepareSurface();

    if (this.mode === "p5" && this.customP5) {
      this.canvas.style.display = "block";
      this.svg.style.display = "none";
      if (typeof window.p5 === "function") {
        new window.p5(this.customP5, this.canvas.parentElement);
      } else {
        throw new Error("p5 is not loaded.");
      }
      this.drawCaptionOverlay();
      return this;
    }

    if (this.mode === "d3" && this.customD3) {
      this.canvas.style.display = "none";
      this.svg.style.display = "block";
      if (!window.d3) throw new Error("D3 is not loaded.");
      this.customD3(window.d3.select(this.svg), { width: this.width, height: this.height, theme: this.themeConfig });
      this.drawSvgCaption();
      return this;
    }

    this.canvas.style.display = "block";
    this.svg.style.display = "none";
    this.clear();
    if (this.mode === "raw" && this.customRaw) {
      this.customRaw(this.canvas, this.ctx, { width: this.width, height: this.height, theme: this.themeConfig });
    } else {
      this.drawOps.forEach((op) => op(this.ctx));
      this.drawCurrentStep();
    }
    this.drawCanvasCaption();
    this.postStep();
    return this;
  }

  play() {
    if (!this.steps.length) return;
    this.pause();
    if (this.currentStep === 0) this.currentStep = 1;
    this.isPlaying = true;
    this.stepStartedAt = performance.now();
    const tick = (now) => {
      if (!this.isPlaying) return;
      const duration = this.stepDuration / this.speed;
      if (now - this.stepStartedAt >= duration) {
        this.currentStep += 1;
        if (this.currentStep > this.steps.length) {
          this.currentStep = this.steps.length;
          this.pause();
        }
        this.stepStartedAt = now;
      }
      this.redraw();
      if (this.isPlaying) this.raf = window.requestAnimationFrame(tick);
    };
    this.raf = window.requestAnimationFrame(tick);
  }

  pause() {
    if (this.timer) window.clearInterval(this.timer);
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
    this.isPlaying = false;
  }

  nextStep() {
    if (!this.steps.length) return;
    this.currentStep = Math.min(this.currentStep + 1, this.steps.length);
    this.stepStartedAt = performance.now();
    this.redraw();
  }

  prevStep() {
    if (!this.steps.length) return;
    this.currentStep = Math.max(this.currentStep - 1, 0);
    this.stepStartedAt = performance.now();
    this.redraw();
  }

  setSpeed(multiplier) {
    const next = Number(multiplier);
    this.speed = Number.isFinite(next) && next > 0 ? next : 1;
    if (this.timer) this.play();
  }

  exportPNG() {
    const dataUrl = this.canvas ? this.canvas.toDataURL("image/png") : "";
    window.parent.postMessage({ type: "pngData", dataUrl }, "*");
    return dataUrl;
  }

  bindOutput() {
    this.canvas = document.getElementById("refract-canvas");
    this.svg = document.getElementById("refract-svg");
    if (!this.canvas || !this.svg) {
      throw new Error("Missing iframe output elements.");
    }
    this.ctx = this.canvas.getContext("2d");
  }

  prepareSurface() {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.svg.setAttribute("width", this.width);
    this.svg.setAttribute("height", this.height);
    document.documentElement.style.setProperty("--refract-width", `${this.width}px`);
    document.documentElement.style.setProperty("--refract-height", `${this.height}px`);
  }

  redraw() {
    if (this.mode === "canvas") {
      this.clear();
      this.drawOps.forEach((op) => op(this.ctx));
      this.drawCurrentStep();
      this.drawCanvasCaption();
      this.postStep();
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = this.themeConfig.bg;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawQueue(ctx, config) {
    const rawItems = Array.isArray(config.items) ? config.items : [];
    const items = rawItems.length > 8 ? [...rawItems.slice(0, 3), "...", ...rawItems.slice(-3)] : rawItems;
    const boxW = 80;
    const boxH = 50;
    const gap = 4;
    const totalW = items.length * boxW + Math.max(0, items.length - 1) * gap;
    const startX = (this.width - totalW) / 2;
    const y = this.height / 2 - boxH / 2 - 18;
    this.layouts.queue = { items, boxW, boxH, gap, startX, y, totalW };

    items.forEach((item, index) => {
      const x = startX + index * (boxW + gap);
      this.drawBox(ctx, x, y, boxW, boxH, { label: item, id: `queue-${index}` });
    });

    if (items.length) {
      const left = config.labels?.left || "FRONT";
      const right = config.labels?.right || "BACK";
      this.drawText(ctx, left, startX + boxW / 2, y + boxH + 26, { color: this.themeConfig.muted, size: 12 });
      this.drawText(ctx, right, startX + totalW - boxW / 2, y + boxH + 26, { color: this.themeConfig.muted, size: 12 });
    }
  }

  drawStack(ctx, config) {
    const rawItems = Array.isArray(config.items) ? config.items : [];
    const maxHeight = Number(config.maxHeight) || 6;
    const visible = rawItems.length > maxHeight
      ? ["...", ...rawItems.slice(-(maxHeight - 1))]
      : rawItems;
    const boxW = 120;
    const boxH = 44;
    const gap = 4;
    const totalH = visible.length * boxH + Math.max(0, visible.length - 1) * gap;
    const x = this.width / 2 - boxW / 2;
    const bottomY = this.height / 2 + totalH / 2;
    this.layouts.stack = { items: visible, boxW, boxH, gap, x, bottomY, totalH };

    visible.forEach((item, index) => {
      const y = bottomY - (index + 1) * boxH - index * gap;
      this.drawBox(ctx, x, y, boxW, boxH, { label: item, id: `stack-${index}` });
    });

    if (visible.length) {
      this.drawText(ctx, "TOP", x + boxW + 42, bottomY - visible.length * boxH - (visible.length - 1) * gap + boxH / 2, {
        color: this.themeConfig.muted,
        size: 12
      });
      this.drawText(ctx, "BOTTOM", x + boxW + 54, bottomY - boxH / 2, {
        color: this.themeConfig.muted,
        size: 12
      });
    }
  }

  drawTree(ctx, config) {
    const nodes = Array.isArray(config.nodes) ? config.nodes.slice(0, 31) : [];
    const edges = Array.isArray(config.edges) ? config.edges : [];
    if (!nodes.length) return;

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Set(edges.map((edge) => edge.to));
    const root = nodes.find((node) => !incoming.has(node.id)) || nodes[0];
    const children = new Map();
    edges.forEach((edge) => {
      if (!children.has(edge.from)) children.set(edge.from, []);
      if (nodeById.has(edge.to)) children.get(edge.from).push(edge.to);
    });

    const levels = [];
    const queue = [{ id: root.id, level: 0 }];
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current.id) || current.level > 4) continue;
      seen.add(current.id);
      if (!levels[current.level]) levels[current.level] = [];
      levels[current.level].push(current.id);
      (children.get(current.id) || []).forEach((child) => queue.push({ id: child, level: current.level + 1 }));
    }

    const positions = new Map();
    levels.forEach((ids, level) => {
      const y = 60 + level * 80;
      ids.forEach((id, index) => {
        const x = ids.length === 1 ? this.width / 2 : 20 + ((this.width - 40) * (index + 1)) / (ids.length + 1);
        positions.set(id, { x, y });
      });
    });

    edges.forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (from && to) this.drawLine(ctx, { x: from.x, y: from.y + 24 }, { x: to.x, y: to.y - 24 });
    });

    positions.forEach((point, id) => {
      const node = nodeById.get(id);
      this.drawCircle(ctx, point.x, point.y, 24, { label: node.label || id, id });
    });

    if (config.nodes?.length > 31 || levels.length > 5) {
      this.caption("Tree trimmed to 31 nodes / 5 levels for readability");
    }
  }

  drawGraph(ctx, config) {
    const nodes = Array.isArray(config.nodes) ? config.nodes : [];
    const edges = Array.isArray(config.edges) ? config.edges : [];
    const positions = new Map();
    const center = { x: this.width / 2, y: this.height / 2 };
    const radius = Math.min(this.width, this.height) * 0.32;

    nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) - Math.PI / 2;
      positions.set(node.id, {
        x: Number.isFinite(node.x) ? node.x : center.x + Math.cos(angle) * radius,
        y: Number.isFinite(node.y) ? node.y : center.y + Math.sin(angle) * radius,
        label: node.label || node.id
      });
    });

    edges.forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return;
      this.drawArrow(ctx, from, to, { directed: edge.directed, label: edge.label, curved: edge.curved });
    });

    positions.forEach((point, id) => this.drawCircle(ctx, point.x, point.y, 24, { label: point.label, id }));
  }

  drawGrid(ctx, config) {
    const rows = Number(config.rows) || 0;
    const cols = Number(config.cols) || 0;
    if (!rows || !cols) return;
    const cell = Math.min(44, Math.floor((this.width - 40) / cols), Math.floor((this.height - 80) / rows));
    const startX = (this.width - cols * cell) / 2;
    const startY = (this.height - rows * cell) / 2 - 10;
    const highlights = new Map((config.highlight || []).map((h) => [`${h.row}:${h.col}`, h]));

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const h = highlights.get(`${row}:${col}`);
        const x = startX + col * cell;
        const y = startY + row * cell;
        ctx.fillStyle = h ? this.alpha(h.color || this.themeConfig.accent, 0.3) : this.themeConfig.bg;
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeRect(x, y, cell, cell);
        if (h?.label) this.drawText(ctx, h.label, x + cell / 2, y + cell / 2, { size: 12 });
        if (config.showIndices) this.drawText(ctx, `${row},${col}`, x + cell / 2, y + cell / 2, { size: 10, color: this.themeConfig.muted });
      }
    }
  }

  drawTable(ctx, config) {
    const headers = Array.isArray(config.headers) ? config.headers : [];
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const colCount = Math.max(headers.length, ...rows.map((row) => row.length));
    if (!colCount) return;
    const baseColW = 100;
    const rowH = 42;
    const scale = Math.min(1, (this.width - 40) / (colCount * baseColW));
    const colW = baseColW * scale;
    const totalW = colCount * colW;
    const startX = (this.width - totalW) / 2;
    const startY = 54;
    const highlights = new Map((config.highlight || []).map((h) => [`${h.row}:${h.col}`, h]));

    const drawCell = (value, row, col, isHeader) => {
      const x = startX + col * colW;
      const y = startY + row * rowH;
      const h = highlights.get(`${row - 1}:${col}`);
      ctx.fillStyle = h ? this.alpha(h.color || this.themeConfig.accent, 0.35) : isHeader ? this.alpha(this.themeConfig.accent, 0.25) : this.themeConfig.bg;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, colW, rowH);
      ctx.strokeRect(x, y, colW, rowH);
      this.drawText(ctx, String(value ?? ""), x + colW / 2, y + rowH / 2, { size: scale < 0.8 ? 11 : 12 });
    };

    headers.forEach((header, col) => drawCell(header, 0, col, true));
    rows.forEach((row, rowIndex) => {
      for (let col = 0; col < colCount; col += 1) drawCell(row[col], rowIndex + 1, col, false);
    });
  }

  drawPlot(ctx, config) {
    const points = Array.isArray(config.points) ? config.points : [];
    const x = Number(config.x) || 58;
    const y = Number(config.y) || 46;
    const w = Number(config.width) || this.width - 110;
    const h = Number(config.height) || this.height - 120;
    const xValues = points.map((point) => Number(point.x));
    const yValues = points.map((point) => Number(point.y));
    const xMin = config.xRange?.[0] ?? Math.min(...xValues, 0);
    const xMax = config.xRange?.[1] ?? Math.max(...xValues, 1);
    const yMin = config.yRange?.[0] ?? Math.min(...yValues, 0);
    const yMax = config.yRange?.[1] ?? Math.max(...yValues, 1);
    const mapX = (value) => x + ((value - xMin) / Math.max(1e-9, xMax - xMin)) * w;
    const mapY = (value) => y + h - ((value - yMin) / Math.max(1e-9, yMax - yMin)) * h;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    this.drawText(ctx, config.xLabel || "x", x + w / 2, y + h + 34, { color: this.themeConfig.muted, size: 12 });
    this.drawText(ctx, config.yLabel || "y", x - 28, y + h / 2, { color: this.themeConfig.muted, size: 12 });

    if (config.line !== false && points.length > 1) {
      ctx.strokeStyle = config.color || this.themeConfig.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point, index) => {
        const px = mapX(Number(point.x));
        const py = mapY(Number(point.y));
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    points.forEach((point) => {
      ctx.fillStyle = point.color || config.color || this.themeConfig.accent;
      ctx.beginPath();
      ctx.arc(mapX(Number(point.x)), mapY(Number(point.y)), Number(point.r) || 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawNeuralNetwork(ctx, config) {
    const layers = Array.isArray(config.layers) ? config.layers : [];
    if (!layers.length) return;
    const left = 70;
    const right = this.width - 70;
    const top = 62;
    const bottom = this.height - 88;
    const positions = [];

    layers.forEach((count, layerIndex) => {
      const safeCount = Math.max(1, Math.min(12, Number(count) || 1));
      const x = layers.length === 1 ? this.width / 2 : left + ((right - left) * layerIndex) / (layers.length - 1);
      const layer = [];
      for (let i = 0; i < safeCount; i += 1) {
        const y = safeCount === 1 ? (top + bottom) / 2 : top + ((bottom - top) * i) / (safeCount - 1);
        layer.push({ x, y });
      }
      positions.push(layer);
    });

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    for (let i = 0; i < positions.length - 1; i += 1) {
      positions[i].forEach((from) => {
        positions[i + 1].forEach((to) => this.drawLine(ctx, from, to));
      });
    }
    positions.forEach((layer, layerIndex) => {
      layer.forEach((node, nodeIndex) => {
        const label = config.labels?.[layerIndex]?.[nodeIndex] || "";
        this.drawCircle(ctx, node.x, node.y, 16, { label, id: `nn-${layerIndex}-${nodeIndex}` });
      });
    });
    const layerNames = config.layerLabels || ["Input", "Hidden", "Output"];
    positions.forEach((layer, index) => {
      this.drawText(ctx, layerNames[index] || `Layer ${index + 1}`, layer[0].x, this.height - 38, {
        color: this.themeConfig.muted,
        size: 12
      });
    });
    ctx.restore();
  }

  drawTimeline(ctx, config) {
    const steps = Array.isArray(config.steps) ? config.steps : [];
    if (!steps.length) return;
    const x = 60;
    const y = this.height / 2;
    const w = this.width - 120;
    const active = Number.isFinite(config.active) ? config.active : -1;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();

    steps.forEach((step, index) => {
      const px = steps.length === 1 ? x + w / 2 : x + (w * index) / (steps.length - 1);
      const isActive = index === active;
      this.drawCircle(ctx, px, y, isActive ? 18 : 13, {
        fill: this.alpha(isActive ? this.themeConfig.success : this.themeConfig.accent, isActive ? 0.35 : 0.2),
        label: String(index + 1)
      });
      this.drawText(ctx, String(step), px, y + 42, { color: this.themeConfig.fg, size: 12 });
    });
    ctx.restore();
  }

  drawBox(ctx, x, y, w, h, options = {}) {
    ctx.save();
    ctx.fillStyle = options.fill || this.alpha(this.themeConfig.accent, 0.2);
    ctx.strokeStyle = options.stroke || this.themeConfig.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    if (options.label !== undefined) {
      this.drawText(ctx, String(options.label), x + w / 2, y + h / 2, { color: options.color || this.themeConfig.fg, size: options.size || 13 });
    }
    if (options.id) this.elements.set(options.id, { kind: "box", x, y, w, h });
    ctx.restore();
  }

  drawCircle(ctx, x, y, r, options = {}) {
    ctx.save();
    ctx.fillStyle = options.fill || this.alpha(this.themeConfig.accent, 0.2);
    ctx.strokeStyle = options.stroke || this.themeConfig.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (options.label !== undefined) this.drawText(ctx, String(options.label), x, y, { size: 12 });
    if (options.id) this.elements.set(options.id, { kind: "circle", x, y, r });
    ctx.restore();
  }

  drawLine(ctx, from, to) {
    ctx.save();
    ctx.strokeStyle = this.themeConfig.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawArrow(ctx, from, to, options = {}) {
    if (!from || !to) return;
    ctx.save();
    ctx.strokeStyle = options.color || this.themeConfig.muted;
    ctx.fillStyle = options.color || this.themeConfig.muted;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (options.curved) {
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 35;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(midX, midY, to.x, to.y);
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
    if (options.directed !== false) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const endX = to.x - Math.cos(angle) * 24;
      const endY = to.y - Math.sin(angle) * 24;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - Math.cos(angle - 0.5) * 10, endY - Math.sin(angle - 0.5) * 10);
      ctx.lineTo(endX - Math.cos(angle + 0.5) * 10, endY - Math.sin(angle + 0.5) * 10);
      ctx.closePath();
      ctx.fill();
    }
    if (options.label) this.drawText(ctx, options.label, (from.x + to.x) / 2, (from.y + to.y) / 2 - 8, { size: 11, color: this.themeConfig.muted });
    ctx.restore();
  }

  drawText(ctx, text, x, y, options = {}) {
    ctx.save();
    ctx.fillStyle = options.color || this.themeConfig.fg;
    ctx.font = `${options.weight || 600} ${options.size || 13}px Inter, system-ui, sans-serif`;
    ctx.textAlign = options.align || "center";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawCurrentStep() {
    if (!this.steps.length || this.currentStep === 0) return;
    const step = this.steps[this.currentStep - 1];
    const progress = this.isPlaying
      ? Math.min(1, Math.max(0, (performance.now() - this.stepStartedAt) / (this.stepDuration / this.speed)))
      : 1;
    if (typeof step.fn === "function") {
      step.fn(this.ctx, this, progress);
    } else {
      this.drawBuiltInStep(step, progress);
      if (step.caption) {
        this.drawText(this.ctx, step.caption, this.width / 2, this.height - 44, { color: this.themeConfig.accent, size: 14 });
      }
    }
  }

  drawBuiltInStep(step, progress) {
    if (step.action === "enqueue" && this.layouts.queue) {
      const layout = this.layouts.queue;
      const start = { x: this.width + 20, y: layout.y };
      const end = { x: layout.startX + layout.totalW + layout.gap, y: layout.y };
      const x = start.x + (end.x - start.x) * progress;
      this.drawBox(this.ctx, x, end.y, layout.boxW, layout.boxH, {
        label: step.item || "new",
        fill: this.alpha(this.themeConfig.success, 0.25),
        stroke: this.themeConfig.success
      });
    }

    if (step.action === "dequeue" && this.layouts.queue) {
      const layout = this.layouts.queue;
      const x = layout.startX - progress * 90;
      const y = layout.y - progress * 46;
      this.drawBox(this.ctx, x, y, layout.boxW, layout.boxH, {
        label: step.item || layout.items[0] || "front",
        fill: this.alpha(this.themeConfig.danger, 0.24),
        stroke: this.themeConfig.danger
      });
    }

    if (step.action === "push" && this.layouts.stack) {
      const layout = this.layouts.stack;
      const targetY = layout.bottomY - (layout.items.length + 1) * layout.boxH - layout.items.length * layout.gap;
      const y = -layout.boxH + (targetY + layout.boxH) * progress;
      this.drawBox(this.ctx, layout.x, y, layout.boxW, layout.boxH, {
        label: step.item || "new",
        fill: this.alpha(this.themeConfig.success, 0.25),
        stroke: this.themeConfig.success
      });
    }

    if (step.action === "pop" && this.layouts.stack) {
      const layout = this.layouts.stack;
      const topY = layout.bottomY - layout.items.length * layout.boxH - (layout.items.length - 1) * layout.gap;
      const x = layout.x + progress * 120;
      this.drawBox(this.ctx, x, topY, layout.boxW, layout.boxH, {
        label: step.item || layout.items[layout.items.length - 1] || "top",
        fill: this.alpha(this.themeConfig.danger, 0.24),
        stroke: this.themeConfig.danger
      });
    }
  }

  drawCanvasCaption() {
    if (!this.captionText) return;
    this.drawText(this.ctx, this.captionText, this.width / 2, this.height - 18, { color: this.themeConfig.fg, size: 14 });
  }

  drawSvgCaption() {
    if (!this.captionText || !window.d3) return;
    window.d3.select(this.svg)
      .append("text")
      .attr("x", this.width / 2)
      .attr("y", this.height - 18)
      .attr("text-anchor", "middle")
      .attr("fill", this.themeConfig.fg)
      .attr("font-size", 14)
      .attr("font-family", "Inter, system-ui, sans-serif")
      .text(this.captionText);
  }

  drawCaptionOverlay() {
    if (!this.captionText) return;
    const caption = document.createElement("div");
    caption.className = "refract-caption";
    caption.textContent = this.captionText;
    this.canvas.parentElement.appendChild(caption);
  }

  postStep() {
    window.parent.postMessage({ type: "stepComplete", index: this.currentStep, total: this.steps.length }, "*");
  }

  resolvePoint(input) {
    if (typeof input === "string") {
      const element = this.elements.get(input);
      if (!element) return null;
      return element.kind === "circle"
        ? { x: element.x, y: element.y }
        : { x: element.x + element.w / 2, y: element.y + element.h / 2 };
    }
    return input;
  }

  alpha(hex, amount) {
    if (!String(hex).startsWith("#") || hex.length !== 7) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${amount})`;
  }
}
