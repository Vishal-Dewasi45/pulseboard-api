import express from "express";
import { searchTask } from "../Controller/searchController.js";
import authMiddlewear from "../middleware/authMiddlewear.js";

const route = express.Router();

route.get("/:workspaceId/search",authMiddlewear,searchTask)

export default route;