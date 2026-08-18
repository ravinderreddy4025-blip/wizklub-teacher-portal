function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 50);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildSearchRegex(search) {
  const trimmed = search?.trim();
  if (!trimmed) return null;
  return new RegExp(escapeRegex(trimmed), 'i');
}

function paginatedMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

module.exports = {
  escapeRegex,
  parsePagination,
  buildSearchRegex,
  paginatedMeta,
};
