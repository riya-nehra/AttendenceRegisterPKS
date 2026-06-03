import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { createWorker } from 'tesseract.js'
import { db, isFirebaseConfigured } from './firebase'
import './App.css'

const STORAGE_KEY = 'attendance-home-data'
const FIRESTORE_COLLECTION = 'attendanceRegisters'
const FIRESTORE_DOC_ID = 'main'
const ADMIN_PASSWORD = 'PKSDDSTHA'
const DEFAULT_CATEGORY_IDS = new Set(DEFAULT_CLASS_SLOTS.map((slot) => slot.id))
const NON_NAME_WORDS = new Set([
  'emoji',
  'sticker',
  'face',
  'heart',
  'star',
  'fire',
  'smile',
  'smiling',
  'laugh',
  'laughing',
  'sad',
  'happy',
  'love',
  'like',
  'thumb',
  'thumbs',
])
const MIN_NAME_WORD_LENGTH = 3
const ALLOWED_SHORT_NAME_WORDS = new Set(['ji'])
const DEFAULT_CLASS_SLOTS = [
  {
    id: 'sarbat-da-bhala-class-1',
    name: 'Sarbat Da Bhala Class 1',
    time: '2:30 AM - 3:10 AM',
    names: ['abc', 'def', 'sde'],
  },
  {
    id: 'sarbat-da-bhala-class-2',
    name: 'Sarbat Da Bhala Class 2',
    time: '3:10 AM - 3:50 AM',
    names: ['ghi', 'jkl', 'mno'],
  },
  {
    id: 'sarbat-da-bhala-class-3',
    name: 'Sarbat Da Bhala Class 3',
    time: '3:50 AM - 4:30 AM',
    names: ['pqr', 'stu', 'vwx'],
  },
  {
    id: 'sarbat-da-bhala-class-4',
    name: 'Sarbat Da Bhala Class 4',
    time: '4:30 AM - 5:10 AM',
    names: ['yza', 'bcd', 'efg'],
  },
  {
    id: 'sarbat-da-bhala-class-5',
    name: 'Sarbat Da Bhala Class 5',
    time: '5:10 AM - 5:50 AM',
    names: ['hij', 'klm', 'nop'],
  },
]

