import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import modelsRouter from "./models";
import proxyRouter from "./proxy";
import accessKeysRouter from "./access-keys";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(proxyRouter);
router.use(requireAuth, profilesRouter);
router.use(requireAuth, modelsRouter);
router.use(requireAuth, accessKeysRouter);

export default router;
