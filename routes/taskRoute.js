import express from "express"
import taskCtrl from "../Controller/taskController.js"
import authMiddlewear from "../middleware/authMiddlewear.js";


const route=express.Router();

route.post("/create/:projectId",authMiddlewear,taskCtrl.createTask)
route.get("/get/:projectId",authMiddlewear,taskCtrl.getTasks)
route.patch("/update/:taskId",authMiddlewear,taskCtrl.updateTask)
route.delete("/delete/:taskId",authMiddlewear,taskCtrl.deleteTask)

export default route;