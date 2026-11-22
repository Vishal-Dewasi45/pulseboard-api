function errorHandler(err, req, res, next) {
   if (res.headersSent) return next(err);
 
   let status = err.statusCode || 500;
   let message = err.message;
   let code;
 
   if (err.name === "TokenExpiredError") { status = 401; code = "TOKEN_EXPIRED"; message = "Access token expired"; }
   else if (err.name === "JsonWebTokenError" || err.name === "NotBeforeError") { status = 401; code = "TOKEN_INVALID"; message = "Invalid token"; }
   else if (err.name === "ValidationError") { status = 400; message = Object.values(err.errors).map(e => e.message).join(", "); }
   else if (err.name === "CastError") { status = 400; message = "Invalid ID or value"; }
   else if (err.code === 11000) { status = 409; message = "Resource already exists"; }
   else if (err.type === "entity.parse.failed") { status = 400; message = "Malformed JSON"; }
 
   if (status >= 500) {
     console.error(err);
     if (process.env.NODE_ENV === "production") message = "Internal server error";
   }
 
   res.status(status).json({ success: false, message, ...(code && { code }) });
 }
 export default errorHandler;