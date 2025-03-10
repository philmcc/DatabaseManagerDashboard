import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { users } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { verify } from '../lib/crypto';
import { logger } from '../utils/logger';

export function setupPassport() {
  // Local Strategy
  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      // Find the user by username
      const user = await db.query.users.findFirst({
        where: eq(users.username, username)
      });
      
      // User not found
      if (!user) {
        logger.info(`Login failed: User ${username} not found`);
        return done(null, false, { message: 'Invalid username or password' });
      }
      
      // Verify password
      const isValid = await verify(password, user.password);
      
      if (!isValid) {
        logger.info(`Login failed: Invalid password for ${username}`);
        return done(null, false, { message: 'Invalid username or password' });
      }
      
      // Success - only log basic information
      logger.info(`User logged in: ${username}`);
      
      // Remove sensitive data before returning
      const { password: _, ...safeUser } = user;
      return done(null, safeUser);
    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      return done(error);
    }
  }));
  
  // Serialization - store only the user ID in the session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });
  
  // Deserialization - retrieve user by ID
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, id)
      });
      
      if (!user) {
        // Only log when a user session exists but the user can't be found
        logger.warn(`Session user not found: ID ${id}`);
        return done(null, false);
      }
      
      // Remove sensitive data
      const { password, ...safeUser } = user;
      
      // Add role helpers
      const userWithHelpers = {
        ...safeUser,
        isAdmin: user.role === 'ADMIN',
        isWriter: user.role === 'ADMIN' || user.role === 'WRITER'
      };
      
      // No logging during normal deserialization
      return done(null, userWithHelpers);
    } catch (error) {
      // Only log actual errors
      logger.error(`Deserialization error: ${error.message}`);
      return done(error);
    }
  });
  
  return passport;
} 