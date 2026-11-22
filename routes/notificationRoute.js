
import express from "express";
import notificationController from "../Controller/notificationController.js";
import authMiddlewear from "../middleware/authMiddlewear.js";

const router = express.Router();

router.use(authMiddlewear);

router.get("/", notificationController.getNotifications);

router.get(
  "/unread-count",
  notificationController.getUnreadCount
);

router.patch(
  "/read-all",
  notificationController.markAllNotificationsRead
);

router.patch(
  "/:notificationId/read",
  notificationController.markNotificationRead
);

export default router;
