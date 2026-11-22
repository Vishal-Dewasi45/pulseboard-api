import mongoose from "mongoose";
import asyncHandler from "../middleware/asyncHandler.js";
import { getIO } from "../socket.js";
import Workspace from "../models/workspace.js";
import User from "../models/user.js";
import Invitation from "../models/invitation.js";
import createNotification from "../utils/createNotification.js";

const inviteMember = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { email } = req.body;

  const userId = req.user?.userId;

  // 1. Validate IDs
  if (
    !mongoose.isValidObjectId(workspaceId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid workspace or user ID",
    });
  }

  // 2. Validate email
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email",
    });
  }

  // 3. Find workspace
  const workspace = await Workspace.findById(workspaceId);

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found",
    });
  }

  // 4. Check whether requester is workspace admin
  const requester = workspace.members.find(
    (member) => member.user.toString() === userId.toString()
  );

  if (!requester || requester.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only workspace admins can invite members",
    });
  }

  // 5. Find the invited user (case-insensitive email)
  const normalizedEmail = email.trim();

  const invitee = await User.findOne({
    email: {
      $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    },
  });

  if (!invitee) {
    return res.status(404).json({
      success: false,
      message: "No registered user found with this email",
    });
  }

  // 6. Prevent inviting yourself
  if (invitee._id.toString() === userId.toString()) {
    return res.status(400).json({
      success: false,
      message: "You cannot invite yourself",
    });
  }

  // 7. Check existing membership
  const alreadyMember = workspace.members.some(
    (member) => member.user.toString() === invitee._id.toString()
  );

  if (alreadyMember) {
    return res.status(409).json({
      success: false,
      message: "User is already a workspace member",
    });
  }

  // 8. Check pending invitation
  const existingInvitation = await Invitation.findOne({
    workspace: workspaceId,
    invitee: invitee._id,
    status: "pending",
  });

  if (existingInvitation) {
    return res.status(409).json({
      success: false,
      message: "A pending invitation already exists",
    });
  }

  // 9. Create invitation (7-day expiry)
  const invitation = await Invitation.create({
    workspace: workspaceId,
    inviter: userId,
    invitee: invitee._id,
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // 10. Create notification
  await createNotification({
    recipient: invitee._id,
    actor: userId,
    workspace: workspaceId,
    type: "workspace.invitation",
    title: "Workspace invitation",
    message: `You have been invited to join "${workspace.name}"`,
  });

  return res.status(201).json({
    success: true,
    message: "Workspace invitation sent successfully",
    invitation,
  });
});

export const getMyInvitations = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const now = new Date();
  
    // Expired invitations ko update karo
    await Invitation.updateMany(
      {
        invitee: userId,
        status: "pending",
        expiresAt: { $lte: now },
      },
      {
        $set: { status: "expired" },
      }
    );
  
    const invitations = await Invitation.find({
      invitee: userId,
      status: "pending",
      expiresAt: { $gt: now },
    })
      .populate("workspace", "name slug")
      .populate("inviter", "name email")
      .sort({ createdAt: -1 });
  
    res.status(200).json({
      success: true,
      count: invitations.length,
      invitations,
    });
  });
  export const acceptInvitation = asyncHandler(async (req, res) => {
    const { invitationId } = req.params;
    const userId = req.user.userId;
  
    if (!mongoose.Types.ObjectId.isValid(invitationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invitation ID",
      });
    }
  
    const session = await mongoose.startSession();
    let outcome = "not-found";
  
    try {
      await session.withTransaction(async () => {
        const invitation = await Invitation.findOne({
          _id: invitationId,
          invitee: userId,
          status: "pending",
        }).session(session);
  
        // Invitation pending nahi hai ya user ka invitation nahi hai
        if (!invitation) {
          const existing = await Invitation.findOne({
            _id: invitationId,
            invitee: userId,
          }).session(session);
  
          if (!existing) {
            outcome = "not-found";
            return;
          }
  
          if (
            existing.status === "pending" &&
            existing.expiresAt <= new Date()
          ) {
            existing.status = "expired";
            await existing.save({ session });
            outcome = "expired";
            return;
          }
  
          outcome = "already-responded";
          return;
        }
  
        // Expiry check
        if (invitation.expiresAt <= new Date()) {
          invitation.status = "expired";
          await invitation.save({ session });
          outcome = "expired";
          return;
        }
  
        const workspace = await Workspace.findById(
          invitation.workspace
        ).session(session);
  
        if (!workspace) {
          outcome = "workspace-not-found";
          return;
        }
  
        // Check karo user already member toh nahi
        const alreadyMember = workspace.members.some(
          (member) => member.user.toString() === userId.toString()
        );
  
        if (!alreadyMember) {
          workspace.members.push({
            user: userId,
            role: "member",
          });
  
          await workspace.save({ session });
        }
  
        // Invitation accepted mark karo
        invitation.status = "accepted";
        invitation.respondedAt = new Date();
  
        await invitation.save({ session });
  
        outcome = alreadyMember ? "already-member" : "accepted";
      });
    } finally {
      await session.endSession();
    }
    if (outcome === "accepted") {
      try {
        getIO().to(`workspace:${invitation_workspaceId}`).emit("workspace:members-changed", {
          workspaceId: invitation_workspaceId,
        });
      } catch (err) {
        console.error("Socket emit failed:", err.message);
      }
    }
  
    if (outcome === "not-found") {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }
  
    if (outcome === "expired") {
      return res.status(410).json({
        success: false,
        message: "This invitation has expired",
      });
    }
  
    if (outcome === "already-responded") {
      return res.status(409).json({
        success: false,
        message: "Invitation has already been responded to",
      });
    }
  
    if (outcome === "workspace-not-found") {
      return res.status(404).json({
        success: false,
        message: "Workspace not found",
      });
    }
  
    return res.status(200).json({
      success: true,
      message:
        outcome === "already-member"
          ? "You are already a member of this workspace"
          : "Invitation accepted successfully",
    });
  });
  export const rejectInvitation = asyncHandler(async (req, res) => {
    const { invitationId } = req.params;
    const userId = req.user.userId;
    const now = new Date();
  
    if (!mongoose.Types.ObjectId.isValid(invitationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invitation ID",
      });
    }
  
    const invitation = await Invitation.findOneAndUpdate(
      {
        _id: invitationId,
        invitee: userId,
        status: "pending",
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: "rejected",
          respondedAt: now,
        },
      },
      { new: true }
    );
  
    if (invitation) {
      return res.status(200).json({
        success: true,
        message: "Invitation rejected successfully",
      });
    }
  
    const existing = await Invitation.findOne({
      _id: invitationId,
      invitee: userId,
    });
  
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }
  
    if (existing.status === "pending" && existing.expiresAt <= now) {
      await Invitation.updateOne(
        { _id: invitationId, invitee: userId, status: "pending" },
        { $set: { status: "expired" } }
      );
  
      return res.status(410).json({
        success: false,
        message: "This invitation has expired",
      });
    }
  
    return res.status(409).json({
      success: false,
      message: "Invitation has already been responded to",
    });
  }); 
