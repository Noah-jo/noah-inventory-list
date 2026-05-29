import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  Boxes,
  Edit3,
  ImageIcon,
  LayoutGrid,
  LogIn,
  LogOut,
  MapPin,
  PackagePlus,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  adminEmails,
  auth,
  db,
  googleProvider,
  isFirebaseConfigured,
} from './firebase'
import { sampleInventory, sampleSettings } from './sampleInventory'
import './App.css'

const settingsDocPath = ['settings', 'inventoryOptions']
const maxImages = 3

const emptyForm = {
  name: '',
  category: '',
  newCategory: '',
  brand: '',
  model: '',
  quantity: 1,
  location: '',
  newLocation: '',
  size: '',
  specs: '',
  notes: '',
  imageUrls: [],
}

function normalizeItem(item) {
  const imageUrls = Array.isArray(item.imageUrls)
    ? item.imageUrls.filter(Boolean).slice(0, maxImages)
    : item.imageUrl
      ? [item.imageUrl]
      : []

  return {
    ...emptyForm,
    ...item,
    imageUrls,
    newCategory: '',
    newLocation: '',
    quantity: Number(item.quantity || 0),
    updatedAt:
      typeof item.updatedAt === 'string'
        ? item.updatedAt
        : item.updatedAt?.toDate?.().toISOString().slice(0, 10) || '',
  }
}

function cleanOptions(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

async function compressImage(file) {
  const objectUrl = URL.createObjectURL(file)
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = objectUrl
  })

  const maxSide = 900
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(objectUrl)

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(
          new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }),
        )
      },
      'image/jpeg',
      0.66,
    )
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(file)
  })
}

