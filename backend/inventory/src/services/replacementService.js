const ReplacementRequest = require('../models/ReplacementRequest');

const createRequest = async (schoolId, requestedBy, kitId, type, quantity, reasonDetails, imageUrl) => {
  let status = 'Pending Admin Approval';
  if (type === 'Lost') {
    status = 'Pending AM Approval';
  }

  const request = await ReplacementRequest.create({
    school: schoolId,
    requestedBy,
    kit: kitId,
    type,
    quantity,
    reasonDetails,
    imageUrl, // only applies for Damaged
    status
  });

  return request;
};

module.exports = { createRequest };
