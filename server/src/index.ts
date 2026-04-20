import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socket/socketHandler";

// Prefer Next.js local env, then fallback to .env for non-Next contexts.
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Silence Chrome DevTools discovery probe
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.json({});
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

registerSocketHandlers(io);

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Prisma-backed chat monitoring will fail.");
}

const port = Number(process.env.SOCKET_PORT || 4001);
server.listen(port, () => {
  console.log(`Socket server listening on http://localhost:${port}`);
});
