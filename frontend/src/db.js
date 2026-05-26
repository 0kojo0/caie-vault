/**
 * Offline storage using IndexedDB
 * Stores downloaded questions + user preferences
 */

const DB_NAME    = 'caie-vault'
const DB_VERSION = 1
const STORE_Q    = 'questions'
const STORE_META = 'meta'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_Q)) {
        const store = db.createObjectStore(STORE_Q, { keyPath: 'id', autoIncrement: true })
        store.createIndex('subject', 'subject', { unique: false })
        store.createIndex('level',   'level',   { unique: false })
        store.createIndex('year',    'year',     { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function saveQuestions(questions) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_Q, 'readwrite')
    const store = tx.objectStore(STORE_Q)
    questions.forEach(q => store.put(q))
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

export async function getAllQuestions() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_Q, 'readonly')
    const store = tx.objectStore(STORE_Q)
    const req   = store.getAll()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function clearQuestions() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_Q, 'readwrite')
    const store = tx.objectStore(STORE_Q)
    const req   = store.clear()
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}

export async function getQuestionCount() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_Q, 'readonly')
    const store = tx.objectStore(STORE_Q)
    const req   = store.count()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function saveMeta(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_META, 'readwrite')
    const store = tx.objectStore(STORE_META)
    store.put({ key, value })
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

export async function getMeta(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_META, 'readonly')
    const store = tx.objectStore(STORE_META)
    const req   = store.get(key)
    req.onsuccess = e => resolve(e.target.result?.value ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}