function getTodayKey() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatReadableDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateKey}T00:00:00`))
}

function getCategoryTime(category, dateKey) {
  return category?.timesByDate?.[dateKey] ?? category?.time ?? ''
}

function createInitialCategories() {
  const today = getTodayKey()

  return DEFAULT_CLASS_SLOTS.map((slot) => ({
    id: slot.id,
    name: slot.name,
    time: slot.time,
    timesByDate: {
      [today]: slot.time,
    },
    entries: slot.names.map((name) => ({
      id: crypto.randomUUID(),
      date: today,
      name,
    })),
  }))
}

function cleanNameLine(line) {
  const withoutEmoji = line
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, '')
    .replace(/^\s*[\d).\-\u2022*]+\s*/, '')
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = withoutEmoji
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{M}]/gu, ''))
    .filter((word) => {
      const letters = word.match(/[\p{L}\p{M}]/gu) ?? []
      const normalizedWord = word.toLowerCase()
      const isRepeatedArtifact = /^([\p{L}\p{M}])\1+$/u.test(normalizedWord)
      const isAllowedShortWord = ALLOWED_SHORT_NAME_WORDS.has(normalizedWord)

      return (letters.length >= MIN_NAME_WORD_LENGTH || isAllowedShortWord) && !isRepeatedArtifact
    })

  if (words.length === 0 || words.length > 5) {
    return ''
  }

  const hasStickerWord = words.some((word) => NON_NAME_WORDS.has(word.toLowerCase()))

  if (hasStickerWord) {
    return ''
  }

  return words.join(' ')
}

function extractNames(text) {
  const names = text
    .split(/[\r\n,;]+/)
    .map(cleanNameLine)
    .filter(Boolean)

  return [...new Set(names)]
}

function mergeDefaultCategories(categories, deletedDefaultCategoryIds = []) {
  const storedCategories = Array.isArray(categories) ? categories : []
  const defaultCategories = createInitialCategories()
  const storedIds = new Set(storedCategories.map((category) => category.id))
  const deletedDefaultIds = new Set(deletedDefaultCategoryIds)
  const missingDefaults = defaultCategories.filter(
    (category) => !storedIds.has(category.id) && !deletedDefaultIds.has(category.id),
  )

  return [
    ...storedCategories.map((category) => ({
      ...category,
      timesByDate:
        category.timesByDate && typeof category.timesByDate === 'object'
          ? category.timesByDate
          : {},
      entries: Array.isArray(category.entries) ? category.entries : [],
    })),
    ...missingDefaults,
  ]
}

function parseStoredRegister() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : null

    if (Array.isArray(parsed)) {
      return {
        categories: mergeDefaultCategories(parsed),
        deletedDefaultCategoryIds: [],
      }
    }

    const deletedDefaultCategoryIds = Array.isArray(parsed?.deletedDefaultCategoryIds)
      ? parsed.deletedDefaultCategoryIds
      : []

    return {
      categories: parsed?.categories
        ? mergeDefaultCategories(parsed.categories, deletedDefaultCategoryIds)
        : createInitialCategories(),
      deletedDefaultCategoryIds,
    }
  } catch {
    return {
      categories: createInitialCategories(),
      deletedDefaultCategoryIds: [],
    }
  }
}

function writeStoredRegister(categories, deletedDefaultCategoryIds) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categories,
      deletedDefaultCategoryIds,
    }),
  )
}

function App() {
  const todayKey = getTodayKey()
  const storedRegister = useMemo(parseStoredRegister, [])
  const isApplyingRemoteData = useRef(false)
  const hasLoadedFirestore = useRef(false)
  const [mode, setMode] = useState('viewer')
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [categories, setCategories] = useState(storedRegister.categories)
  const latestCategories = useRef(categories)
  const [deletedDefaultCategoryIds, setDeletedDefaultCategoryIds] = useState(
    storedRegister.deletedDefaultCategoryIds,
  )
  const latestDeletedDefaultCategoryIds = useRef(deletedDefaultCategoryIds)
  const [syncStatus, setSyncStatus] = useState(
    isFirebaseConfigured ? 'Connecting to Firestore...' : 'Using local browser storage.',
  )
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryTime, setCategoryTime] = useState('')
  const [entryName, setEntryName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [isOcrReading, setIsOcrReading] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [imageToRead, setImageToRead] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 })

  useEffect(() => {
    latestCategories.current = categories
  }, [categories])

  useEffect(() => {
    latestDeletedDefaultCategoryIds.current = deletedDefaultCategoryIds
  }, [deletedDefaultCategoryIds])

  useEffect(() => {
    if (!db) {
      return undefined
    }

    const registerRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID)

    return onSnapshot(
      registerRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const registerData = snapshot.data()
          const nextDeletedDefaultCategoryIds = Array.isArray(
            registerData.deletedDefaultCategoryIds,
          )
            ? registerData.deletedDefaultCategoryIds
            : []
          const nextCategories = mergeDefaultCategories(
            registerData.categories,
            nextDeletedDefaultCategoryIds,
          )

          isApplyingRemoteData.current = true
          hasLoadedFirestore.current = true
          setCategories(nextCategories)
          setDeletedDefaultCategoryIds(nextDeletedDefaultCategoryIds)
          writeStoredRegister(nextCategories, nextDeletedDefaultCategoryIds)
          setSyncStatus('Synced with Firestore.')
          return
        }

        hasLoadedFirestore.current = true
        setSyncStatus('Creating Firestore register...')

        try {
          await setDoc(registerRef, {
            categories: latestCategories.current,
            deletedDefaultCategoryIds: latestDeletedDefaultCategoryIds.current,
            updatedAt: serverTimestamp(),
          })
          setSyncStatus('Synced with Firestore.')
        } catch {
          setSyncStatus('Could not create Firestore register. Using local copy for now.')
        }
      },
      () => {
        setSyncStatus('Firestore unavailable. Using local copy for now.')
      },
    )
  }, [])

  useEffect(() => {
    writeStoredRegister(categories, deletedDefaultCategoryIds)

    if (isApplyingRemoteData.current) {
      isApplyingRemoteData.current = false
      return
    }

    if (!db) {
      return
    }

    if (!hasLoadedFirestore.current) {
      return
    }

    const saveCategories = async () => {
      try {
        await setDoc(doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID), {
          categories,
          deletedDefaultCategoryIds,
          updatedAt: serverTimestamp(),
        })
        setSyncStatus('Synced with Firestore.')
      } catch {
        setSyncStatus('Could not save to Firestore. Saved in this browser for now.')
      }
    }

    saveCategories()
  }, [categories, deletedDefaultCategoryIds])

  useEffect(() => {
    return () => {
      if (imageToRead?.url) {
        URL.revokeObjectURL(imageToRead.url)
      }
    }
  }, [imageToRead])

  const selectedCategoryId = categories.some((category) => category.id === activeCategoryId)
    ? activeCategoryId
    : ''
  const activeCategory = categories.find((category) => category.id === selectedCategoryId)

  const entriesForDate = useMemo(() => {
    return categories.map((category) => ({
      ...category,
      displayTime: getCategoryTime(category, selectedDate),
      entries: category.entries.filter((entry) => entry.date === selectedDate),
    }))
  }, [categories, selectedDate])

  const activeEntries = useMemo(() => {
    return activeCategory?.entries.filter((entry) => entry.date === selectedDate) ?? []
  }, [activeCategory, selectedDate])

  const totalForDate = entriesForDate.reduce(
    (total, category) => total + category.entries.length,
    0,
  )

  function addCategory(event) {
    event.preventDefault()
    const trimmedName = categoryName.trim()

    if (!trimmedName) {
      return
    }

    const category = {
      id: crypto.randomUUID(),
      name: trimmedName,
      time: categoryTime.trim(),
      timesByDate: categoryTime.trim()
        ? {
            [selectedDate]: categoryTime.trim(),
          }
        : {},
      entries: [],
    }

    setCategories((current) => [...current, category])
    setActiveCategoryId(category.id)
    setCategoryName('')
    setCategoryTime('')
  }

  function renameCategory(categoryId, nextName) {
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId ? { ...category, name: nextName } : category,
      ),
    )
  }

  function updateCategoryTime(categoryId, dateKey, nextTime) {
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              timesByDate: {
                ...(category.timesByDate ?? {}),
                [dateKey]: nextTime,
              },
            }
          : category,
      ),
    )
  }

  function addEntry(event) {
    event.preventDefault()
    const trimmedName = entryName.trim()

    if (!selectedCategoryId || !trimmedName) {
      return
    }

    const entry = {
      id: crypto.randomUUID(),
      date: selectedDate,
      name: trimmedName,
    }

    setCategories((current) =>
      current.map((category) =>
        category.id === selectedCategoryId
          ? { ...category, entries: [...category.entries, entry] }
          : category,
      ),
    )
    setEntryName('')
  }

  function addBulkEntries(event) {
    event.preventDefault()
    const names = extractNames(bulkNames)

    if (!selectedCategoryId || names.length === 0) {
      return
    }

    const entries = names.map((name) => ({
      id: crypto.randomUUID(),
      date: selectedDate,
      name,
    }))

    setCategories((current) =>
      current.map((category) =>
        category.id === selectedCategoryId
          ? { ...category, entries: [...category.entries, ...entries] }
          : category,
      ),
    )
    setBulkNames('')
    setOcrStatus(`${entries.length} names added.`)
  }

  function unlockAdmin(event) {
    event.preventDefault()

    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdminUnlocked(true)
      setAdminPassword('')
      setAdminError('')
      return
    }

    setAdminError('Incorrect password.')
  }

  function loadImageForCrop(file) {
    if (!file) {
      return
    }

    if (imageToRead?.url) {
      URL.revokeObjectURL(imageToRead.url)
    }

    setImageToRead({
      file,
      url: URL.createObjectURL(file),
    })
    setCrop({ x: 0, y: 0, width: 100, height: 100 })
    setOcrStatus('Adjust crop, then read selected area.')
  }

  async function createCroppedImage(file, cropArea) {
    const image = new Image()
    const imageUrl = URL.createObjectURL(file)

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = imageUrl
      })

      const sourceX = Math.round((cropArea.x / 100) * image.naturalWidth)
      const sourceY = Math.round((cropArea.y / 100) * image.naturalHeight)
      const sourceWidth = Math.round((cropArea.width / 100) * image.naturalWidth)
      const sourceHeight = Math.round((cropArea.height / 100) * image.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = sourceWidth
      canvas.height = sourceHeight

      const context = canvas.getContext('2d')
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight,
      )

      return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), file.type || 'image/png')
      })
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  }

  async function readNamesFromCroppedImage() {
    if (!imageToRead) {
      setOcrStatus('Upload an image first.')
      return
    }

    setIsOcrReading(true)
    setOcrStatus('Cropping and reading image...')

    let worker

    try {
      const croppedImage = await createCroppedImage(imageToRead.file, crop)

      if (!croppedImage) {
        setOcrStatus('Could not crop this image.')
        return
      }

      worker = await createWorker(['eng', 'hin'])
      const {
        data: { text },
      } = await worker.recognize(croppedImage)
      const names = extractNames(text)

      setBulkNames((current) => {
        const existing = current.trim()
        const nextNames = names.join('\n')
        return existing && nextNames ? `${existing}\n${nextNames}` : existing || nextNames
      })
      setOcrStatus(
        names.length > 0
          ? `${names.length} names found. Check the list before adding.`
          : 'No names found. Try a clearer photo.',
      )
    } catch {
      setOcrStatus('Could not read this image. Try another image.')
    } finally {
      if (worker) {
        await worker.terminate()
      }
      setIsOcrReading(false)
    }
  }

  function removeEntry(categoryId, entryId) {
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              entries: category.entries.filter((entry) => entry.id !== entryId),
            }
          : category,
      ),
    )
  }

  function removeCategory(categoryId) {
    if (DEFAULT_CATEGORY_IDS.has(categoryId)) {
      setDeletedDefaultCategoryIds((current) =>
        current.includes(categoryId) ? current : [...current, categoryId],
      )
    }

    if (activeCategoryId === categoryId) {
      setActiveCategoryId('')
    }

    setCategories((current) => current.filter((category) => category.id !== categoryId))
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="devotional-line">धन धन सतगुरु तेरा ही आसरा</p>
          <p className="program-name">प्रेम का सागर</p>
          <h1>Attendance Register</h1>
          <p className="subtitle">{formatReadableDate(selectedDate)}</p>
        </div>

        <div className="topbar-controls" aria-label="View mode">
          <button
            type="button"
            className={mode === 'viewer' ? 'is-active' : ''}
            onClick={() => setMode('viewer')}
          >
            Viewer
          </button>
          <button
            type="button"
            className={mode === 'admin' ? 'is-active' : ''}
            onClick={() => setMode('admin')}
          >
            Admin
          </button>
        </div>
      </header>

      <section className="date-strip" aria-label="Selected date">
        <label>
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => setSelectedDate(todayKey)}>
          Today
        </button>
        <div className="summary-pill">{totalForDate} records today</div>
        <div className="summary-pill">{syncStatus}</div>
      </section>

      <section className="category-grid" aria-label="Categories">
        {entriesForDate.map((category) => (
          <button
            type="button"
            key={category.id}
            className={`category-card ${category.id === selectedCategoryId ? 'is-selected' : ''}`}
            onClick={() => setActiveCategoryId(category.id)}
          >
            <span>{category.name}</span>
            <strong>{category.entries.length}</strong>
            <small>{category.displayTime || 'No time set'}</small>
          </button>
        ))}
      </section>

      {mode === 'viewer' ? (
        <section className="content-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Viewer</p>
              <h2>{activeCategory?.name ?? 'No category selected'}</h2>
            </div>
            <span>{activeEntries.length} entries</span>
          </div>

          {!activeCategory ? (
            <div className="empty-state">
              <h2>Select a category</h2>
              <p>Click any Sarbat Da Bhala class above to see the names for that time.</p>
            </div>
          ) : activeEntries.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h2>No data for this date</h2>
              <p>Admin can add records for {formatReadableDate(selectedDate)}.</p>
            </div>
          )}
        </section>
      ) : !isAdminUnlocked ? (
        <section className="content-panel admin-lock">
          <form className="form-panel" onSubmit={unlockAdmin}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Password required</h2>
              </div>
            </div>
            <label>
              Password
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Enter admin password"
              />
            </label>
            {adminError ? <p className="error-text">{adminError}</p> : null}
            <button type="submit" className="primary-action">
              Open admin
            </button>
          </form>
        </section>
      ) : (
        <section className="admin-layout">
          <form className="content-panel form-panel" onSubmit={addCategory}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Create category</h2>
              </div>
            </div>
            <label>
              Category name
              <input
                type="text"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Class, team, department..."
              />
            </label>
            <label>
              Time or detail
              <input
                type="text"
                value={categoryTime}
                onChange={(event) => setCategoryTime(event.target.value)}
                placeholder="9:00 AM - 11:00 AM"
              />
            </label>
            <button type="submit" className="primary-action">
              Add category
            </button>
          </form>

          <form className="content-panel form-panel" onSubmit={addEntry}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Add name</h2>
              </div>
              <span>{activeCategory?.name ?? 'Choose category'}</span>
            </div>
            <label>
              Name
              <input
                type="text"
                value={entryName}
                onChange={(event) => setEntryName(event.target.value)}
                placeholder="Person name"
              />
            </label>
            <button type="submit" className="primary-action">
              Add to selected date
            </button>
          </form>

          <form className="content-panel form-panel ocr-panel" onSubmit={addBulkEntries}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Image to names</h2>
              </div>
              <span>{activeCategory?.name ?? 'Choose category'}</span>
            </div>
            <label>
              Upload image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => loadImageForCrop(event.target.files?.[0])}
                disabled={isOcrReading}
              />
            </label>
            {imageToRead ? (
              <div className="crop-tool">
                <div className="crop-preview">
                  <img src={imageToRead.url} alt="Selected attendance list" />
                  <div
                    className="crop-box"
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.width}%`,
                      height: `${crop.height}%`,
                    }}
                  ></div>
                </div>
                <div className="crop-controls">
                  <label>
                    Left
                    <input
                      type="range"
                      min="0"
                      max={100 - crop.width}
                      value={crop.x}
                      onChange={(event) =>
                        setCrop((current) => ({ ...current, x: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Top
                    <input
                      type="range"
                      min="0"
                      max={100 - crop.height}
                      value={crop.y}
                      onChange={(event) =>
                        setCrop((current) => ({ ...current, y: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Width
                    <input
                      type="range"
                      min="10"
                      max={100 - crop.x}
                      value={crop.width}
                      onChange={(event) =>
                        setCrop((current) => ({ ...current, width: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Height
                    <input
                      type="range"
                      min="10"
                      max={100 - crop.y}
                      value={crop.height}
                      onChange={(event) =>
                        setCrop((current) => ({ ...current, height: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={readNamesFromCroppedImage}
                  disabled={isOcrReading}
                >
                  Read selected area
                </button>
              </div>
            ) : null}
            <label>
              Names from image
              <textarea
                value={bulkNames}
                onChange={(event) => setBulkNames(event.target.value)}
                placeholder="One name per line"
                rows="8"
              />
            </label>
            {ocrStatus ? <p className="muted">{ocrStatus}</p> : null}
            <button type="submit" className="primary-action" disabled={isOcrReading}>
              Add all names
            </button>
          </form>

          <section className="content-panel category-editor">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Manage categories</h2>
              </div>
              <span>Times apply to {formatReadableDate(selectedDate)}</span>
            </div>
            {categories.map((category) => (
              <div className="category-row" key={category.id}>
                <input
                  aria-label={`Rename ${category.name}`}
                  value={category.name}
                  onChange={(event) => renameCategory(category.id, event.target.value)}
                />
                <input
                  aria-label={`Update time for ${category.name} on selected date`}
                  value={getCategoryTime(category, selectedDate)}
                  onChange={(event) =>
                    updateCategoryTime(category.id, selectedDate, event.target.value)
                  }
                  placeholder="Time"
                />
                <button type="button" onClick={() => removeCategory(category.id)}>
                  Delete
                </button>
              </div>
            ))}
          </section>

          <section className="content-panel admin-records">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Records for selected date</h2>
              </div>
            </div>
            {entriesForDate.some((category) => category.entries.length > 0) ? (
              entriesForDate.map((category) =>
                category.entries.length > 0 ? (
                  <div className="record-group" key={category.id}>
                    <h3>{category.name}</h3>
                    {category.entries.map((entry) => (
                      <div className="record-row" key={entry.id}>
                        <span>{entry.name}</span>
                        <button type="button" onClick={() => removeEntry(category.id, entry.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null,
              )
            ) : (
              <p className="muted">No records added for this date yet.</p>
            )}
          </section>
        </section>
      )}
    </main>
  )
}

export default App
