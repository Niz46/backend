// controllers/userController.js
const User = require('../models/User');

/**
 * @desc    Get all users (admin only)
 * @route   GET /api/users
 * @access  Private (admin)
 */
const getAllUsers = async (req, res) => {
  try {
    // We assume req.user was populated by auth middleware
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admins only.' });
    }

    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
};

module.exports = { getAllUsers };
