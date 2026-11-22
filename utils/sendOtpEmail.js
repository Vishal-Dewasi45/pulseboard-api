import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendOtpEmail = async (email, otp) => {
  await transporter.sendMail({
    from: `"PulseBoard" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "PulseBoard - Password Reset OTP",

    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Reset Your Password</h2>

        <p>We received a request to reset your PulseBoard password.</p>

        <h1 style="letter-spacing: 8px;">${otp}</h1>

        <p>This OTP expires in 5 minutes.</p>

        <p>If you did not request this, you can ignore this email.</p>

        <p>PulseBoard Team</p>
      </div>
    `
  });
};

export default sendOtpEmail;