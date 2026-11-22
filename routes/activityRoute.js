import express from "express";
import authMiddlewear from "../middleware/authMiddlewear.js"
import { getWorkspaceActivity } from "../Controller/actvityController.js";

const route= express.Router()

route.get("/:workspaceId",authMiddlewear,getWorkspaceActivity)

export default route;