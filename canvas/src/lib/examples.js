export const modelOutputExamples = [
  {
    title: "Queue",
    text: `A queue is a line with one rule: first in, first out. New work joins the back, and the worker always takes from the front.

\`\`\`refract-canvas
const c = new RefractCanvas(600, 300)

c.queue({
  items: ["Order 1", "Order 2", "Order 3", "Order 4"],
  labels: { left: "FRONT", right: "BACK" }
})

c.animate([
  { action: "enqueue", item: "Order 5", caption: "New order joins the back" },
  { action: "dequeue", caption: "Kitchen takes the front order first" }
])

c.caption("FIFO: first order placed is first order served")
c.render()
\`\`\`

Practice: add an expiry rule for orders older than 10 minutes.`
  },
  {
    title: "Stack",
    text: `A stack keeps the newest thing on top. Undo, browser history, and function calls all use this shape.

\`\`\`refract-canvas
const c = new RefractCanvas(500, 360)

c.stack({
  items: ["open file", "type text", "paste image", "format title"],
  maxHeight: 5
})

c.animate([
  { action: "push", item: "save draft", caption: "A new action lands on TOP" },
  { action: "pop", caption: "Undo removes the newest action first" }
])

c.caption("LIFO: last in, first out")
c.render()
\`\`\``
  },
  {
    title: "Service Graph",
    text: `A checkout request crosses multiple services. The graph shows which service depends on which other service.

\`\`\`refract-canvas
const c = new RefractCanvas(680, 380)

c.graph({
  nodes: [
    { id: "app", label: "App", x: 90, y: 180 },
    { id: "api", label: "API", x: 230, y: 180 },
    { id: "orders", label: "Orders", x: 390, y: 100 },
    { id: "payments", label: "Pay", x: 390, y: 260 },
    { id: "db", label: "DB", x: 560, y: 180 }
  ],
  edges: [
    { from: "app", to: "api", directed: true },
    { from: "api", to: "orders", directed: true },
    { from: "api", to: "payments", directed: true },
    { from: "orders", to: "db", directed: true },
    { from: "payments", to: "db", directed: true }
  ]
})

c.caption("A dependency graph makes the failure path visible")
c.render()
\`\`\``
  },
  {
    title: "Game Theory",
    text: `When every worker greedily chooses only nearby work, some jobs starve. This simulation marks that incentive problem.

\`\`\`refract-canvas
const c = new RefractCanvas(620, 360)

c.p5((sketch) => {
  const drivers = Array.from({ length: 8 }, (_, i) => ({
    x: 80 + i * 62,
    y: 70 + (i % 2) * 36
  }))
  const orders = Array.from({ length: 18 }, (_, i) => ({
    x: 60 + (i % 9) * 58,
    y: 210 + Math.floor(i / 9) * 54,
    far: i > 13
  }))

  sketch.setup = () => {
    sketch.createCanvas(620, 360, sketch.P2D, document.getElementById("refract-canvas"))
    sketch.textAlign(sketch.CENTER, sketch.CENTER)
  }

  sketch.draw = () => {
    sketch.background("#0a0a0a")
    sketch.fill("#ffffff")
    sketch.textSize(14)
    sketch.text("Selfish drivers pick nearest orders; far orders wait", 310, 28)

    orders.forEach((order) => {
      sketch.fill(order.far ? "#ef4444" : "#f59e0b")
      sketch.noStroke()
      sketch.circle(order.x, order.y, 14)
    })

    drivers.forEach((driver, i) => {
      const target = orders[i]
      sketch.stroke("#f59e0b")
      sketch.line(driver.x, driver.y, target.x, target.y)
      sketch.noStroke()
      sketch.fill("#22c55e")
      sketch.circle(driver.x, driver.y, 18)
    })
  }
})

c.caption("Bad incentives can starve some work even when workers are busy")
c.render()
\`\`\``
  },
  {
    title: "Payoff Table",
    text: `A retry policy is a game between clients and a shared backend. If every client retries aggressively, everyone loses.

\`\`\`refract-canvas
const c = new RefractCanvas(600, 340)

c.table({
  headers: ["Client rule", "Backend load", "Outcome"],
  rows: [
    ["Immediate retry", "High", "Outage grows"],
    ["Exponential backoff", "Medium", "System recovers"],
    ["Jittered backoff", "Low", "Fair recovery"]
  ],
  highlight: [{ row: 2, col: 2, color: "#22c55e" }]
})

c.caption("Changing the rule changes the group outcome")
c.render()
\`\`\``
  }
];
