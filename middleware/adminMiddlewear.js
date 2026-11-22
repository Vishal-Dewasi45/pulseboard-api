const adminHandler = (req, res, next) => {
  if (req.user?.role !== "admin") {
    const error = new Error("Access denied");
    error.statusCode = 403;
    return next(error);
  }
  next();
};
export default adminHandler;