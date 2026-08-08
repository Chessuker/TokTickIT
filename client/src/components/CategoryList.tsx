import { useEffect, useState } from 'react'

interface Category {
  id: string
  name: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function CategoryList() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories`)
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`)
      }
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      setError('Failed to load categories. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  return (
    <div className="retro-window">
      <div className="retro-window-header">
        <span>📁 C:\TOK_TICK_IT\CATEGORIES.EXE</span>
        <div className="window-controls">
          <div className="window-btn">_</div>
          <div className="window-btn">□</div>
          <div className="window-btn">X</div>
        </div>
      </div>
      <div className="retro-window-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0 fw-bold font-monospace text-dark">
            <span className="text-primary me-2">📂</span> SYSTEM CATEGORIES
          </h5>
          <button onClick={fetchCategories} className="retro-btn" disabled={loading}>
            ⚡ REFRESH
          </button>
        </div>

        <div className="retro-well">
          {loading ? (
            <div className="p-4 text-center" role="status">
              <div className="spinner-border text-primary me-2" role="status">
                <span className="visually-hidden">Loading categories...</span>
              </div>
              <p className="mt-2 fw-bold font-monospace blink text-primary mb-0">Loading categories...</p>
            </div>
          ) : error ? (
            <div className="alert alert-danger d-flex align-items-start gap-2 m-2" role="alert">
              <span className="fs-5">⚠️</span>
              <div>{error}</div>
            </div>
          ) : categories.length === 0 ? (
            <div className="p-4 text-center text-muted font-monospace">
              📂 [EMPTY DIRECTORY] No categories found.
            </div>
          ) : (
            <ul className="list-group list-group-flush font-monospace">
              {categories.map((category) => (
                <li key={category.id} className="list-group-item d-flex align-items-center gap-2 py-2">
                  <span className="text-warning">💾</span>
                  <span className="fw-bold">{category.name}</span>
                  <span className="ms-auto text-muted small">[ID: {category.id.substring(0, 8)}]</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default CategoryList
