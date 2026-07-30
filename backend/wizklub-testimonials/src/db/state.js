let databaseReady = false

export function setDatabaseReady(ready) {
  databaseReady = ready
}

export function isDatabaseReady() {
  return databaseReady
}
