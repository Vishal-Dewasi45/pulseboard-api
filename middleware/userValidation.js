import {body, validationResult } from "express-validator";

export const userValidator=[
    body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

    body("email")
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Enter valid email"),

    body("age")
    .isInt({min:18})
    .withMessage("Age should be above 18"),


  body("password")
  .isLength({ min: 6 })
  .withMessage("Password must be at least 6 characters"),

    (req, res, next) => {

        const errors = validationResult(req);
    
        if (!errors.isEmpty()) {
          return res.status(400).json({
            errors: errors.array()
          });
        }
    
        next();
    }
]