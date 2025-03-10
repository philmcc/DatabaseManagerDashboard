import express from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import { users } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Get current user info
router.get('/me', (req, res) => {
  // Return either a user object or a clear "not authenticated" response
  if (req.isAuthenticated() && req.user) {
    // Return actual user data
    return res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      isLoggedIn: true
    });
  } else {
    // Return a clear "not authenticated" response
    return res.status(401).json({
      isLoggedIn: false,
      message: "Not authenticated"
    });
  }
});

// Get all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const allUsers = await db.query.users.findMany({
      orderBy: (users, { desc }) => [desc(users.createdAt)]
    });
    
    // Filter out sensitive information
    const filteredUsers = allUsers.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      approved: user.approved
    }));
    
    return res.json(filteredUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to fetch users'
    });
  }
});

// Update user role (admin only)
router.patch('/:id/role', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!role || !['ADMIN', 'WRITER', 'READER'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    // Update the user
    await db.update(users)
      .set({ 
        role, 
        updatedAt: new Date() 
      })
      .where(eq(users.id, parseInt(id)));
      
    return res.json({ 
      success: true, 
      message: 'Role updated successfully' 
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to update role'
    });
  }
});

// Approve a user (admin only)
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update the user
    await db.update(users)
      .set({ 
        approved: true, 
        updatedAt: new Date() 
      })
      .where(eq(users.id, parseInt(id)));
      
    return res.json({ 
      success: true, 
      message: 'User approved successfully' 
    });
  } catch (error) {
    console.error('Error approving user:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to approve user'
    });
  }
});

export default router; 