import React, { useCallback, useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, FolderPlus, Image as ImageIcon,
  Layers, Loader, Pencil, Plus, Trash2, Upload, X, Settings2,
} from 'lucide-react';
import api from '../utils/api';
import CustomizationGroupsEditor from './CustomizationGroupsEditor';

const slugify = (value) => value.trim().toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function ImagePicker({ value, onChange, disabled = false, compact = false }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const url = await api.uploadImage(file);
      if (!url || !/^https?:\/\//i.test(url)) throw new Error('The server did not return a usable image URL.');
      onChange(url);
    } catch (uploadError) {
      setError(uploadError.message || 'Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`flex ${compact ? 'items-center gap-2' : 'items-start gap-3'}`}>
      <div className={`${compact ? 'h-12 w-12' : 'h-20 w-20'} relative shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50`}>
        {value ? (
          <img src={value} alt="Category cover preview" className="h-full w-full object-cover" onError={() => setError('This image could not be loaded. Upload it again or remove it.')} />
        ) : <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-slate-300" /></div>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${disabled || uploading ? 'cursor-not-allowed opacity-60' : ''}`}>
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={handleFile} disabled={disabled || uploading} />
          {uploading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : value ? 'Change image' : 'Upload cover'}
        </label>
        {value && <button type="button" onClick={() => { onChange(''); setError(''); }} disabled={disabled || uploading} className="ml-2 text-xs font-semibold text-red-500 hover:text-red-700">Remove</button>}
        <p className="text-[10px] text-slate-400">JPG, PNG, GIF or WebP · up to 5 MB</p>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      setError('');
      const list = await api.getCategories();
      setCategories(Array.isArray(list) ? list : []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleAddRoot = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.createCategory({ name: cleanName, slug: slugify(cleanName), imageUrl: imageUrl || undefined, order: categories.length + 1, parentId: null });
      setName('');
      setImageUrl('');
      setNotice(`${cleanName} was created.`);
      await loadCategories();
    } catch (saveError) {
      setError(saveError.message || 'Could not create category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-800">Categories</h2>
        <p className="mt-1 text-sm text-slate-500">Create and customize categories and subcategories, including their cover images.</p>
      </header>
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <form onSubmit={handleAddRoot} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4 xl:col-span-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Layers className="h-5 w-5" /></span>
            <div><h3 className="font-bold text-slate-800">New root category</h3><p className="text-xs text-slate-500">Top level in your store</p></div>
          </div>
          <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Category name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Women" required maxLength={80} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </label>
          <div className="space-y-1.5 text-xs font-semibold text-slate-600">Cover image <ImagePicker value={imageUrl} onChange={setImageUrl} disabled={saving} /></div>
          {name.trim() && <p className="text-xs text-slate-400">URL preview: /{slugify(name)}</p>}
          <button type="submit" disabled={saving || !name.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Creating…' : 'Create category'}
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h3 className="font-bold text-slate-800">Category hierarchy</h3><p className="mt-0.5 text-xs text-slate-500">Add children or edit a category to change its image and name.</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{categories.length} root{categories.length === 1 ? '' : 's'}</span>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader className="h-4 w-4 animate-spin" />Loading categories…</div> : categories.length === 0 ? (
            <div className="p-12 text-center"><FolderPlus className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-600">No categories yet</p><p className="mt-1 text-sm text-slate-400">Create a root category to start organizing your products.</p></div>
          ) : <div>{categories.map((category) => <CategoryNode key={category.id} category={category} depth={0} reload={loadCategories} />)}</div>}
        </div>
      </div>
    </section>
  );
}

function CategoryNode({ category, depth, reload, parentSlug = '' }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [mode, setMode] = useState('');
  const [name, setName] = useState(category.name);
  const [imageUrl, setImageUrl] = useState(category.imageUrl || '');
  const [subName, setSubName] = useState('');
  const [subImageUrl, setSubImageUrl] = useState('');
  const [customizationGroups, setCustomizationGroups] = useState(category.customizationGroups || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const children = category.subCategories || [];

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      const baseSlug = slugify(name);
      await api.updateCategory(category.id, { name: name.trim(), slug: parentSlug ? `${parentSlug}-${baseSlug}` : baseSlug, imageUrl });
      setMode(''); await reload();
    } catch (saveError) { setError(saveError.message || 'Could not update category.'); }
    finally { setSaving(false); }
  };

  const addChild = async (event) => {
    event.preventDefault();
    if (!subName.trim()) return;
    setSaving(true); setError('');
    try {
      await api.createCategory({ name: subName.trim(), slug: `${category.slug}-${slugify(subName)}`, imageUrl: subImageUrl || undefined, order: children.length + 1, parentId: category.id });
      setSubName(''); setSubImageUrl(''); setMode(''); setExpanded(true); await reload();
    } catch (saveError) { setError(saveError.message || 'Could not create subcategory.'); }
    finally { setSaving(false); }
  };

  const saveCustomizations = async (event) => {
    event.preventDefault();
    const groups = customizationGroups
      .map(group => ({
        ...group,
        name: (group.name || '').trim(),
        options: (group.options || []).map(option => ({ ...option, name: (option.name || '').trim(), price: Number(option.price || 0) })).filter(option => option.name),
      }))
      .filter(group => group.name && group.options.length);
    setSaving(true); setError('');
    try {
      await api.updateCategory(category.id, { customizationGroups: groups });
      setCustomizationGroups(groups); setMode(''); await reload();
    } catch (saveError) { setError(saveError.message || 'Could not save category options.'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${category.name}” and all of its subcategories?`)) return;
    setError('');
    try { await api.deleteCategory(category.id); await reload(); }
    catch (deleteError) { setError(deleteError.message || 'Could not delete category.'); }
  };

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="group flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-slate-50" style={{ paddingLeft: `${16 + depth * 22}px` }}>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse subcategories' : 'Expand subcategories'} className={`rounded p-1 ${children.length ? 'text-slate-500 hover:bg-slate-200' : 'invisible'}`}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {category.imageUrl ? <img src={category.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100"><ImageIcon className="h-4 w-4 text-slate-400" /></div>}
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{category.name}</p><p className="truncate text-[11px] text-slate-400">/{category.slug}{children.length > 0 ? ` · ${children.length} subcategor${children.length === 1 ? 'y' : 'ies'}` : ''}</p></div>
        <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-60 sm:group-hover:opacity-100">
          <button type="button" onClick={() => { setMode(mode === 'add' ? '' : 'add'); setError(''); }} title="Add subcategory" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setName(category.name); setImageUrl(category.imageUrl || ''); setMode(mode === 'edit' ? '' : 'edit'); setError(''); }} title="Edit category" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setCustomizationGroups(category.customizationGroups || []); setMode(mode === 'options' ? '' : 'options'); setError(''); }} title="Configure customer options" className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Settings2 className="h-4 w-4" /></button>
          <button type="button" onClick={remove} title="Delete category" className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {error && <p role="alert" className="px-5 pb-3 text-xs text-red-600" style={{ paddingLeft: `${52 + depth * 22}px` }}>{error}</p>}
      {mode === 'edit' && <form onSubmit={save} className="space-y-4 bg-slate-50 px-5 py-4" style={{ marginLeft: `${51 + depth * 22}px` }}>
        <label className="block space-y-1 text-xs font-semibold text-slate-600">Name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} className="w-full max-w-lg rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <div className="space-y-1 text-xs font-semibold text-slate-600">Cover image<ImagePicker value={imageUrl} onChange={setImageUrl} disabled={saving} /></div>
        <div className="flex gap-2"><button disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save changes</button><button type="button" onClick={() => setMode('')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button></div>
      </form>}
      {mode === 'add' && <form onSubmit={addChild} className="space-y-4 bg-brand-50/50 px-5 py-4" style={{ marginLeft: `${51 + depth * 22}px` }}>
        <div><p className="text-sm font-bold text-slate-700">New subcategory</p><p className="text-xs text-slate-500">Under {category.name}</p></div>
        <label className="block space-y-1 text-xs font-semibold text-slate-600">Name<input autoFocus value={subName} onChange={(event) => setSubName(event.target.value)} placeholder="For example, Dresses" required maxLength={80} className="w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal" /></label>
        <div className="space-y-1 text-xs font-semibold text-slate-600">Cover image<ImagePicker value={subImageUrl} onChange={setSubImageUrl} disabled={saving} /></div>
        <div className="flex gap-2"><button disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create subcategory</button><button type="button" onClick={() => setMode('')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button></div>
      </form>}
      {mode === 'options' && <form onSubmit={saveCustomizations} className="space-y-4 bg-indigo-50/60 px-5 py-4" style={{ marginLeft: `${51 + depth * 22}px` }}>
        <div><p className="text-sm font-bold text-slate-700">Customer customizations and add-ons</p><p className="text-xs text-slate-600">Category names organize the catalogue; they do not become choices in the app by themselves. Add a choice group here (for example, “Blouse cut”), then add the actual choices and prices. These groups apply to products assigned to this category and its subcategories.</p></div>
        <CustomizationGroupsEditor value={customizationGroups} onChange={setCustomizationGroups} />
        <div className="flex gap-2"><button disabled={saving} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save options'}</button><button type="button" onClick={() => setMode('')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button></div>
      </form>}
      {expanded && children.map((child) => <CategoryNode key={child.id} category={child} depth={depth + 1} reload={reload} parentSlug={category.slug} />)}
    </div>
  );
}
