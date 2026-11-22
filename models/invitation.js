
import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    inviter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    invitee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["member"],
      default: "member",
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled", "expired"],
      default: "pending",
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate pending invitations
invitationSchema.index(
  { workspace: 1, invitee: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

const Invitation = mongoose.model("Invitation", invitationSchema);

export default Invitation;
