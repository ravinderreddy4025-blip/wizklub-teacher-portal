const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  // AES-GCM copy of the last generated AM password — admin-only, never used for login.
  passwordEncrypted: { type: String, select: false, default: null },
  role: { 
    type: String, 
    enum: ['Admin', 'AM', 'School', 'Dispatch'], 
    required: true 
  },
  divisionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Division',
    default: null
  },
  schoolId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'School',
    default: null
  }
}, { timestamps: true });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.passwordEncrypted;
    return ret;
  },
});

userSchema.index({ role: 1 });
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { role: { $in: ['Admin', 'AM', 'Dispatch'] } },
  }
);
userSchema.index(
  { schoolId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'School', schoolId: { $type: 'objectId' } },
  }
);
userSchema.index(
  { divisionId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'AM', divisionId: { $type: 'objectId' } },
  }
);

module.exports = mongoose.model('User', userSchema);
