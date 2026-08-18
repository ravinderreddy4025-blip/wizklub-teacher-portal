/**
 * School Portal API module — mount on any Express app.
 *
 * Usage (monolith):
 *   const schoolPortal = require('./school-portal/backend');
 *   router.use('/school', schoolPortal.schoolRoutes);
 *   router.use('/auth', schoolPortal.schoolAuthRoutes); // merge with existing /auth router
 */
const schoolRoutes = require('./src/routes/schoolRoutes');
const schoolAuthRoutes = require('./src/routes/schoolAuthRoutes');
const schoolAuthController = require('./src/controllers/schoolAuthController');

module.exports = {
  schoolRoutes,
  schoolAuthRoutes,
  schoolAuthController,
  core: require('./core'),
};
