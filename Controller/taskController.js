import mongoose from "mongoose";
import Project from "../models/project.js";
import Workspace from "../models/workspace.js";
import createActivity from "../utils/createActivity.js";
import createNotification from "../utils/createNotification.js";
import asyncHandler from "../middleware/asyncHandler.js";
import Task from "../models/tasks.js";
import { getIO } from "../socket.js";

const getProjectAccessible = async (projectId, userId) => {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findOne({
    _id: projectId,
    status: { $ne: "archived" },
  });

  if (!project) return null;

  const workspace = await Workspace.exists({
    _id: project.workspace,
    "members.user": userId,
  });

  return workspace ? project : null;
};

const createTask=asyncHandler(async(req,res)=>{
  const { projectId } = req.params
  const  userId  = req.user?.userId
  const { title, description, priority, status, assignee, dueDate, labels } = req.body;

  const project = await getProjectAccessible(projectId, userId);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found or access denied",
    });
  }

  if (typeof title !== "string" || title.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: "Task title must contain at least 2 characters",
    });
  }

  if (
    status !== undefined &&
    !["todo", "in_progress", "blocked", "done"].includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid task status",
    });
  }

  if (
    priority !== undefined &&
    !["low", "medium", "high", "urgent"].includes(priority)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid task priority",
    });
  }

  if (assignee != null) {
    if (!mongoose.isValidObjectId(assignee)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignee ID",
      });
    }
  }
  let member = true;
  if (assignee) {
    member = await Workspace.exists({
      _id: project.workspace,
      "members.user": assignee,
    });
    if (!member) {
      return res.status(400).json({
        success: false,
        message: "Assignee must belong to this workspace",
      });
    }
  }
  if (
    dueDate != null &&
    (typeof dueDate !== "string" ||
      dueDate.trim() === "" ||
      !Number.isFinite(Date.parse(dueDate)))
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid due date",
    });
  }

  if (
    labels !== undefined &&
    (!Array.isArray(labels) ||
      !labels.every((label) => typeof label === "string"))
  ) {
    return res.status(400).json({
      success: false,
      message: "Labels must be an array of strings",
    });
  }
  const task = await Task.create({
    workspace: project.workspace,
    project: project._id,
    title: title.trim(),
    description,
    priority,
    status,
    assignee: assignee ?? null,
    dueDate: dueDate ?? null,  
    labels,
    createdBy: userId,
    completedAt: status === "done" ? new Date() : null,
  });

  await createActivity({
    workspace:project.workspace,
    project:project._id,
    task:task._id,
    actor:userId,
    action:"task.created",
    message:`Created task"${task.title}"`,
    metadata:{
      title:task.title,
      status:task.status,
      priority:task.priority,
      assigne:task.assignee
    }
  })
   // Notify the assigned user
if (
  task.assignee &&
  task.assignee.toString() !== userId.toString()
) {
  await createNotification({
    recipient: task.assignee,
    actor: userId,
    workspace: task.workspace,
    project: task.project,
    task: task._id,
    type: "task.assigned",
    title: "New task assigned to you",
    message: `You were assigned to "${task.title}"`,
  });
}

await task.populate("assignee", "name email"); 
  
  getIO()
  .to(`workspace:${project.workspace.toString()}`)
  .emit("task:created", {
    taskId: task._id.toString(),
    workspaceId: project.workspace.toString(),
    projectId: project._id.toString(),
    task,
  });
    return res.status(201).json({
        success: true,
        message: "Task created successfully",
        task
      });
})

const getTasks=asyncHandler(async(req,res)=>{
    const {projectId}=req.params;
    const userId=req.user?.userId;
    const project = await getProjectAccessible(projectId,userId);

    if(!project){
        return res.status(404).json({
            success: false,
            message: "Project not found or access denied",
          });
      
    }

    const tasks=await Task.find({
        project:project._id,
        workspace:project.workspace
    })
    .populate("assignee", "name email")
    .sort({ createdAt: -1 })
    .limit(100);

  return res.status(200).json({
    success: true,
    count: tasks.length,
    tasks,
  });
});

