import mongoose from "mongoose";
import Workspace from "../models/workspace.js";
import Activity from "../models/activity.js";
import asyncHandler from "../middleware/asyncHandler.js";

const getWorkspaceActivity = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user?.userId
  const { page = "1", limit = "20" } = req.query;

  if (!mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workspace ID",
    });
  }

  const workspace = await Workspace.exists({
    _id: workspaceId,
    "members.user": userId,
  });

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found",
    });
  }

  const pageNumber = Number(page);
  const pageSize = Number(limit);

  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination values",
    });
  }

  const filter = {
    workspace: new mongoose.Types.ObjectId(workspaceId),
  };

  const [activities, total] = await Promise.all([
    Activity.find(filter)
      .populate("actor", "name email")
      .populate("project", "name")
      .populate("task", "title")
      .sort({ createdAt: -1, _id: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),

    Activity.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    pagination: {
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: pageNumber * pageSize < total,
      hasPrevPage: pageNumber > 1,
    },
    activities,
  });
});

export { getWorkspaceActivity };