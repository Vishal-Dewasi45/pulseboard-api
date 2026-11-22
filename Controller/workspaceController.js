import mongoose, { isValidObjectId } from "mongoose";
import Workspace from "../models/workspace.js"
import asyncHandler from "../middleware/asyncHandler.js"
import Task from "../models/tasks.js";
import { getIO } from "../socket.js";
import Project from "../models/project.js";
import Activity from "../models/activity.js";
import Notification from "../models/notification.js";
import Invitation from "../models/invitation.js";

const createWorkspace=asyncHandler(async (req,res)=>{
      const {name} =req.body
      if(typeof name!="string" || name.trim().length < 2){
        return  res.status(400).json({
           success:false,
           error:"workshop name must contain atleast 2 character"
        })
      }
      if(name.trim().length>60){
        return res.status(400).json({
            success:false,
            error:"workshop name can only contain 60 character"
        })
      }
      const userId= req.user?.userId

      if(!userId || !isValidObjectId(userId)){
        return res.status(400).json({
            successs:false,
            error:"authenticated user not found.Plz register"
        })
      }
      const slugBase = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 45);
  
    const slug = `${slugBase || "workspace"}-${new mongoose.Types.ObjectId()
      .toString()
      .slice(-8)}`;

      const workspace = await Workspace.create({
        name:name.trim(),
        slug,
        owner:userId,
        members: [
            {
                user:userId,
                role:"admin",
            }
        ]
      })
      return res.status(201).json({
        success:true,
        msg:"workspace created successfully.",
        workspace,
      })
})

const getWorkspace=asyncHandler(async(req,res)=>{
    const userId=req.user?.userId

  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(401).json({
      success: false,
      message: "Authenticated user not found",
    });
  }

   const workspaces = await Workspace.find({
    "members.user": userId,
  })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    count: workspaces.length,
    workspaces,
  });
})

const getWorkspaceMembers = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user?.userId;

  if (!mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workspace ID",
    });
  }

  // Only members of this workspace can see its member list
  const workspace = await Workspace.findOne({
    _id: workspaceId,
    "members.user": userId,
  })
    .populate("members.user", "name email")
    .lean();

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found or access denied",
    });
  }

  return res.status(200).json({
    success: true,
    count: workspace.members.length,
    members: workspace.members,
  });
});

const emitSafe = (fn) => {
  try { fn(getIO()); } catch (err) { console.error("Socket emit failed:", err.message); }
};

// Shared by remove/leave: unassign tasks, notify, and kick sockets from the room
const afterMemberGone = async (workspaceId, memberId, reason) => {
  await Task.updateMany(
    { workspace: workspaceId, assignee: memberId },
    { $set: { assignee: null } }
  );

  emitSafe((io) => {
    io.to(`user:${memberId}`).emit("workspace:removed", { workspaceId, reason });
    io.in(`user:${memberId}`).socketsLeave(`workspace:${workspaceId}`);
    io.to(`workspace:${workspaceId}`).emit("workspace:members-changed", { workspaceId });
  });
};

const findMembership = async (workspaceId, userId) => {
  const workspace = await Workspace.findOne({ _id: workspaceId, "members.user": userId });
  if (!workspace) return {};
  const me = workspace.members.find((m) => m.user.toString() === userId.toString());
  return { workspace, me };
};

const changeMemberRole = asyncHandler(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const { role } = req.body;
  const userId = req.user.userId;

  if (!isValidObjectId(workspaceId) || !isValidObjectId(memberId)) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }
  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ success: false, message: "Role must be admin or member" });
  }

  const { workspace, me } = await findMembership(workspaceId, userId);
  if (!workspace) {
    return res.status(404).json({ success: false, message: "Workspace not found or access denied" });
  }
  if (me.role !== "admin") {
    return res.status(403).json({ success: false, message: "Only admins can change roles" });
  }

  const target = workspace.members.find((m) => m.user.toString() === memberId);
  if (!target) {
    return res.status(404).json({ success: false, message: "Member not found in this workspace" });
  }
  if (workspace.owner.toString() === memberId) {
    return res.status(400).json({ success: false, message: "The owner's role cannot be changed" });
  }

  target.role = role;
  await workspace.save();

  emitSafe((io) =>
    io.to(`workspace:${workspaceId}`).emit("workspace:members-changed", { workspaceId })
  );

  return res.status(200).json({ success: true, message: "Role updated", memberId, role });
});

