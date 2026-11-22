import express from "express"
import workspaceCtrl from "../Controller/workspaceController.js"
import invitationController from "../Controller/invitationController.js";
import authMiddlewear from "../middleware/authMiddlewear.js"

const route=express.Router()

route.post("/create",authMiddlewear,workspaceCtrl.createWorkspace)

route.get("/get",authMiddlewear,workspaceCtrl.getWorkspace)

route.get("/:workspaceId/members", authMiddlewear, workspaceCtrl.getWorkspaceMembers);

route.get("/:workspaceId/invitations", authMiddlewear, invitationController.listWorkspaceInvitations);

route.patch("/:workspaceId/members/:memberId/role", authMiddlewear, workspaceCtrl.changeMemberRole);

route.delete("/:workspaceId/members/:memberId", authMiddlewear, workspaceCtrl.removeMember);

route.post("/:workspaceId/leave", authMiddlewear, workspaceCtrl.leaveWorkspace);

route.patch("/:workspaceId", authMiddlewear, workspaceCtrl.updateWorkspace);
route.delete("/:workspaceId", authMiddlewear, workspaceCtrl.deleteWorkspace);
export default route;