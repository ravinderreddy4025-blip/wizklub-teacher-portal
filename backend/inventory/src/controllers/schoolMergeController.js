const {
  previewSchoolMerge,
  mergeSchools,
  listMergeLogs,
} = require('../services/schoolMergeService');

const previewSchoolMergeHandler = async (req, res) => {
  try {
    const { primarySchoolId, secondarySchoolId } = req.body;
    const preview = await previewSchoolMerge({ primarySchoolId, secondarySchoolId });
    res.json(preview);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message, details: error.details || null });
  }
};

const executeSchoolMergeHandler = async (req, res) => {
  try {
    const {
      primarySchoolId,
      secondarySchoolId,
      identitySource,
      customIdentity,
      finalDivisionId,
      finalAmId,
    } = req.body;

    const result = await mergeSchools({
      primarySchoolId,
      secondarySchoolId,
      identitySource,
      customIdentity,
      finalDivisionId,
      finalAmId,
      performedBy: req.user._id,
    });

    res.json({
      message: 'Schools merged successfully',
      school: result.school,
      mergeLog: result.mergeLog,
      transferred: result.transferred,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message, details: error.details || null });
  }
};

const listSchoolMergeLogsHandler = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await listMergeLogs({ limit });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  previewSchoolMerge: previewSchoolMergeHandler,
  executeSchoolMerge: executeSchoolMergeHandler,
  listSchoolMergeLogs: listSchoolMergeLogsHandler,
};