const removeMember = asyncHandler(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const userId = req.user.userId;

  if (!isValidObjectId(workspaceId) || !isValidObjectId(memberId)) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }

  const { workspace, me } = await findMembership(workspaceId, userId);
  if (!workspace) {
    return res.status(404).json({ success: false, message: "Workspace not found or access denied" });
  }
  if (me.role !== "admin") {
    return res.status(403).json({ success: false, message: "Only admins can remove members" });
  }
  if (memberId === userId.toString()) {
    return res.status(400).json({ success: false, message: "Use 'Leave workspace' to remove yourself" });
  }
  if (workspace.owner.toString() === memberId) {
    return res.status(400).json({ success: false, message: "The workspace owner cannot be removed" });
  }
  if (!workspace.members.some((m) => m.user.toString() === memberId)) {
    return res.status(404).json({ success: false, message: "Member not found in this workspace" });
  }

  await Workspace.updateOne({ _id: workspaceId }, { $pull: { members: { user: memberId } } });
  await afterMemberGone(workspaceId, memberId, "removed");

  return res.status(200).json({ success: true, message: "Member removed" });
});

const leaveWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;

  if (!isValidObjectId(workspaceId)) {
    return res.status(400).json({ success: false, message: "Invalid workspace ID" });
  }

  const { workspace } = await findMembership(workspaceId, userId);
  if (!workspace) {
    return res.status(404).json({ success: false, message: "Workspace not found or access denied" });
  }
  if (workspace.owner.toString() === userId.toString()) {
    return res.status(400).json({
      success: false,
      message: "The owner cannot leave. Delete the workspace or transfer ownership first.",
    });
  }

  await Workspace.updateOne({ _id: workspaceId }, { $pull: { members: { user: userId } } });
  await afterMemberGone(workspaceId, userId.toString(), "left");

  return res.status(200).json({ success: true, message: "You left the workspace" });
});
const updateWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { name } = req.body;
  const userId = req.user.userId;

  if (!isValidObjectId(workspaceId)) {
    return res.status(400).json({ success: false, message: "Invalid workspace ID" });
  }
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 60) {
    return res.status(400).json({ success: false, message: "Workspace name must be 2-60 characters" });
  }

  const { workspace, me } = await findMembership(workspaceId, userId);
  if (!workspace) {
    return res.status(404).json({ success: false, message: "Workspace not found or access denied" });
  }
  if (me.role !== "admin") {
    return res.status(403).json({ success: false, message: "Only admins can rename the workspace" });
  }

  workspace.name = name.trim(); // slug stays the same so links never break
  await workspace.save();

  emitSafe((io) => io.to(`workspace:${workspaceId}`).emit("workspace:updated", { workspaceId }));

  return res.status(200).json({ success: true, message: "Workspace renamed", workspace });
});

const deleteWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { confirmName } = req.body ?? {};
  const userId = req.user.userId;

  if (!isValidObjectId(workspaceId)) {
    return res.status(400).json({ success: false, message: "Invalid workspace ID" });
  }

  const { workspace } = await findMembership(workspaceId, userId);
  if (!workspace) {
    return res.status(404).json({ success: false, message: "Workspace not found or access denied" });
  }
  if (workspace.owner.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: "Only the owner can delete the workspace" });
  }
  if (confirmName !== workspace.name) {
    return res.status(400).json({ success: false, message: "Type the workspace name exactly to confirm" });
  }

  const memberIds = workspace.members.map((m) => m.user.toString());

  await Promise.all([
    Task.deleteMany({ workspace: workspaceId }),
    Project.deleteMany({ workspace: workspaceId }),
    Activity.deleteMany({ workspace: workspaceId }),
    Notification.deleteMany({ workspace: workspaceId }),
    Invitation.deleteMany({ workspace: workspaceId }),
  ]);
  await workspace.deleteOne();

  emitSafe((io) => {
    memberIds.forEach((id) =>
      io.to(`user:${id}`).emit("workspace:removed", { workspaceId, reason: "deleted" })
    );
    io.in(`workspace:${workspaceId}`).socketsLeave(`workspace:${workspaceId}`);
  });

  return res.status(200).json({ success: true, message: "Workspace deleted" });
});

export default {createWorkspace,getWorkspace,getWorkspaceMembers,changeMemberRole,removeMember,leaveWorkspace,updateWorkspace,deleteWorkspace};