import mongoose from 'mongoose'

const teacherSchema = new mongoose.Schema({
  _id: String,
  user_id: { type: String, required: true, unique: true },
  password_hash: { type: String, default: '' },
  full_name: { type: String, required: true },
}, { collection: 'teachers', timestamps: false })

const schoolSchema = new mongoose.Schema({
  _id: String,
  name: { type: String, required: true },
  branch_code: { type: String, default: null },
}, { collection: 'schools', timestamps: false })

const teacherSchoolAssignmentSchema = new mongoose.Schema({
  teacher_id: { type: String, required: true },
  school_id: { type: String, required: true },
}, { collection: 'teacher_school_assignments', timestamps: false })

teacherSchoolAssignmentSchema.index({ teacher_id: 1, school_id: 1 }, { unique: true })

const batchSchema = new mongoose.Schema({
  _id: String,
  school_id: { type: String, required: true },
  name: { type: String, required: true },
  grade: { type: String, default: null },
  section: { type: String, default: null },
  student_count: { type: Number, default: 0 },
}, { collection: 'batches', timestamps: false })

const studentSchema = new mongoose.Schema({
  _id: String,
  batch_id: { type: String, required: true },
  full_name: { type: String, required: true },
  roll_number: { type: String, required: true },
  image: { type: String, default: null },
}, { collection: 'students', timestamps: false })

const uploadSchema = new mongoose.Schema({
  _id: String,
  student_id: { type: String, required: true, index: true },
  teacher_id: { type: String, required: true },
  category: { type: String, required: true },
  media_type: { type: String, enum: ['photo', 'video'], required: true },
  blob_url: { type: String, required: true },
  blob_key: { type: String, required: true },
  file_path: { type: String, default: '' },
  file_size_bytes: { type: Number, required: true },
  duration_seconds: { type: Number, default: null },
  upload_source: { type: String, default: 'web' },
  status: { type: String, enum: ['draft', 'submitted'], required: true },
  created_at: { type: String, required: true },
  submitted_at: { type: String, default: null },
}, { collection: 'uploads', timestamps: false })

uploadSchema.index({ student_id: 1, category: 1, status: 1 })

const batchUploadSchema = new mongoose.Schema({
  _id: String,
  batch_id: { type: String, required: true },
  teacher_id: { type: String, required: true },
  media_type: { type: String, enum: ['photo', 'video'], required: true },
  blob_url: { type: String, required: true },
  blob_key: { type: String, required: true },
  file_path: { type: String, default: '' },
  file_size_bytes: { type: Number, required: true },
  upload_source: { type: String, default: 'web' },
  status: { type: String, enum: ['draft', 'submitted'], required: true },
  created_at: { type: String, required: true },
  submitted_at: { type: String, default: null },
}, { collection: 'batch_uploads', timestamps: false })

batchUploadSchema.index({ batch_id: 1, status: 1 })

export const Teacher = mongoose.model('Teacher', teacherSchema)
export const School = mongoose.model('School', schoolSchema)
export const TeacherSchoolAssignment = mongoose.model('TeacherSchoolAssignment', teacherSchoolAssignmentSchema)
export const Batch = mongoose.model('Batch', batchSchema)
export const Student = mongoose.model('Student', studentSchema)
export const Upload = mongoose.model('Upload', uploadSchema)
export const BatchUpload = mongoose.model('BatchUpload', batchUploadSchema)
