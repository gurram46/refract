import { createApp } from "./app.js";

const PORT = Number(process.env.REFRACT_BACKEND_PORT || 8787);
const app = createApp();

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Refract backend listening on http://127.0.0.1:${PORT}`);
});
