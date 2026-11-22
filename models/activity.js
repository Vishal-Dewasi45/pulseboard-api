
import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    action: {
      type: String,
      enum: [
        "project.created", "project.updated", "project.archived", "project.restored", "project.deleted",
        "task.created", "task.updated", "task.status_changed", "task.assigned", "task.deleted"
      ],
      required: true
    },

    message: {
      type: String,
      required: true,
      maxlength: 250
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

activitySchema.index({ workspace: 1, createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;
