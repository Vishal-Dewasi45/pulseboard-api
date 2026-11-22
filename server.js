import dns from "dns";
import "dotenv/config";
import express from "express"
import  mongoose from "mongoose"
import authRoute from "./routes/authRoute.js"
import workspaceRoute from "./routes/workspaceRoute.js"
import projectRoute from "./routes/projectRoute.js"
import taskRoute from "./routes/taskRoute.js"
import dashboardRoute from "./routes/dashboardRoute.js";
import activityRoute from "./routes/activityRoute.js"
import searchRoute from "./routes/searchRoute.js"
import notificationRoutes from "./routes/notificationRoute.js";
import invitationRoute from "./routes/inivitationRoute.js";
import errorHandler from "./middleware/errorHandler.js";
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { initSocket } from "./socket.js";


const isProd = process.env.NODE_ENV === "production";

if (!isProd) dns.setServers(["8.8.8.8"]); 

const origins = (process.env.CLIENT_URLS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: origins, credentials: true }));
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 600 : 5000,
  skip: (req) => req.path === "/api/auth/refresh" || req.path === "/health",
  message: { success: false, message: "Too many requests. Please try later." },
});
app.use(limiter);

app.get("/", (req, res) => res.send("PulseBoard API is running"));
app.get("/health", (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "db-down" });
});

app.use("/api/auth",authRoute)
app.use("/api/workspace",workspaceRoute)
app.use("/api/project",projectRoute)
app.use("/api/task",taskRoute)
app.use("/api/dashboard",dashboardRoute)
app.use("/api/workspace",searchRoute)
app.use("/api/activity",activityRoute)
app.use("/api/notifications",notificationRoutes)
app.use("/api/invitations",invitationRoute)
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler)

const httpServer = createServer(app);
initSocket(httpServer);
const PORT = process.env.PORT || 5000;

try {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("MongoDB connected");
} catch (error) {
  console.error("MongoDB connection failed:", error.message);
  process.exit(1);
}

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
