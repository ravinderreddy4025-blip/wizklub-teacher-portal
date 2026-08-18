function serializeAM(user) {
  if (!user) return null;
  const hasRecoverablePassword = Boolean(user.passwordEncrypted);
  const obj = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    _id: obj._id,
    name: obj.name,
    email: obj.email,
    role: obj.role,
    divisionId: obj.divisionId,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    hasRecoverablePassword,
  };
}

function serializeAMList(users = []) {
  return users.map(serializeAM);
}

module.exports = { serializeAM, serializeAMList };
