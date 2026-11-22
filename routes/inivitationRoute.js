import express from "express";
import authMiddlewear from "../middleware/authMiddlewear.js";
import invitationController from "../Controller/invitationController.js";

const router = express.Router();

router.use(authMiddlewear);

router.get("/", invitationController.getMyInvitations);

router.patch("/:invitationId/accept", invitationController.acceptInvitation);

router.patch("/:invitationId/reject", invitationController.rejectInvitation);

router.get(
  "/:workspaceId/search-members", authMiddlewear,invitationController.searchWorkspaceMembers);

router.patch("/:invitationId/cancel",invitationController.cancelInvitation);
export default router;