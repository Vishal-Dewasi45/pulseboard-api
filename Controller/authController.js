import bcrypt from "bcrypt"
import User from "../models/user.js"
import asyncHandler from "../middleware/asyncHandler.js"
import jwt from "jsonwebtoken"
import crypto from "crypto";
import sendOtpEmail from "../utils/sendOtpEmail.js";

const isProd = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const hashResetToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const registration=asyncHandler(async(req,res)=>{
   const {name,email,age,password} =req.body;
   const hashPassword=await bcrypt.hash(password,10)
   const user=await User.create({
     name,
     email,
     age,
     password:hashPassword
  })

   const userResponse = user.toObject();
   delete userResponse.password;
   res.status(201).json({
     message:"user created successfully",
     user:userResponse
   })
})
const login=asyncHandler(async(req,res)=>{
  const{email,password}=req.body;
  const user= await User.findOne({email})
  if(!user){
    return  res.status(400).json({
      success:false,
      error:"invalid email or password"
   })
  }
  const isPasswordExist = await bcrypt.compare(password,user.password)
  if(!isPasswordExist){
    return  res.status(400).json({
      success:false,
      error:"invalid email or password"
   })
  }
  const access_token=jwt.sign(
    { userId: user._id,
      role:user.role },
    process.env.JWT_SECRET,
    { expiresIn:"15m" }
    )
  const refresh_token=jwt.sign(
    {
      userId:user._id,
    },
    process.env.REFRESH_SECRET,
    { expiresIn:"7d"}
  );
  user.refreshToken = refresh_token;
  await user.save();

  // Send refresh token as HttpOnly cookie
  res.cookie("refreshToken", refresh_token, cookieOptions);
    res.status(200).json({
      message: "Login successful",
      accessToken: access_token
    });
  
})
const refreshAccessToken = asyncHandler(async (req, res) => {

  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    const error = new Error("Refresh token not found");
    error.statusCode = 401;
    throw error;
  }

  const decoded = jwt.verify(
    refreshToken,
    process.env.REFRESH_SECRET
  );

  const user = await User.findById(decoded.userId);

  if (!user || user.refreshToken !== refreshToken) {
    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }

  const accessToken = jwt.sign(
    {
      userId: user._id,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15m"
    }
  );

  res.status(200).json({
    accessToken
  });
});
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    await User.findOneAndUpdate(
      { refreshToken },
      { refreshToken: null }
    );
  }
  const { maxAge, ...clearOpts } = cookieOptions;
  res.clearCookie("refreshToken", clearOpts);
  
  res.status(200).json({
    message: "Logout successful"
  });
});
const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email"
    });
  }

  const user = await User.findOne({ email });

  // Don't reveal whether an account exists.
  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If an account exists, an OTP has been sent."
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  user.resetOtp = await bcrypt.hash(otp, 10);
  user.resetOtpExpires = new Date(Date.now() + 5 * 60 * 1000);
  user.resetOtpAttempts = 0;

  // Invalidate any previous reset token.
  user.resetTokenHash = null;
  user.resetTokenExpires = null;

  await user.save();

  try {
    await sendOtpEmail(user.email, otp);
  } catch (error) {
    // Clear only the OTP created by this request.
    user.resetOtp = null;
    user.resetOtpExpires = null;
    user.resetOtpAttempts = 0;
    await user.save();

    throw error;
  }

  return res.status(200).json({
    success: true,
    message: "If an account exists, an OTP has been sent."
  });
});

const verifyResetOtp = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const { otp } = req.body;

  if (!email || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email or OTP"
    });
  }

  const user = await User.findOne({ email });

  if (!user || !user.resetOtp || !user.resetOtpExpires) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP"
    });
  }

  if (user.resetOtpExpires <= new Date()) {
    return res.status(400).json({
      success: false,
      message: "OTP has expired. Please request a new one."
    });
  }

  if (user.resetOtpAttempts >= 5) {
    return res.status(429).json({
      success: false,
      message: "Too many incorrect attempts. Request a new OTP."
    });
  }

  const isValid = await bcrypt.compare(otp, user.resetOtp);

  if (!isValid) {
    user.resetOtpAttempts += 1;
    await user.save();

    return res.status(400).json({
      success: false,
      message: "Invalid OTP"
    });
  }

  // Generate a random 256-bit reset token.
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = hashResetToken(resetToken);

  // Atomically consume the OTP and issue the reset token.
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      resetOtp: user.resetOtp,
      resetOtpExpires: { $gt: new Date() },
      resetOtpAttempts: { $lt: 5 }
    },
    {
      $set: {
        resetTokenHash,
        resetTokenExpires: new Date(Date.now() + 10 * 60 * 1000),
        resetOtp: null,
        resetOtpExpires: null,
        resetOtpAttempts: 0
      }
    },
    { new: true }
  );

  if (!updatedUser) {
    return res.status(400).json({
      success: false,
      message: "OTP is invalid or has already been used."
    });
  }

  return res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    resetToken
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword, confirmPassword } = req.body;

  if (
    typeof resetToken !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "All fields are required."
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must contain at least 8 characters."
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Passwords do not match."
    });
  }

  const resetTokenHash = hashResetToken(resetToken);
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Match and consume the token in one atomic database operation.
  const user = await User.findOneAndUpdate(
    {
      resetTokenHash,
      resetTokenExpires: { $gt: new Date() }
    },
    {
      $set: {
        password: hashedPassword,
        resetTokenHash: null,
        resetTokenExpires: null,
        resetOtp: null,
        resetOtpExpires: null,
        resetOtpAttempts: 0,
        refreshToken: null
      }
    },
    { new: true, runValidators: true }
  );

  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired reset token. Please verify your OTP again."
    });
  }

  return res.status(200).json({
    success: true,
    message: "Password reset successfully. Please login again."
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId).select("name email role");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 401;
    throw error;
  }
  res.status(200).json({ success: true, user });
});

export default {
  registration,
  login,
  refreshAccessToken,
  logout,
   forgotPassword,
   verifyResetOtp,
   resetPassword,
   me
};