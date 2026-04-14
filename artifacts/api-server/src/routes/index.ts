import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import proxyRouter from "./proxy";
import accessKeysRouter from "./access-keys";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(proxyRouter);
router.use(accessKeysRouter);

export default router;
