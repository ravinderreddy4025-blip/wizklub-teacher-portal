'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key';
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
process.env.ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ||
  '$2b$12$OYdG47JMJOhoHCmrXfcKkeoHeLKhHUgv7EZdi4DJMWW/wya4DuD1e';
process.env.STUDENT_FORM_SECRET =
  process.env.STUDENT_FORM_SECRET || 'test_student_form_secret_key_____';
