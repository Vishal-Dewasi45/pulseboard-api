import mongoose from "mongoose";


const taskSchema=new mongoose.Schema({
    workspace:{
         type:mongoose.Schema.Types.ObjectId,
         ref:"Workspace",
         required:true
    },
    project:{
         type:mongoose.Schema.Types.ObjectId,
         ref:"Project",
         required:true
    },
    title: {
        type: String,
        required: [true, "Task title is required"],
        trim: true,
        minlength: 2,
        maxlength: 150,
      },
      description: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: "",
      },
  
      status: {
        type: String,
        enum: ["todo", "in_progress", "blocked", "done"],
        default: "todo",
      },
  
      priority: {
        type: String,
        enum: ["low", "medium", "high", "urgent"],
        default: "medium",
      },
  
      assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
  
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
  
      dueDate: {
        type: Date,
        default: null,
      },
  
      labels: {
        type: [String],
        default: [],
      },
  
      completedAt: {
        type: Date,
        default: null,
      },
    },
    { timestamps: true }
  );
  
  taskSchema.index({ workspace: 1, project: 1, createdAt: -1 });
  taskSchema.index({ workspace: 1, status: 1, priority: 1 });
  taskSchema.index({ workspace: 1, assignee: 1, dueDate: 1 });
  
 const Task=mongoose.model("Task",taskSchema)
  
  export default Task;