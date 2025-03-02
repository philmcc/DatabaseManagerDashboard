import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db } from "@db";
import { eq, sql, and } from "drizzle-orm";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect password." });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res
          .status(400)
          .send("Invalid input: " + result.error.issues.map(i => i.message).join(", "));
      }

      const { username, password } = result.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Check if this is the first user
      const [firstUser] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);
      const isFirstUser = firstUser?.count === 0;

      // Hash the password
      const hashedPassword = await crypto.hash(password);

      // Create the new user with admin role and auto-approval if first user
      const [newUser] = await db
        .insert(users)
        .values({
          ...result.data,
          password: hashedPassword,
          role: isFirstUser ? 'ADMIN' : 'READER',
          isApproved: isFirstUser,
          approvedAt: isFirstUser ? new Date() : null,
        })
        .returning();

      // If this is the first user, we need to set them as their own approver
      if (isFirstUser) {
        await db
          .update(users)
          .set({ approvedBy: newUser.id })
          .where(eq(users.id, newUser.id));
      }

      req.login(newUser, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          message: "Registration successful",
          user: { id: newUser.id, username: newUser.username },
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .send("Invalid input: " + result.error.issues.map(i => i.message).join(", "));
    }

    const cb = (err: any, user: Express.User, info: IVerifyOptions) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.status(400).send(info.message ?? "Login failed");
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }

        return res.json({
          message: "Login successful",
          user: { id: user.id, username: user.username },
        });
      });
    };
    passport.authenticate("local", cb)(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).send("Logout failed");
      }

      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }

    res.status(401).send("Not logged in");
  });

  app.post("/api/forgot-password", async (req, res) => {
    try {
      console.log("Forgot password request received:", req.body);
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).send("Email is required");
      }

      // Find the user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      // Don't reveal if user exists or not for security
      if (!user) {
        console.log("User not found, but returning success for security");
        return res.status(200).send("If an account exists with that email, you will receive reset instructions.");
      }

      // Generate reset token and set expiry (24 hours from now)
      const resetToken = randomUUID();
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      console.log(`Generated reset token for user ${user.id}: ${resetToken}`);

      // Update user with reset token
      await db
        .update(users)
        .set({
          resetToken,
          resetTokenExpiry,
        })
        .where(eq(users.id, user.id));

      // Check if email configuration is available
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log("Email configuration missing, skipping email send");
        // For development, log the reset URL
        const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password#${resetToken}`;
        console.log(`Reset URL (would be emailed): ${resetUrl}`);
        
        return res.status(200).send("If an account exists with that email, you will receive reset instructions.");
      }

      // Create reset URL with token in hash
      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password#${resetToken}`;

      try {
        // Send email with reset link
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.username,
          subject: "Password Reset Request",
          text: `You requested a password reset. Please use the following link to reset your password: ${resetUrl}`,
          html: `
            <p>You requested a password reset.</p>
            <p>Please use the following link to reset your password:</p>
            <a href="${resetUrl}">Reset Password</a>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `,
        });
        console.log(`Reset email sent to ${user.username}`);
      } catch (emailError) {
        console.error("Error sending reset email:", emailError);
        // Don't fail the request if email sending fails
        // Just log it and continue
      }

      res.status(200).send("If an account exists with that email, you will receive reset instructions.");
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).send("Error processing password reset request");
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      console.log("Reset password request received:", req.body);
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).send("Token and password are required");
      }

      // Find user with this reset token and valid expiry
      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.resetToken, token),
            sql`${users.resetTokenExpiry} > NOW()`
          )
        )
        .limit(1);

      if (!user) {
        console.log("Invalid or expired reset token");
        return res.status(400).send("Invalid or expired reset token");
      }

      console.log(`Valid reset token for user ${user.id}`);

      // Hash the new password
      const hashedPassword = await crypto.hash(password);

      // Update user with new password and clear reset token
      await db
        .update(users)
        .set({
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        })
        .where(eq(users.id, user.id));

      console.log(`Password reset successful for user ${user.id}`);
      res.status(200).send("Password has been reset successfully");
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).send("Error resetting password");
    }
  });
}