/**
 * In-memory cache stub. Redis is disabled for now.
 * Replace with a real cache implementation when needed later.
 */
class CacheService {
  static async get() {
    return null;
  }

  static async set() {
    return false;
  }

  static async del() {
    return false;
  }

  static async delByPattern() {
    return false;
  }
}

module.exports = CacheService;
