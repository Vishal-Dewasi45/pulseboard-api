import mongoose from "mongoose";

const userSchema= new mongoose.Schema({
  name:{
    type:String,
    required:true,
    trim:true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  age:{
    type:Number,
    required:true,
    min:18
  },
  password:{
    type:String,
    required:true,
    minlength:8
  },
  role:{
    type:String,
    enum:["user","admin"],
    default:"user"
  },
  refreshToken: {
    type: String,
    default: null
  },
  resetOtp: {
    type: String,
    default: null
  },
  resetOtpExpires: {
    type: Date,
    default: null
  },
  resetOtpAttempts: {
    type: Number,
    default: 0
  },
  
  // New fields for the single-use reset token
  resetTokenHash: {
    type: String,
    default: null
  },
  resetTokenExpires: {
    type: Date,
    default: null
  }
})

const User=mongoose.model("User",userSchema)

export default User