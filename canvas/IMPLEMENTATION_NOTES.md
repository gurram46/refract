# Canvas Implementation Notes

All canvas runner phases must follow these specifications.

## postMessage Protocol

Commands from parent to iframe:

```js
{ type: "play" }
{ type: "pause" }
{ type: "nextStep" }
{ type: "prevStep" }
{ type: "setSpeed", value: 2 }
{ type: "exportPNG" }
```

Responses from iframe to parent:

```js
{ type: "ready" }
{ type: "error", message: string, stack: string }
{ type: "stepComplete", index: number, total: number }
{ type: "pngData", dataUrl: string }
```

## Iframe Output Structure

The iframe renders into a div, not directly into a canvas:

```html
<div id="output">
  <canvas id="refract-canvas"></canvas>
  <svg id="refract-svg"></svg>
</div>
```

- `c.p5()` and `c.raw()` draw to `#refract-canvas`.
- `c.d3()` draws to `#refract-svg`.
- `c.render()` shows whichever renderer was used.
- Canvas and SVG preserve original dimensions but visually scale to fit container width.

## Sandbox Controller State

- `CanvasPanel` owns the active sandbox controller in `useRef`.
- `AnimationControls` receives the controller ref as a prop.
- Controller is replaced whenever a new block executes.
- Controls are disabled when `controllerRef.current` is null.
- Do not put the controller object itself in React state.

## Export PNG

- Keep iframe sandbox as `sandbox="allow-scripts"`.
- Do not add `allow-same-origin`.
- Export happens inside the iframe.
- Iframe reads its own canvas with `toDataURL("image/png")`.
- Iframe sends `{ type: "pngData", dataUrl }` to parent.
- Parent receives `pngData` and triggers download.

## Multiple Blocks UI

- Show numbered tab buttons above the canvas panel: `Block 1 | Block 2 | Block 3`.
- Active tab uses accent color.
- Selecting a tab executes that block and replaces the controller.

## Monaco Loading

- Textarea is default.
- Monaco loads only after the user clicks a `Code Editor` toggle.
- Do not import Monaco eagerly in the main bundle.
- Use dynamic import or lazy component loading.

## Canvas Scaling

- The iframe output scales to fit available width.
- Preserve original model dimensions from `new RefractCanvas(width, height)`.
- Use CSS scaling on the output wrapper, not by mutating canvas dimensions.
- Maintain aspect ratio.
- No horizontal overflow on mobile.

## Drawing Specs

### queue(config)

- Rectangle width: `80px`
- Rectangle height: `50px`
- Gap: `4px`
- Items drawn left to right
- FRONT label below leftmost box
- BACK label below rightmost box
- Box fill: `theme.accent` at 20% opacity
- Box stroke: `theme.accent`
- Text: `theme.fg`, centered
- If item count is greater than 8, show first 3, ellipsis box, last 3
- Ellipsis box label: `...`

### stack(config)

- Rectangle width: `120px`
- Rectangle height: `44px`
- Gap: `4px`
- Items drawn bottom to top
- Top item gets `TOP` label on the right
- Bottom item gets `BOTTOM` label on the right
- Box fill: `theme.accent` at 20% opacity
- Box stroke: `theme.accent`
- Text centered
- If item count is greater than `maxHeight`, show top visible items and an ellipsis box near the bottom

### tree(config)

- BFS from root node
- Root is the first node with no incoming edge; fallback to first node
- Level 0: `x = width / 2`, `y = 60`
- Each level increases `y` by `80`
- Nodes at same level evenly spaced across width with `20px` padding
- Edges are straight lines from parent center-bottom to child center-top
- Node circle radius: `24`
- Fill: `theme.accent` at 20% opacity
- Stroke: `theme.accent`
- Label centered in circle
- Max nodes: 31, max depth: 5
- If exceeded, render first supported subset and add warning caption

### graph(config)

- Nodes use provided `{ x, y }` when present
- Missing positions are arranged in a circle around center
- Node circle radius: `24`
- Directed edges draw arrowheads
- Undirected edges draw plain lines
- Edge labels appear at midpoint
- Node labels centered
- Use curved edges only if `edge.curved === true`

### grid(config)

- Cell size defaults to `44px`
- Max visible rows/cols scale down to fit canvas
- Stroke: `rgba(255,255,255,0.18)`
- Highlight cells accept `{ row, col, color, label }`
- Highlight fill defaults to accent at 30% opacity
- Row and column indices are not shown unless `showIndices: true`

### table(config)

- Column width: `100px`
- Row height: `42px`
- Header row uses accent at 25% opacity
- Cell stroke: `rgba(255,255,255,0.18)`
- Text centered
- Highlight accepts `{ row, col, color }`
- If too wide, scale table down to fit canvas width

### plot(config)

- Draws axes and numeric points for ML/data/math concepts.
- Accepts `points: [{ x, y, color, r }]`.
- Accepts optional `xRange`, `yRange`, `xLabel`, `yLabel`, `line`, and `color`.
- Draws connected line unless `line: false`.
- Points are mapped into the plot area without mutating the original values.

### neuralNetwork(config)

- Draws model architecture diagrams for ML concepts.
- Accepts `layers: [inputCount, hiddenCount, outputCount]`.
- Accepts optional `labels` and `layerLabels`.
- Layers are evenly spaced left to right.
- Nodes are evenly spaced vertically within each layer.
- Adjacent layers are fully connected with low-contrast edges.

### timeline(config)

- Draws ordered conceptual stages for pipelines, learning flows, training loops, and system lifecycles.
- Accepts `steps: []`.
- Accepts optional `active` index.
- Active step is larger and uses success color.
