const auditWorkflowService = require('../services/auditWorkflowService');
const { populateAuditRelations, findAuditByIdPopulated } = require('../utils/auditQuery');
const { fileUrl } = require('../utils/mediaUrl');
const { getAmDivisions } = require('../utils/divisionManager');

async function requireAmDivisionIds(user) {
  const divisions = await getAmDivisions(user);
  if (!divisions.length) {
    const error = new Error('Account Manager is not assigned to a division');
    error.status = 400;
    throw error;
  }
  return divisions.map((d) => d._id);
}

const approveAudit = async (req, res) => {
  try {
    const divisionIds = await requireAmDivisionIds(req.user);
    const { id } = req.params;
    const amNotes = req.body.amNotes ?? req.body.rmNotes ?? '';
    const AuditReport = require('../models/AuditReport');
    const audit = await AuditReport.findById(id);
    if (!audit) return res.status(404).json({ message: 'Audit report not found' });

    await auditWorkflowService.assertAuditInDivision(audit, divisionIds);
    const lineType = req.body.lineType || null;
    await auditWorkflowService.approveAuditByAm(id, req.user._id, amNotes, lineType);
    const updated = await findAuditByIdPopulated(id);
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const rejectAudit = async (req, res) => {
  try {
    const divisionIds = await requireAmDivisionIds(req.user);
    const { id } = req.params;
    const amNotes = req.body.amNotes ?? req.body.rmNotes ?? '';
    const AuditReport = require('../models/AuditReport');
    const audit = await AuditReport.findById(id);
    if (!audit) return res.status(404).json({ message: 'Audit report not found' });

    await auditWorkflowService.assertAuditInDivision(audit, divisionIds);
    const lineType = req.body.lineType || null;
    await auditWorkflowService.rejectAuditByAm(id, req.user._id, amNotes, lineType);
    const updated = await findAuditByIdPopulated(id);
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const approveAuditAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const adminNotes = req.body.adminNotes ?? '';
    await auditWorkflowService.approveAuditByAdmin(id, req.user._id, adminNotes);
    const updated = await findAuditByIdPopulated(id);
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const rejectAuditAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const adminNotes = req.body.adminNotes ?? '';
    await auditWorkflowService.rejectAuditByAdmin(id, req.user._id, adminNotes);
    const updated = await findAuditByIdPopulated(id);
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const dispatchAuditKit = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemIndex, type, consignmentNo, dispatchDetails, reportingManager } = req.body;
    if (!['lost', 'damaged'].includes(type)) {
      return res.status(400).json({ message: 'type must be lost or damaged' });
    }
    if (itemIndex === undefined || itemIndex === null) {
      return res.status(400).json({ message: 'itemIndex is required' });
    }

    const dispatchProofUrl = fileUrl(req.file) || undefined;

    const result = await auditWorkflowService.dispatchAuditReplacement(
      id,
      Number(itemIndex),
      type,
      req.user._id,
      { consignmentNo, dispatchDetails, reportingManager, dispatchProofUrl }
    );
    const audit = await findAuditByIdPopulated(id);
    res.status(201).json({ ...result, audit });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

module.exports = {
  approveAudit,
  rejectAudit,
  approveAuditAdmin,
  rejectAuditAdmin,
  dispatchAuditKit,
};
