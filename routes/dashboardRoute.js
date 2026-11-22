import express from "express"
import { getDashboard } from "../Controller/dashboardController.js"
import authMiddlewear from "../middleware/authMiddlewear.js"

const route=express.Router()

route.get("/:workspaceId",authMiddlewear,getDashboard);

export default route;