export const searchWorkspaceMembers = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user?.userId;
  const q = req.query.q?.trim();

  // Validate IDs
  if (
    !mongoose.isValidObjectId(workspaceId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid workspace or user ID"
    });
  }

  // Search requires at least 2 characters
  if (typeof q !== "string" || q.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Enter at least 2 characters to search"
    });
  }

  // Find workspace
  const workspace = await Workspace.findById(workspaceId);

  if (!workspace) {
    return res.status(404).json({
      success: false,
      message: "Workspace not found"
    });
  }

  // Only admins can search invite candidates
  const requester = workspace.members.find(
    (member) => member.user.toString() === userId.toString()
  );

  if (!requester || requester.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only workspace admins can search members"
    });
  }

  // Escape special regex characters
  const safeQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Exclude existing workspace members
  const excludedUserIds = workspace.members.map(
    (member) => member.user
  );

  // Exclude users who already have pending invitations
  const pendingInvitations = await Invitation.find({
    workspace: workspaceId,
    status: "pending"
  }).select("invitee");

  const pendingUserIds = pendingInvitations.map(
    (invitation) => invitation.invitee
  );

  excludedUserIds.push(...pendingUserIds);

  // Search registered users by name or email
  const users = await User.find({
    _id: { $nin: excludedUserIds },
    $or: [
      { name: { $regex: safeQuery, $options: "i" } },
      { email: { $regex: safeQuery, $options: "i" } }
    ]
  })
    .select("_id name email")
    .sort({ name: 1 })
    .limit(10)
    .lean();

  return res.status(200).json({
    success: true,
    count: users.length,
    users
  });
});
const listWorkspaceInvitations = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user?.userId;

  if (!mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({ success: false, message: "Invalid workspace ID" });
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    "members.user": userId,
  }).select("members");

  if (!workspace) {
    return res.status(404).json({ success: false, message: "Workspace not found or access denied" });
  }

  const me = workspace.members.find((m) => m.user.toString() === userId.toString());
  if (me.role !== "admin") {
    return res.status(403).json({ success: false, message: "Only workspace admins can view invitations" });
  }

  // Expire stale ones first so they don't show as pending
  await Invitation.updateMany(
    { workspace: workspaceId, status: "pending", expiresAt: { $lte: new Date() } },
    { $set: { status: "expired" } }
  );

  const invitations = await Invitation.find({ workspace: workspaceId, status: "pending" })
    .populate("invitee", "name email")
    .populate("inviter", "name")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ success: true, count: invitations.length, invitations });
});
const cancelInvitation = asyncHandler(async (req, res) => {
  const { invitationId } = req.params;
  const userId = req.user?.userId;

  if (!mongoose.isValidObjectId(invitationId)) {
    return res.status(400).json({ success: false, message: "Invalid invitation ID" });
  }

  const invitation = await Invitation.findById(invitationId);
  if (!invitation) {
    return res.status(404).json({ success: false, message: "Invitation not found" });
  }

  const workspace = await Workspace.findOne({
    _id: invitation.workspace,
    "members.user": userId,
  }).select("members");

  // Same 404 for non-members so invitation IDs can't be probed
  if (!workspace) {
    return res.status(404).json({ success: false, message: "Invitation not found" });
  }

  const me = workspace.members.find((m) => m.user.toString() === userId.toString());
  if (me.role !== "admin") {
    return res.status(403).json({ success: false, message: "Only workspace admins can cancel invitations" });
  }

  // Atomic: only a still-pending invite can be cancelled
  const updated = await Invitation.findOneAndUpdate(
    { _id: invitationId, status: "pending" },
    { $set: { status: "cancelled", respondedAt: new Date() } },
    { new: true }
  );

  if (!updated) {
    return res.status(409).json({ success: false, message: "This invitation has already been responded to" });
  }

  try {
    getIO().to(`user:${invitation.invitee.toString()}`).emit("invitation:cancelled", { invitationId });
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }

  return res.status(200).json({ success: true, message: "Invitation cancelled" });
});
export default { inviteMember,getMyInvitations,acceptInvitation,searchWorkspaceMembers,rejectInvitation, listWorkspaceInvitations,
  cancelInvitation,};