function App() {
  const [items, setItems] = useState(sampleInventory.map(normalizeItem))
  const [options, setOptions] = useState(sampleSettings)
  const [user, setUser] = useState(null)
  const [queryText, setQueryText] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedId, setSelectedId] = useState(sampleInventory[0]?.id)
  const [activeModal, setActiveModal] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFiles, setImageFiles] = useState([])
  const [imageInfo, setImageInfo] = useState('')
  const [notice, setNotice] = useState('')

  const isLocalDemo = !isFirebaseConfigured
  const isAdmin =
    isLocalDemo ||
    (user?.email &&
      (adminEmails.length === 0 || adminEmails.includes(user.email.toLowerCase())))

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined
    return onAuthStateChanged(auth, setUser)
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined

    const inventoryQuery = query(collection(db, 'equipment'), orderBy('updatedAt', 'desc'))
    return onSnapshot(
      inventoryQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((documentSnapshot) =>
          normalizeItem({ id: documentSnapshot.id, ...documentSnapshot.data() }),
        )
        setItems(nextItems)
        setSelectedId((currentId) => currentId || nextItems[0]?.id)
      },
      (error) => setNotice(`Firebase 讀取失敗：${error.message}`),
    )
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined

    return onSnapshot(doc(db, ...settingsDocPath), (snapshot) => {
      if (!snapshot.exists()) return
      const data = snapshot.data()
      setOptions({
        categories: cleanOptions(data.categories || []),
        locations: cleanOptions(data.locations || []),
      })
    })
  }, [])

  const categories = useMemo(
    () => ['All', ...cleanOptions([...options.categories, ...items.map((item) => item.category)])],
    [items, options.categories],
  )

  const filteredItems = useMemo(() => {
    const keyword = queryText.trim().toLowerCase()
    return items.filter((item) => {
      const matchesKeyword = [item.name, item.category, item.brand, item.model, item.location]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
      const matchesCategory = category === 'All' || item.category === category
      return matchesKeyword && matchesCategory
    })
  }, [category, items, queryText])

  const selectedItem =
    items.find((item) => item.id === selectedId) || filteredItems[0] || items[0] || null

  const totals = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const locations = new Set(items.map((item) => item.location).filter(Boolean)).size
    return { totalItems: items.length, totalQuantity, locations }
  }, [items])

  async function login() {
    if (!isFirebaseConfigured) {
      setNotice('目前是本地示範模式，管理功能已開放測試。')
      return
    }
    await signInWithPopup(auth, googleProvider)
  }

  async function logout() {
    await signOut(auth)
  }

  function requireAdmin(action) {
    if (isAdmin) {
      action()
      return
    }
    setNotice('新增、編輯、設定需要管理員登入。一般同事可直接查看。')
  }

  function openNewItem() {
    setEditingItem(null)
    setForm(emptyForm)
    setImageFiles([])
    setImageInfo('')
    setActiveModal('editor')
  }

  function openEditItem(item) {
    setEditingItem(item)
    setForm(normalizeItem(item))
    setImageFiles([])
    setImageInfo('')
    setActiveModal('editor')
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function removeExistingImage(imageUrl) {
    setForm((current) => ({
      ...current,
      imageUrls: current.imageUrls.filter((candidate) => candidate !== imageUrl),
    }))
  }

  async function persistOptions(nextOptions) {
    const normalized = {
      categories: cleanOptions(nextOptions.categories),
      locations: cleanOptions(nextOptions.locations),
    }
    setOptions(normalized)

    if (isFirebaseConfigured) {
      await setDoc(
        doc(db, ...settingsDocPath),
        { ...normalized, updatedAt: serverTimestamp() },
        { merge: true },
      )
    } else {
      setNotice('本地示範模式：設定只會暫存在目前瀏覽器狀態。')
    }
  }

  function handleImageFiles(files) {
    const nextFiles = Array.from(files || []).slice(0, maxImages)
    const remainingSlots = maxImages - form.imageUrls.length
    const acceptedFiles = nextFiles.slice(0, Math.max(remainingSlots, 0))
    setImageFiles(acceptedFiles)

    if (nextFiles.length > acceptedFiles.length) {
      setImageInfo(`每項器材最多 ${maxImages} 張圖片，已只保留可加入的圖片。`)
    } else {
      setImageInfo(acceptedFiles.length ? `已選擇 ${acceptedFiles.length} 張圖片，儲存時會壓縮上載。` : '')
    }
  }

  async function uploadImagesIfNeeded() {
    if (imageFiles.length === 0) return form.imageUrls.slice(0, maxImages)

    const compressedFiles = []
    for (const file of imageFiles) {
      compressedFiles.push(await compressImage(file))
    }

    const originalSize = imageFiles.reduce((sum, file) => sum + file.size, 0)
    const compressedSize = compressedFiles.reduce((sum, file) => sum + file.size, 0)
    setImageInfo(
      `圖片已壓縮：${Math.round(originalSize / 1024)}KB -> ${Math.round(compressedSize / 1024)}KB`,
    )

    const localUrls = await Promise.all(compressedFiles.map(fileToDataUrl))
    return [...form.imageUrls, ...localUrls].slice(0, maxImages)
  }

  async function handleSave(event) {
    event.preventDefault()

    const finalCategory = form.category === '__new__' ? form.newCategory : form.category
    const finalLocation = form.location === '__new__' ? form.newLocation : form.location
    const imageUrls = await uploadImagesIfNeeded()

    const payload = {
      name: form.name.trim(),
      category: finalCategory.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      quantity: Number(form.quantity || 0),
      location: finalLocation.trim(),
      size: form.size.trim(),
      specs: form.specs.trim(),
      notes: form.notes.trim(),
      imageUrls,
      imageUrl: imageUrls[0] || '',
      updatedAt: isFirebaseConfigured ? serverTimestamp() : new Date().toISOString().slice(0, 10),
    }

    const nextOptions = {
      categories: cleanOptions([...options.categories, payload.category]),
      locations: cleanOptions([...options.locations, payload.location]),
    }

    if (isFirebaseConfigured) {
      if (editingItem?.id) {
        await updateDoc(doc(db, 'equipment', editingItem.id), payload)
      } else {
        await addDoc(collection(db, 'equipment'), payload)
      }
      await persistOptions(nextOptions)
    } else if (editingItem?.id) {
      setItems((current) =>
        current.map((item) => (item.id === editingItem.id ? { ...payload, id: item.id } : item)),
      )
      await persistOptions(nextOptions)
    } else {
      const localItem = { ...payload, id: `local-${Date.now()}` }
      setItems((current) => [localItem, ...current])
      setSelectedId(localItem.id)
      await persistOptions(nextOptions)
    }

    setActiveModal(null)
  }

  async function handleDelete(item) {
    if (!window.confirm(`刪除 ${item.name}？`)) return

    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'equipment', item.id))
    } else {
      setItems((current) => current.filter((candidate) => candidate.id !== item.id))
      setNotice('已從本地示範資料移除。')
    }
    setSelectedId(null)
  }

  return (
    <main className="inventory-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Noah Company Assets</p>
          <h1>器材資料列表</h1>
        </div>
        <div className="top-actions">
          {isAdmin ? (
            <>
              <button type="button" onClick={() => setActiveModal('settings')}>
                <Settings size={18} />
                設定
              </button>
              <button className="primary-action" type="button" onClick={openNewItem}>
                <PackagePlus size={18} />
                新增器材
              </button>
            </>
          ) : null}
          {user ? (
            <button type="button" onClick={logout}>
              <LogOut size={18} />
              登出
            </button>
          ) : (
            <button type="button" onClick={login}>
              <LogIn size={18} />
              管理員登入
            </button>
          )}
        </div>
      </section>

      <section className="metrics-strip" aria-label="Inventory summary">
        <Metric icon={<Boxes />} label="器材種類" value={totals.totalItems} />
        <Metric icon={<LayoutGrid />} label="總數量" value={totals.totalQuantity} />
        <Metric icon={<MapPin />} label="存放位置" value={totals.locations} />
      </section>

      <section className="workspace">
        <aside className="filters-panel" aria-label="Filters">
          <div className="search-field">
            <Search size={17} />
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="搜尋名稱、品牌、型號、位置"
            />
          </div>

          <label>
            類別
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((itemCategory) => (
                <option key={itemCategory} value={itemCategory}>
                  {itemCategory === 'All' ? '全部類別' : itemCategory}
                </option>
              ))}
            </select>
          </label>

          <div className="mode-note">
            {isFirebaseConfigured
              ? user
                ? `${user.email} 已登入${isAdmin ? '，可管理資料。' : '，目前沒有管理權限。'}`
                : '一般查看不需要登入；管理功能需登入。'
              : '目前為本地示範模式，管理功能可直接測試。'}
          </div>
          {notice ? <div className="notice">{notice}</div> : null}
        </aside>

        <section className="list-panel" aria-label="Equipment list">
          <div className="panel-header">
            <span>{filteredItems.length} 筆器材</span>
            <span>點選項目查看規格</span>
          </div>
          <div className="equipment-list">
            {filteredItems.map((item) => (
              <button
                className={`equipment-row ${selectedItem?.id === item.id ? 'is-selected' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
              >
                {item.imageUrls[0] ? (
                  <img src={item.imageUrls[0]} alt={item.name} />
                ) : (
                  <ImageIcon size={32} />
                )}
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.brand} {item.model}
                  </small>
                </span>
                <small>{item.category}</small>
                <b>{item.quantity}</b>
              </button>
            ))}
          </div>
        </section>

        <DetailPanel
          isAdmin={isAdmin}
          item={selectedItem}
          key={selectedItem?.id || 'empty-detail'}
          onDelete={(item) => requireAdmin(() => handleDelete(item))}
          onEdit={(item) => requireAdmin(() => openEditItem(item))}
        />
      </section>

      {activeModal === 'editor' ? (
        <Editor
          form={form}
          imageFiles={imageFiles}
          imageInfo={imageInfo}
          isEditing={Boolean(editingItem)}
          maxImages={maxImages}
          onClose={() => setActiveModal(null)}
          onImageChange={handleImageFiles}
          onRemoveImage={removeExistingImage}
          onSave={handleSave}
          options={options}
          updateForm={updateForm}
        />
      ) : null}

      {activeModal === 'settings' ? (
        <SettingsModal
          options={options}
          onClose={() => setActiveModal(null)}
          onSave={async (nextOptions) => {
            await persistOptions(nextOptions)
            setActiveModal(null)
          }}
        />
      ) : null}
    </main>
  )
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DetailPanel({ isAdmin, item, onEdit, onDelete }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  if (!item) {
    return <section className="detail-panel empty-state">沒有符合條件的器材。</section>
  }

  const activeImageUrl = item.imageUrls[activeImageIndex] || item.imageUrls[0]

  return (
    <section className="detail-panel" aria-label="Equipment details">
      <div className="detail-image-wrap">
        {activeImageUrl ? <img src={activeImageUrl} alt={item.name} /> : <ImageIcon size={54} />}
        {item.imageUrls.length > 1 ? (
          <div className="image-thumbs">
            {item.imageUrls.map((imageUrl, index) => (
              <button
                className={index === activeImageIndex ? 'is-selected' : ''}
                key={imageUrl}
                type="button"
                onClick={() => setActiveImageIndex(index)}
                aria-label={`查看第 ${index + 1} 張圖片`}
              >
                <img src={imageUrl} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="detail-copy">
        <p className="eyebrow">{item.category}</p>
        <h2>{item.name}</h2>
        <div className="spec-grid">
          <Spec label="品牌" value={item.brand} />
          <Spec label="型號" value={item.model} />
          <Spec label="數量" value={item.quantity} />
          <Spec label="尺寸" value={item.size} />
        </div>
        <div className="location-line">
          <MapPin size={16} />
          {item.location || '未填寫位置'}
        </div>
        <section>
          <h3>規格</h3>
          <p>{item.specs || '尚未填寫規格。'}</p>
        </section>
        <section>
          <h3>備註</h3>
          <p>{item.notes || '沒有備註。'}</p>
        </section>
        {isAdmin ? (
          <div className="detail-actions">
            <button type="button" onClick={() => onEdit(item)}>
              <Edit3 size={16} />
              編輯
            </button>
            <button className="danger" type="button" onClick={() => onDelete(item)}>
              <Trash2 size={16} />
              刪除
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function Spec({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function Editor({
  form,
  imageFiles,
  imageInfo,
  isEditing,
  maxImages,
  onClose,
  onImageChange,
  onRemoveImage,
  onSave,
  options,
  updateForm,
}) {
  const remainingSlots = maxImages - form.imageUrls.length

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="editor" onSubmit={onSave}>
        <div className="editor-header">
          <h2>{isEditing ? '編輯器材' : '新增器材'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close editor">
            <X size={20} />
          </button>
        </div>

        <div className="form-grid">
          <Field label="名稱" value={form.name} onChange={(value) => updateForm('name', value)} required />
          <OptionField
            label="類別"
            newLabel="新增類別"
            newValue={form.newCategory}
            onChange={(value) => updateForm('category', value)}
            onNewChange={(value) => updateForm('newCategory', value)}
            options={options.categories}
            value={form.category}
          />
          <Field label="品牌" value={form.brand} onChange={(value) => updateForm('brand', value)} />
          <Field label="型號" value={form.model} onChange={(value) => updateForm('model', value)} />
          <Field
            label="數量"
            type="number"
            min="0"
            value={form.quantity}
            onChange={(value) => updateForm('quantity', value)}
          />
          <OptionField
            label="位置"
            newLabel="新增位置"
            newValue={form.newLocation}
            onChange={(value) => updateForm('location', value)}
            onNewChange={(value) => updateForm('newLocation', value)}
            options={options.locations}
            value={form.location}
          />
          <Field label="尺寸" value={form.size} onChange={(value) => updateForm('size', value)} />
          <label>
            圖片上載（最多 {maxImages} 張）
            <span className={`file-input ${remainingSlots <= 0 ? 'is-disabled' : ''}`}>
              <Upload size={17} />
              選擇圖片
              <input
                accept="image/*"
                disabled={remainingSlots <= 0}
                multiple
                type="file"
                onChange={(event) => onImageChange(event.target.files)}
              />
            </span>
          </label>
          <div className="span-2 image-editor">
            {form.imageUrls.length ? (
              <div className="existing-images">
                {form.imageUrls.map((imageUrl, index) => (
                  <div key={imageUrl}>
                    <img src={imageUrl} alt={`現有圖片 ${index + 1}`} />
                    <button type="button" onClick={() => onRemoveImage(imageUrl)}>
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <p>
              已有 {form.imageUrls.length} 張，待上載 {imageFiles.length} 張，尚可加入{' '}
              {Math.max(maxImages - form.imageUrls.length - imageFiles.length, 0)} 張。
            </p>
          </div>
          {imageInfo ? <p className="image-info span-2">{imageInfo}</p> : null}
          <TextArea label="規格" value={form.specs} onChange={(value) => updateForm('specs', value)} />
          <TextArea label="備註" value={form.notes} onChange={(value) => updateForm('notes', value)} />
        </div>

        <div className="editor-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-action" type="submit">
            <Save size={17} />
            儲存
          </button>
        </div>
      </form>
    </div>
  )
}

function OptionField({ label, newLabel, newValue, onChange, onNewChange, options, value }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">請選擇</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
        <option value="__new__">新增...</option>
      </select>
      {value === '__new__' ? (
        <input
          value={newValue}
          onChange={(event) => onNewChange(event.target.value)}
          placeholder={newLabel}
          required
        />
      ) : null}
    </label>
  )
}

function SettingsModal({ onClose, onSave, options }) {
  const [categoriesText, setCategoriesText] = useState(options.categories.join('\n'))
  const [locationsText, setLocationsText] = useState(options.locations.join('\n'))

  function submit(event) {
    event.preventDefault()
    onSave({
      categories: categoriesText.split('\n'),
      locations: locationsText.split('\n'),
    })
  }

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="editor settings-editor" onSubmit={submit}>
        <div className="editor-header">
          <h2>設定</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>
        <div className="form-grid">
          <label>
            類別清單（一行一個）
            <textarea
              value={categoriesText}
              rows="10"
              onChange={(event) => setCategoriesText(event.target.value)}
            />
          </label>
          <label>
            位置清單（一行一個）
            <textarea
              value={locationsText}
              rows="10"
              onChange={(event) => setLocationsText(event.target.value)}
            />
          </label>
        </div>
        <div className="editor-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-action" type="submit">
            <Save size={17} />
            儲存設定
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ className = '', label, onChange, ...props }) {
  return (
    <label className={className}>
      {label}
      <input {...props} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="span-2">
      {label}
      <textarea value={value} rows="4" onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

export default App
