import express from 'express';
import passport from 'passport';
import { users } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { hash } from '../../lib/crypto';

const router = express.Router();

// Login endpoint
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: info?.message || 'Authentication failed'
      });
    }
    
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      
      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    });
  })(req, res, next);
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false,
        message: 'Logout failed'
      });
    }
    
    res.json({ 
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username)
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists'
      });
    }
    
    // Create new user
    const hashedPassword = await hash(password);
    
    const [newUser] = await db.insert(users).values({
      username,
      password: hashedPassword,
      role: 'READER',
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Registration failed'
    });
  }
});

export default router; 