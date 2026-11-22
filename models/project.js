import mongoose from "mongoose"

const projectSchema = new mongoose.Schema({
    workspace:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Workspace",
        required:true,
        index: true,
    },
    name: {
        type: String,
        required: [true, "Project name is required"],
        trim: true,
        minlength: 2,
        maxlength: 100,
      },
  
      description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },
  
      status: {
        type: String,
        enum: ["active", "completed", "archived"],
        default: "active",
      },
  
      color: {
        type: String,
        default: "#6366f1",
      },
  
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    { timestamps: true }
  );
  
  projectSchema.index({ workspace: 1, createdAt: -1 });
  
  const Project = mongoose.model("Project", projectSchema);
  
  export default Project;