import rateLimit from "express-rate-limit";

const createLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
      success: false,
      message
    }
  });
};

// Login: 5 attempts per 15 minutes
export const loginLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  "Too many login attempts. Try again after 15 minutes."
);

// Forgot Password: 3 requests per 15 minutes
export const forgotPasswordLimiter = createLimiter(
  15 * 60 * 1000,
  3,
  "Too many password reset requests. Try again later."
);

// OTP Verification: 5 attempts per 15 minutes
export const verifyOtpLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  "Too many OTP verification attempts. Try again later."
);

// Reset Password: 5 requests per 15 minutes
export const resetPasswordLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  "Too many password reset attempts. Try again later."
);
