import mongoose from "mongoose";
import Notification from "../models/notification.js";
import asyncHandler from "../middleware/asyncHandler.js";

const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user?.userId;

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );

  const notifications = await Notification.find({
    recipient: userId,
  })
    .populate("actor", "name email")
    .populate("project", "name")
    .populate("task", "title")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Notification.countDocuments({
    recipient: userId,
  });

  return res.status(200).json({
    success: true,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    notifications,
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user?.userId;

  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    unreadCount,
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const userId = req.user?.userId;
  const { notificationId } = req.params;

  if (!mongoose.isValidObjectId(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification ID",
    });
  }

  const notification = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      recipient: userId,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Notification marked as read",
    notification,
  });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const userId = req.user?.userId;

  const result = await Notification.updateMany(
    {
      recipient: userId,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    }
  );

  return res.status(200).json({
    success: true,
    message: "All notifications marked as read",
    modifiedCount: result.modifiedCount,
  });
});

export default {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};
