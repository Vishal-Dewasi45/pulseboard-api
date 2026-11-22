import mongoose from "mongoose";
import Project from "../models/project.js";
import Workspace from "../models/workspace.js";
import asyncHandler from "../middleware/asyncHandler.js";
import CreateActivity from "../utils/createActivity.js";
import Task from "../models/tasks.js";
import { getIO } from "../socket.js";

const CreateWorkspaceProject = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body;
  const { workspaceId } = req.params;
  const userId = req.user?.userId;

  if (!mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Workspace ID"
    });
  }

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(401).json({
      success: false,
      message: "Invalid authenticated user"
    });
  }

  if (typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: "Project name must contain at least 2 characters"
    });
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    "members.user": userId
  });

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found or access denied"
    });
  }

  const project = await Project.create({
    workspace: workspace._id,
    name: name.trim(),
    description,
    color,
    createdBy: userId
  });

  await CreateActivity({
    workspace: workspace._id,
    project: project._id,
    actor: userId,
    action: "project.created",
    message: `Created project "${project.name}"`,
    metadata: {
      projectName: project.name
    }
  });

  return res.status(201).json({
    success: true,
    message: "Project created successfully",
    project
  });
});

const GetWorkspaceProject = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user?.userId;

  if (!mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workspace ID"
    });
  }

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(401).json({
      success: false,
      message: "Invalid authenticated user"
    });
  }

  const workspace = await Workspace.exists({
    _id: workspaceId,
    "members.user": userId
  });

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found or access denied"
    });
  }

  const archived = req.query.archived === "true";
  const projects = await Project.find({
    workspace: workspaceId,
    status: archived ? "archived" : { $ne: "archived" },
  }).sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: projects.length,
    projects
  });
});

const emitWs = (workspaceId, event, payload) => {
  try { getIO().to(`workspace:${workspaceId}`).emit(event, payload); }
  catch (err) { console.error("emit failed:", err.message); }
};

const logActivity = async (data) => {
  try { await CreateActivity(data); } catch (err) { console.error("activity failed:", err.message); }
};

// Loads the project and checks the user is an admin or the creator
const loadManageable = async (projectId, userId) => {
  if (!mongoose.isValidObjectId(projectId)) return { error: [400, "Invalid project ID"] };
  const project = await Project.findById(projectId);
  if (!project) return { error: [404, "Project not found"] };
  const workspace = await Workspace.findOne({ _id: project.workspace, "members.user": userId });
  if (!workspace) return { error: [404, "Project not found"] };
  const me = workspace.members.find((m) => m.user.toString() === userId.toString());
  if (me.role !== "admin" && project.createdBy.toString() !== userId.toString())
    return { error: [403, "Only workspace admins or the project creator can do this"] };
  return { project };
};

const UpdateProject = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { project, error } = await loadManageable(req.params.projectId, userId);
  if (error) return res.status(error[0]).json({ success: false, message: error[1] });

  const allowed = ["name", "description", "color", "status"];
  for (const k of Object.keys(req.body))
    if (!allowed.includes(k))
      return res.status(400).json({ success: false, message: `Field ${k} cannot be updated` });

  const { name, description, color, status } = req.body;
  const prevStatus = project.status;

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100)
      return res.status(400).json({ success: false, message: "Project name must be 2-100 characters" });
    project.name = name.trim();
  }
  if (description !== undefined) {
    if (typeof description !== "string" || description.length > 1000)
      return res.status(400).json({ success: false, message: "Description must be under 1000 characters" });
    project.description = description;
  }
  if (color !== undefined) {
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))
      return res.status(400).json({ success: false, message: "Color must be a hex value like #6366f1" });
    project.color = color;
  }
  if (status !== undefined) {
    if (!["active", "completed", "archived"].includes(status))
      return res.status(400).json({ success: false, message: "Invalid status" });
    project.status = status;
  }

  await project.save();

  const action =
    status === "archived" && prevStatus !== "archived" ? "project.archived"
    : prevStatus === "archived" && status && status !== "archived" ? "project.restored"
    : "project.updated";
  const verb = { "project.archived": "Archived", "project.restored": "Restored", "project.updated": "Updated" }[action];

  await logActivity({
    workspace: project.workspace, project: project._id, actor: userId, action,
    message: `${verb} project "${project.name}"`,
    metadata: { projectName: project.name },
  });
  emitWs(project.workspace.toString(), "project:updated", {
    workspaceId: project.workspace.toString(), projectId: project._id.toString(),
  });

  return res.status(200).json({ success: true, message: "Project updated", project });
});

const DeleteProject = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { project, error } = await loadManageable(req.params.projectId, userId);
  if (error) return res.status(error[0]).json({ success: false, message: error[1] });

  const info = { workspace: project.workspace, name: project.name, id: project._id };
  await Task.deleteMany({ project: project._id });
  await project.deleteOne();

  await logActivity({
    workspace: info.workspace, project: null, actor: userId, action: "project.deleted",
    message: `Deleted project "${info.name}"`, metadata: { projectName: info.name },
  });
  emitWs(info.workspace.toString(), "project:deleted", {
    workspaceId: info.workspace.toString(), projectId: info.id.toString(),
  });

  return res.status(200).json({ success: true, message: "Project deleted" });
});

export default { CreateWorkspaceProject, GetWorkspaceProject, UpdateProject, DeleteProject };