import mongoose, { isValidObjectId } from "mongoose";
import Workspace from "../models/workspace.js";
import Task from "../models/tasks.js";
import asyncHandler from "../middleware/asyncHandler.js";

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const searchTask=asyncHandler(async(req,res)=>{
     const {workspaceId}=req.params;
     const userId=req.user?.userId;
     const {
        q="",
        status,
        priority,
        assignee,
        project,
        page="1",
        limit="20"
     }=req.query;

     if(!mongoose.isValidObjectId(workspaceId)){
        return res.status(400).json({
        success:false,
        msg:"workspace not found"
        })
     }

     const workspace= await Workspace.exists({
        _id:workspaceId,
        "members.user":userId
     })

     if(!workspace){
        return res.status(400)({
            success:false,
            msg:"Workspace not found or access denied"
        })
     }

     if(typeof q !== "string" || q.trim().length>100){
       return res.status(400)({
        success:false,
        msg:"search query can have max 100 character"
    })
 }

 const allowedStatus=[
    "todo",
    "in_progress",
    "blocked",
    "done"
 ];
 const allowedpriorities=[
    "low",
    "medium",
    "high",
    "urgent"
 ];
 if (status && !allowedStatus.includes(status)){
    return res.status(400).json({
        success: false,
        message: "Invalid status filter",
      });
 }
 if(priority && !allowedpriorities.includes(priority)){
    return res.status(400).json({
        success: false,
        message: "Invalid priority filter",
      });
 }
 if(assignee && assignee !=="unassigned" && !mongoose.isValidObjectId(assignee)){
    return res.status(400).json({
        success: false,
        message: "Invalid assigne ID",
      });
 }
 if(project && !mongoose.isValidObjectId(project)){
    return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
 }

 const pageNumber= Number(page)
 const pageSize= Number(limit)

 if(
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
 ){
    return res.status(400).json({
        success: false,
        message: "Invalid page or limit",
      });
 }

 const filter ={
    workspace: new mongoose.Types.ObjectId(workspaceId)
 }

 if (q.trim()) {
    const searchRegex = new RegExp(escapeRegex(q.trim()), "i");
 
 filter.$or= [
    {title:searchRegex},
    {description:searchRegex}
 ]
}

if (status) filter.status = status;

if (priority) filter.priority = priority;

if(project){
 filter.project= new mongoose.Types.ObjectId(project);
}
const { dueFrom, dueTo } = req.query;
if (dueFrom || dueTo) {
  filter.dueDate = {};
  if (dueFrom) {
    const d = new Date(dueFrom);
    if (isNaN(d)) return res.status(400).json({ success: false, message: "Invalid dueFrom" });
    filter.dueDate.$gte = d;
  }
  if (dueTo) {
    const d = new Date(dueTo);
    if (isNaN(d)) return res.status(400).json({ success: false, message: "Invalid dueTo" });
    filter.dueDate.$lte = d;
  }
}
if(assignee === "unassigned"){
    filter.assigne === null;
}
else if (assignee){
   filter.assignee=new mongoose.Types.ObjectId(assignee);
}
const [tasks,total]= await Promise.all([
    Task.find(filter)
    .populate("project","name status color")
    .populate("assignee","name email")
    .sort({updatedAt: -1, _id:-1})
    .skip((pageNumber -1) * pageSize)
    .limit(pageSize)
    .lean(),

    Task.countDocuments(filter),
])

return res.status(201).json({
    success:true,

    pagination:{
        total,
        page:pageNumber,
        limit:pageSize,
        totalPages:Math.ceil(total/pageSize),
        hasNextPage: pageNumber * pageSize < total,
        hasPrevPage: pageNumber > 1,
    },

    tasks
})
  })

  export { searchTask };