const updateTask=asyncHandler(async(req,res)=>{
  const {taskId}=req.params
  const userId=req.user?.userId

  if(!mongoose.isValidObjectId(taskId)){
    return res.status(400).json({
      success:"false",
      error:"Task ID not found"
    })
  }

  const task= await Task.findById(taskId);


  if (!task) {
    return res.status(404).json({
      success: false,
      message: "Task not found",
    });
  }
  const project = await getProjectAccessible(task.project,userId)
  if(!project){
    return res.status(400).json({
      success:"false",
      error:"project not found or access denied"
    })
  }
  const original = {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    assignee: task.assignee?.toString() ?? null,
    dueDate: task.dueDate?.toISOString() ?? null,
    labels: JSON.stringify(task.labels ?? []),
  };
  const allowedFields=[
    "title",
    "description",
    "status",
    "priority",
    "assignee",
    "dueDate",
    "labels",
  ];

  for(const field of Object.keys(req.body)) {
    if(!allowedFields.includes(field)){
      return res.status(400).json({
        success:false,
       error:`Field ${field} cannot be updated`,
      });
    }
  }
  const {
    title,
    description,
    status,
    priority,
    assignee,
    dueDate,
    labels,
  } = req.body;
  
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Task title must contain at least 2 characters",
      });
    }
    task.title = title.trim();
  }

  if (description !== undefined) {
    if (
      typeof description !== "string" ||
      description.length > 3000
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid task description",
      });
    }
    task.description = description;
  }

  if (status !== undefined) {
    if (!["todo", "in_progress", "blocked", "done"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task status",
      });
    }

    task.status = status;
    task.completedAt =
      status === "done" ? task.completedAt ?? new Date() : null;
  }

  if (priority !== undefined) {
    if (!["low", "medium", "high", "urgent"].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task priority",
      });
    }
    task.priority = priority;
  }

  if (assignee !== undefined) {
    if (assignee === null || assignee === "") {
      task.assignee = null;
    } else {
      if (!mongoose.isValidObjectId(assignee)) {
        return res.status(400).json({
          success: false,
          message: "Invalid assignee ID",
        });
      }

      const isMember = await Workspace.exists({
        _id: task.workspace,
        "members.user": assignee,
      });

      if (!isMember) {
        return res.status(400).json({
          success: false,
          message: "Assignee must belong to this workspace",
        });
      }

      task.assignee = assignee;
    }
  }

  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === "") {
      task.dueDate = null;
    } else {
      if (
        typeof dueDate !== "string" ||
        !Number.isFinite(Date.parse(dueDate))
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid due date",
        });
      }
      task.dueDate = new Date(dueDate);
    }
  }

  if (labels !== undefined) {
    if (
      !Array.isArray(labels) ||
      !labels.every(
        (label) => typeof label === "string" && label.length <= 40
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Labels must be an array of strings (max 40 characters each)",
      });
    }
    task.labels = labels;
  }

  await task.save();

  const changes={}
  if(original.title !== task.title){
      changes.title={
        from:original.title,
        to:task.title,
      }
  }
  if (original.description !== (task.description ?? "")) {
    changes.description = {
      from: original.description,
      to: task.description ?? ""
    };
  }

  if (original.priority !== task.priority) {
    changes.priority = {
      from: original.priority,
      to: task.priority,
    };
  }
  if (original.dueDate !== (task.dueDate?.toISOString() ?? null)) {
    changes.dueDate = {
      from: original.dueDate,
      to: task.dueDate?.toISOString() ?? null
    };
  }
  
  if (original.labels !== JSON.stringify(task.labels ?? [])) {
    changes.labels = {
      from: JSON.parse(original.labels),
      to: task.labels ?? []
    };
  }
  const newAssignee = task.assignee?.toString() ?? null;
  const statusChanged = original.status !== task.status;
  const assigneeChanged = original.assignee !== newAssignee;

  if (statusChanged) {
    await createActivity({
      workspace: task.workspace,
      project: task.project,
      task: task._id,
      actor: userId,
      action: "task.status_changed",
      message: `Changed "${task.title}" status from ${original.status} to ${task.status}`,
      metadata: {
        from: original.status,
        to: task.status,
      },
    });
  }
  
  if (assigneeChanged) {
    await createActivity({
      workspace: task.workspace,
      project: task.project,
      task: task._id,
      actor: userId,
      action: "task.assigned",
      message: newAssignee
        ? `Assigned "${task.title}" to a workspace member`
        : `Unassigned "${task.title}"`,
      metadata: {
        from: original.assignee,
        to: newAssignee,
      },
    });
  }
  
  if (Object.keys(changes).length > 0) {
    await createActivity({
      workspace: task.workspace,
      project: task.project,
      task: task._id,
      actor: userId,
      action: "task.updated",
      message: `Updated details of "${task.title}"`,
      metadata: { changes },
    });
  }

  if (
    assigneeChanged &&
    newAssignee &&
    newAssignee !== userId.toString()
  ) {
    await createNotification({
      recipient: newAssignee,
      actor: userId,
      workspace: task.workspace,
      project: task.project,
      task: task._id,
      type: "task.assigned",
      title: "Task assigned to you",
      message: `You were assigned to "${task.title}"`,
    });
  }

  await task.populate("assignee", "name email"); 

  const workspaceId = task.workspace.toString();

getIO()
  .to(`workspace:${workspaceId}`)
  .emit("task:updated", {
    taskId: task._id.toString(),
    workspaceId,
    projectId: task.project.toString(),
    task,
  });

  if (assigneeChanged) {
    getIO()
      .to(`workspace:${workspaceId}`)
      .emit("task:assigned", {
        taskId: task._id.toString(),
        workspaceId,
        projectId: task.project.toString(),
        previousAssignee: original.assignee,
        assignee: newAssignee,
        task,
      });
  }

  return res.status(200).json({
    success: true,
    message: "Task updated successfully",
    task,
  });
});

const deleteTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const userId = req.user?.userId;

  if (
    !mongoose.isValidObjectId(taskId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid task or user ID",
    });
  }

  const task = await Task.findById(taskId);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: "Task not found",
    });
  }

  const project = await getProjectAccessible(task.project, userId);

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Task not found or access denied",
    });
  }

  // Delete se pehle details save kar lo
  const deletedTask = {
    taskId: task._id.toString(),
    workspaceId: task.workspace.toString(),
    projectId: task.project.toString(),
    title: task.title,
  };

  await task.deleteOne();

  // Activity timeline mein record
  await createActivity({
    workspace: task.workspace,
    project: task.project,
    task: task._id,
    actor: userId,
    action: "task.deleted",
    message: `Deleted task "${task.title}"`,
    metadata: {
      title: task.title,
    },
  });
  // Workspace ke connected clients ko notify karo
  getIO()
    .to(`workspace:${deletedTask.workspaceId}`)
    .emit("task:deleted", deletedTask);

  return res.status(200).json({
    success: true,
    message: "Task deleted successfully",
  });
});
export default {createTask,getTasks,updateTask,deleteTask}