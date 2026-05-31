import { buildApp } from "./app.js";

const app = await buildApp();
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

await app.listen({ port, host });

