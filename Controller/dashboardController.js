
import mongoose from "mongoose";
import Project from "../models/project.js";
import Workspace from "../models/workspace.js";
import Task from "../models/tasks.js";
import asyncHandler from "../middleware/asyncHandler.js";

const getDashboard = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user?.userId;

  // Validate workspace ID
  if (!mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workspace ID",
    });
  }

  // Verify workspace membership
  const workspace = await Workspace.exists({
    _id: workspaceId,
    "members.user": userId,
  });
  const myTasksCount = await Task.countDocuments({
    workspace: workspaceId,
    assignee: userId,
    status: { $ne: "done" },
  });

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found or access denied",
    });
  }

  const now = new Date();
  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);

  // Get active projects only
  const activeProjectIds = await Project.find({
    workspace: workspaceObjectId,
    status: { $ne: "archived" },
  }).distinct("_id");

  // Dashboard task statistics
  const [taskStats] = await Task.aggregate([
    {
      $match: {
        workspace: workspaceObjectId,
        project: { $in: activeProjectIds },
      },
    },

    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },

              completed: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "done"] },
                    1,
                    0,
                  ],
                },
              },

              blocked: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "blocked"] },
                    1,
                    0,
                  ],
                },
              },

              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$status", "done"] },
                        { $ne: ["$dueDate", null] },
                        { $lt: ["$dueDate", now] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],

        statusBreakdown: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],

        priorityBreakdown: [
          {
            $group: {
              _id: "$priority",
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const totals = taskStats.totals[0] || {
    total: 0,
    completed: 0,
    blocked: 0,
    overdue: 0,
  };

  const completionPercentage =
    totals.total === 0
      ? 0
      : Math.round((totals.completed / totals.total) * 100);

      const productivityScore =
      totals.total === 0
        ? 0
        : Math.round(
            (totals.completed / totals.total) * 100
          );
    
  // Project-wise task statistics
  const projects = await Project.aggregate([
    {
      $match: {
        workspace: workspaceObjectId,
        status: { $ne: "archived" },
      },
    },

    {
      $sort: {
        createdAt: -1,
        _id: -1,
      },
    },

    {
      $limit: 50,
    },

    {
      $lookup: {
        from: Task.collection.name,

        let: {
          projectId: "$_id",
          workspaceId: "$workspace",
        },

        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$project", "$$projectId"] },
                  { $eq: ["$workspace", "$$workspaceId"] },
                ],
              },
            },
          },

          {
            $group: {
              _id: null,

              totalTasks: { $sum: 1 },

              completedTasks: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "done"] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],

        as: "taskStats",
      },
    },

    {
      $project: {
        name: 1,
        status: 1,
        color: 1,

        totalTasks: {
          $ifNull: [
            { $arrayElemAt: ["$taskStats.totalTasks", 0] },
            0,
          ],
        },

        completedTasks: {
          $ifNull: [
            { $arrayElemAt: ["$taskStats.completedTasks", 0] },
            0,
          ],
        },
      },
    },

    {
      $addFields: {
        completionPercentage: {
          $cond: [
            { $eq: ["$totalTasks", 0] },
            0,
            {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        "$completedTasks",
                        "$totalTasks",
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          ],
        },
      },
    },
  ]);

  return res.status(200).json({
    success: true,

    dashboard: {
      overview: {
        totalTasks: totals.total,
        completedTasks: totals.completed,
        blockedTasks: totals.blocked,
        overdueTasks: totals.overdue,
        completionPercentage,
        myTasksCount,
        productivityScore
      },

      statusBreakdown: taskStats.statusBreakdown.map((item) => ({
        status: item._id,
        count: item.count,
      })),

      priorityBreakdown: taskStats.priorityBreakdown.map((item) => ({
        priority: item._id,
        count: item.count,
      })),

      projects,

      generatedAt: now,
    },
  });
});

export { getDashboard };
