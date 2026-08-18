const express = require('express');
const {
  authSchoolUser,
  authInstructor,
  getInstructorSchools,
  selectInstructorSchool,
} = require('../controllers/schoolAuthController');

const router = express.Router();

router.post('/login/school', authSchoolUser);
router.post('/login/instructor', authInstructor);
router.get('/instructor/schools', getInstructorSchools);
router.post('/instructor/select-school', selectInstructorSchool);

module.exports = router;
