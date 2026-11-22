import express from "express";
import authCtrl from "../Controller/authController.js";
import { userValidator } from "../middleware/userValidation.js";
import {
    loginLimiter,forgotPasswordLimiter,verifyOtpLimiter,resetPasswordLimiter } from "../middleware/authLimiter.js";
import authMiddlewear from "../middleware/authMiddlewear.js";

const route = express.Router();
route.post("/register", userValidator, authCtrl.registration);

route.post("/login", loginLimiter, authCtrl.login);

route.post("/refresh", authCtrl.refreshAccessToken);

route.post("/logout", authCtrl.logout);

route.post("/forgot-password", forgotPasswordLimiter, authCtrl.forgotPassword);

route.post("/verify-reset-otp", verifyOtpLimiter, authCtrl.verifyResetOtp);

route.post("/reset-password", resetPasswordLimiter, authCtrl.resetPassword);

route.get("/me",authMiddlewear,authCtrl.me)

export default route;