import express from 'express';

const router = express.Router();

// Return a proper response for the user endpoint
router.get('/', (req, res) => {
  // Return either a user object or a clear "not authenticated" response
  const isAuthenticated = req.session?.userId != null;
  
  if (isAuthenticated) {
    // Return actual user data
    return res.json({
      id: req.session.userId,
      username: req.session.username,
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

export default router; 