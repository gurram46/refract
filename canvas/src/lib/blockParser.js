export function parseBlocks(text) {
  const source = String(text || "");
  const blocks = [];
  const errors = [];
  const fencePattern = /```refract-canvas[ \t]*\r?\n([\s\S]*?)```/g;
  let match;
  let index = 0;

  while ((match = fencePattern.exec(source)) !== null) {
    blocks.push({
      index,
      code: match[1].trim(),
      rawBlock: match[0]
    });
    index += 1;
  }

  const openFences = (source.match(/```refract-canvas/g) || []).length;
  if (openFences > blocks.length) {
    errors.push("A refract-canvas block is missing its closing fence.");
  }

  if (!blocks.length && source.trim()) {
    blocks.push({
      index: 0,
      code: source.trim(),
      rawBlock: source.trim()
    });
  }

  return { blocks, errors };
}
