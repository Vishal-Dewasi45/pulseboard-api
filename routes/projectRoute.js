import express from "express"
import projectCtrl from "../Controller/projectController.js"
import authMiddlewear from "../middleware/authMiddlewear.js"

const route=express.Router()

route.post("/create/:workspaceId",authMiddlewear,projectCtrl.CreateWorkspaceProject)
route.get("/get/:workspaceId",authMiddlewear,projectCtrl.GetWorkspaceProject)
route.patch("/update/:projectId", authMiddlewear, projectCtrl.UpdateProject);
route.delete("/delete/:projectId", authMiddlewear, projectCtrl.DeleteProject);

export default route;