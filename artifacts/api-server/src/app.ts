import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import v1Router from "./routes/v1";
import { logger } from "./lib/logger";
import { attachUser } from "./middlewares/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);

app.use("/api", router);
app.use("/", v1Router);

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use(
  "/api",
  (err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, "Unhandled API error");
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || "Internal server error" });
  },
);

export default app;
