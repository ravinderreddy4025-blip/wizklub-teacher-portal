/**
 * Cache invalidation disabled while Redis is omitted.
 */
const invalidateCache = () => (req, res, next) => next();

module.exports = invalidateCache;
