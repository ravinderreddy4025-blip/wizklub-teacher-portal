const Dispatch = require('../models/Dispatch');

const updateDispatchStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingId } = req.body;

    // Support updating by either Mongo _id or the human-readable dispatchId.
    const dispatch = await Dispatch.findById(id) || await Dispatch.findOne({ dispatchId: id });
    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    if (status === 'Dispatched') {
      const tid = typeof trackingId === 'string' ? trackingId.trim() : '';
      if (!tid) {
        return res.status(400).json({ message: 'trackingId is required to mark as Dispatched' });
      }
      dispatch.trackingId = tid;
      dispatch.dispatchedBy = req.user?._id;
      dispatch.dispatchedAt = new Date();
    }

    dispatch.status = status;
    await dispatch.save();

    res.json(dispatch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPendingDispatches = async (req, res) => {
  try {
    const dispatches = await Dispatch.find({ status: 'Pending' })
      .populate('kit')
      .populate('school');

    // Backfill dispatchId for older records created before the field existed.
    const dispatchesNeedingId = dispatches.filter(d => !d.dispatchId);
    for (const d of dispatchesNeedingId) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { dispatchId: d._id.toString() } },
        { runValidators: false }
      );
    }

    // Backfill category for older records
    const dispatchesNeedingCategory = dispatches.filter(d => !d.category);
    for (const d of dispatchesNeedingCategory) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { category: 'New Dispatch' } },
        { runValidators: false }
      );
    }
    res.json(dispatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDispatchHistory = async (req, res) => {
  try {
    const dispatches = await Dispatch.find()
      .sort({ createdAt: -1 })
      .populate('kit')
      .populate('school');

    const dispatchesNeedingId = dispatches.filter(d => !d.dispatchId);
    for (const d of dispatchesNeedingId) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { dispatchId: d._id.toString() } },
        { runValidators: false }
      );
    }

    const dispatchesNeedingCategory = dispatches.filter(d => !d.category);
    for (const d of dispatchesNeedingCategory) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { category: 'New Dispatch' } },
        { runValidators: false }
      );
    }

    res.json(dispatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateDispatchKitId = async (req, res) => {
  try {
    const { id } = req.params;
    const { kitId } = req.body;

    const nextKitId = typeof kitId === 'string' ? kitId.trim() : '';
    if (!nextKitId) {
      return res.status(400).json({ message: 'kitId is required' });
    }

    // Support updating by either Mongo _id or dispatchId
    const dispatch = await Dispatch.findById(id) || await Dispatch.findOne({ dispatchId: id });
    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    dispatch.kitId = nextKitId;
    await dispatch.save();

    res.json(dispatch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { updateDispatchStatus, getPendingDispatches, getDispatchHistory, updateDispatchKitId };
