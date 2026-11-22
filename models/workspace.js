import mongoose from "mongoose";

const workspaceMemberSchema=new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    role:{
        type:String,
        enum:["admin","member"],
        default:"member",
    },
    joined_at:{
        type:Date,
        default: Date.now,
    },
  },
  { _id: false }
)

const workspaceSchema=new mongoose.Schema({
    name:{
        type:String,
        required:[true,"name is required."],
        trim:true,
        minlength:2,
        maxlength:60
    },
    slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
  
      owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
  
      members: {
        type: [workspaceMemberSchema],
        default: [],
      },
    },
    { timestamps: true }
  );
  
  workspaceSchema.index({ owner: 1, createdAt: -1 });
  workspaceSchema.index({ "members.user": 1 });
  
  const Workspace = mongoose.model("Workspace", workspaceSchema);
  
  export default Workspace;