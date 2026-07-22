import mongoose from 'mongoose'

const teacherLoginSchema = new mongoose.Schema({
  _id: String,
  user_id: { type: String, required: true, unique: true },
  password_hash: { type: String, default: '' },
  full_name: { type: String, required: true },
  last_login_at: { type: String, default: null },
}, { collection: 'teacher_login', timestamps: false })

const schoolSchema = new mongoose.Schema({
  _id: String,
  name: { type: String, required: true },
  branch_code: { type: String, default: null },
}, { collection: 'schools', timestamps: false, autoCreate: false, autoIndex: false })

const teacherSchoolAssignmentSchema = new mongoose.Schema({
  teacher_id: { type: String, required: true },
  school_id: { type: String, required: true },
}, { collection: 'teacher_school_assignments', timestamps: false })

teacherSchoolAssignmentSchema.index({ teacher_id: 1, school_id: 1 }, { unique: true })

const batchSchema = new mongoose.Schema({
  _id: String,
  school_id: { type: String, required: true },
  teacher_id: { type: String, required: true, index: true },
  name: { type: String, required: true },
  grade: { type: String, default: null },
  section: { type: String, default: null },
  student_count: { type: Number, default: 0 },
}, { collection: 'batches', timestamps: false, autoCreate: false, autoIndex: false })

const studentSchema = new mongoose.Schema({
  _id: String,
  batch_id: { type: String, required: true },
  full_name: { type: String, required: true },
  roll_number: { type: String, required: true },
  image: { type: String, default: null },
}, { collection: 'students', timestamps: false, autoCreate: false, autoIndex: false })

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
}, { collection: 'batch_group_uploads', timestamps: false })

batchUploadSchema.index({ batch_id: 1, status: 1 })

const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
}, { collection: 'counters', timestamps: false })

const feedbackAttachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], required: true },
  filename: { type: String, required: true },
  uploaded_at: { type: Date, required: true },
}, { _id: false })

const feedbackSchema = new mongoose.Schema({
  feedback_id: { type: String, required: true, unique: true },
  school_id: { type: String, default: '', index: true },
  school_name: { type: String, default: '' },
  batch_id: { type: String, default: '' },
  batch_name: { type: String, default: '' },
  teacher_id: { type: String, required: true, index: true },
  teacher_name: { type: String, default: '' },
  category: {
    type: String,
    enum: ['tech_issue', 'content_issue', 'other'],
    default: 'other',
  },
  summary: { type: String, required: true },
  attachments: { type: [feedbackAttachmentSchema], default: [] },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved'],
    default: 'open',
    index: true,
  },
  priority: {
    type: String,
    enum: { values: ['low', 'medium', 'high'], message: 'Invalid priority' },
    default: undefined,
    required: false,
  },
  created_at: { type: Date, required: true, index: true },
  updated_at: { type: Date, required: true },
  resolved_at: { type: Date, default: null },
  resolution_note: { type: String, default: '' },
}, { collection: 'feedbacks', timestamps: false })

export const TeacherLogin = mongoose.model('TeacherLogin', teacherLoginSchema)
export const School = mongoose.model('School', schoolSchema)
export const TeacherSchoolAssignment = mongoose.model('TeacherSchoolAssignment', teacherSchoolAssignmentSchema)
export const Batch = mongoose.model('Batch', batchSchema)
export const Student = mongoose.model('Student', studentSchema)
export const Upload = mongoose.model('Upload', uploadSchema)
export const BatchUpload = mongoose.model('BatchUpload', batchUploadSchema)
export const Counter = mongoose.model('Counter', counterSchema)
export const Feedback = mongoose.model('Feedback', feedbackSchema)
