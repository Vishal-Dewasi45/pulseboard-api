import jwt from "jsonwebtoken";

function authMiddlewear(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const error = new Error("Authorization error");
      error.statusCode = 401;
      throw error;
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

    req.user = decoded;

    next();

  } catch (error) {
    next(error);
  }
}

export default authMiddlewear;