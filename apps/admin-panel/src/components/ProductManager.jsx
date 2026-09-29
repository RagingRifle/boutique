import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Flame, 
  Calendar, 
  AlertTriangle,
  FileImage,
  Check,
  X,
  Image
} from 'lucide-react';
import api from '../utils/api';
import CustomizationGroupsEditor from './CustomizationGroupsEditor';

export default function ProductManager() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    materialInfo: '',
    categoryId: '',
    inventoryQty: '',
    targetGender: 'UNISEX',
    inheritCategoryCustomizations: true,
    customizationGroups: [],
    isTrending: false,
    trendingScheduledAt: '',
    images: [''],
    bannerImage: ''
  });

  
  const findCategoryPath = (catId, cats = categories, currentPath = []) => {
    for (const cat of cats) {
      if (cat.id === catId) return [...currentPath, cat];
      if (cat.subCategories && cat.subCategories.length > 0) {
        const path = findCategoryPath(catId, cat.subCategories, [...currentPath, cat]);
        if (path) return path;
      }
    }
    return null;
  };

  const flattenCategories = (cats, depth = 0, result = []) => {
    cats.forEach(c => {
      result.push({ ...c, depth });
      if (c.subCategories && c.subCategories.length > 0) {
        flattenCategories(c.subCategories, depth + 1, result);
      }
    });
    return result;
  };
  const flatCategories = flattenCategories(categories);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isBannerUploading, setIsBannerUploading] = useState(false);

  const handleImageUpload = async (e, index = 0) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(index);
    setError('');
    try {
      const url = await api.uploadImage(file);
      setFormData(prev => {
        const newImages = [...prev.images];
        newImages[index] = url;
        return { ...prev, images: newImages };
      });
    } catch (err) {
      setError('Image upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleBannerUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsBannerUploading(true);
    setError('');
    try {
      const url = await api.uploadImage(file);
      setFormData(prev => ({ ...prev, bannerImage: url }));
    } catch (err) {
      setError('Banner upload failed.');
    } finally {
      setIsBannerUploading(false);
    }
  };

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const catList = await api.getCategories();
        setCategories(catList);
      } catch (err) {
        console.error(err);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, searchTerm, selectedCategory, categories.length]);

  const loadData = async () => {
    try {
      let categorySlug = '';
      if (selectedCategory !== 'ALL' && flatCategories.length > 0) {
        const cat = flatCategories.find(c => c.id === selectedCategory);
        if (cat) categorySlug = cat.slug;
      }
      
      const res = await api.getProductsPaginated({
        page: currentPage,
        limit: 12,
        search: searchTerm,
        categorySlug
      });
      
      if (res && res.success) {
        setProducts(res.data);
        setTotalPages(res.pagination.pages);
        setTotalItems(res.pagination.total);
      } else {
        setProducts(res || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      materialInfo: '',
      categoryId: flatCategories.length > 0 ? flatCategories[0].id : '',
      inventoryQty: '10',
      targetGender: 'UNISEX',
      inheritCategoryCustomizations: true,
      customizationGroups: [],
      isTrending: false,
      trendingScheduledAt: '',
      images: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500'],
      bannerImage: ''
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: String(product.price),
      materialInfo: product.materialInfo || '',
      categoryId: product.categoryId,
      inventoryQty: String(product.inventoryQty),
      targetGender: product.targetGender || 'UNISEX',
      inheritCategoryCustomizations: product.inheritCategoryCustomizations !== false,
      customizationGroups: product.customizationGroups || [],
      isTrending: product.isTrending,
      trendingScheduledAt: product.trendingScheduledAt ? product.trendingScheduledAt.slice(0, 16) : '',
      images: product.images,
      bannerImage: product.bannerImage || ''
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.price || !formData.categoryId || formData.inventoryQty === '') {
      setError('Please fill in all required fields.');
      return;
    }

    const payload = {
      name: formData.name,
      description: formData.description,
      price: Number(formData.price),
      materialInfo: formData.materialInfo,
      categoryId: formData.categoryId,
      inventoryQty: Number(formData.inventoryQty),
      targetGender: formData.targetGender,
      inheritCategoryCustomizations: formData.inheritCategoryCustomizations,
      customizationGroups: formData.customizationGroups
        .map(group => ({
          ...group,
          name: (group.name || '').trim(),
          options: (group.options || []).map(option => ({ ...option, name: (option.name || '').trim(), price: Number(option.price || 0) })).filter(option => option.name),
        }))
        .filter(group => group.name && group.options.length),
      isTrending: formData.isTrending,
      trendingScheduledAt: formData.isTrending && formData.trendingScheduledAt ? new Date(formData.trendingScheduledAt).toISOString() : undefined,
      images: formData.images.filter(img => img.trim() !== ''),
      bannerImage: formData.bannerImage || null
    };

    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload);
        setSuccess('Product updated successfully!');
      } else {
        await api.createProduct(payload);
        setSuccess('Product created successfully!');
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Action failed.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.deleteProduct(id);
      loadData();
    } catch (err) {
      alert(err.message || 'Delete failed.');
    }
  };

  const handleToggleTrending = async (product) => {
    try {
      await api.toggleTrending(product.id, !product.isTrending);
      loadData();
    } catch (err) {
      alert(err.message || 'Action failed.');
    }
  };

  const getCategoryName = (catId) => {
    return flatCategories.find(c => c.id === catId)?.name || 'Unknown';
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };
  
  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setCurrentPage(1);
  };

  const filteredProducts = products;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Products Catalog</h2>
          <p className="text-xs text-slate-500 font-medium">Manage and adjust inventory, prices, and trending settings</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-premium shadow-brand-500/10"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      <div className="bg-slate-50/50 border border-slate-200/60 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Search & Dynamic Categories */}
        <div className="flex flex-1 flex-col md:flex-row md:items-center gap-3">
          {/* Search Box */}
          <div className="relative min-w-[200px] md:max-w-xs w-full">
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search products..."
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
            />
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          </div>

          {/* Dynamic Cascading Filter Dropdowns */}
          {(() => {
            const currentPath = selectedCategory !== 'ALL' ? (findCategoryPath(selectedCategory) || []) : [];

            // Build levels: level 0 = root categories, level 1 = children of path[0], etc.
            const levels = [{ list: categories, selected: currentPath[0] || null, parentId: null }];
            for (let i = 0; i < currentPath.length; i++) {
              const children = currentPath[i].subCategories || [];
              if (children.length > 0) {
                levels.push({ list: children, selected: currentPath[i + 1] || null, parentId: currentPath[i].id });
              }
            }

            return (
              <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden lg:inline">Category:</span>
                {levels.map((level, idx) => (
                  <select
                    key={level.parentId || 'root'}
                    value={level.selected?.id || (idx === 0 ? 'ALL' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (idx === 0 && val === 'ALL') {
                        setSelectedCategory('ALL');
                      } else if (val) {
                        setSelectedCategory(val);
                      } else {
                        // User chose the "All Sub" placeholder — go back to parent level
                        const parentCat = currentPath[idx - 1];
                        setSelectedCategory(parentCat ? parentCat.id : 'ALL');
                      }
                      setCurrentPage(1);
                    }}
                    className="min-w-[130px] max-w-[200px] text-xs border border-slate-200 rounded-xl py-2 px-3 bg-white text-slate-650 focus:outline-none focus:border-brand-500 transition-colors font-bold shadow-sm"
                  >
                    {idx === 0 && <option value="ALL">All Categories</option>}
                    {idx > 0 && <option value="">-- All {idx === 1 ? 'Sub' : 'Sub'.repeat(idx)} --</option>}
                    {level.list.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Right Side: Total Products Badge */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-800 text-[11px] font-bold self-start md:self-auto">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            {totalItems} Total Products
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 font-bold">
            No products found matching criteria.
          </div>
        ) : (
          filteredProducts.map((p) => (
            <div 
              key={p.id} 
              className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-premium hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div className="relative h-48 bg-slate-100 shrink-0">
                <img
                  src={p.images[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500'}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
                
                <div className="absolute top-3 left-3">
                  <span className={`
                    px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase shadow-sm border
                    ${p.stockStatus === 'IN_STOCK' 
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                      : p.stockStatus === 'LOW_STOCK'
                        ? 'bg-amber-50 border-amber-100 text-amber-700'
                        : 'bg-red-50 border-red-100 text-red-750'}
                  `}>
                    {p.stockStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                <button
                  onClick={() => handleToggleTrending(p)}
                  className={`
                    absolute top-3 right-3 p-1.5 rounded-full shadow-sm border focus:outline-none transition-colors
                    ${p.isTrending 
                      ? 'bg-orange-500 border-orange-400 text-white animate-pulse' 
                      : 'bg-white border-slate-200 text-slate-405 hover:text-orange-500'}
                  `}
                  title={p.isTrending ? "Trending Active. Click to remove." : "Click to mark as Trending"}
                >
                  <Flame className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 py-0.5 px-2 rounded-full font-bold uppercase">
                    {getCategoryName(p.categoryId)}
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm tracking-tight mt-2 line-clamp-1">{p.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-normal">{p.description}</p>
                </div>

                <div className="flex justify-between items-baseline shrink-0">
                  <span className="text-base font-extrabold text-slate-800">
                    ₹{Number(p.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-405 font-semibold">
                    Qty: <strong className={p.inventoryQty <= 5 ? 'text-red-500 font-bold' : 'text-slate-700'}>{p.inventoryQty}</strong>
                  </span>
                </div>

                {p.trendingScheduledAt && p.isTrending && (
                  <div className="flex items-center gap-1 text-[9px] text-orange-600 font-bold shrink-0">
                    <Calendar className="w-3 h-3" />
                    <span>Trending Scheduled: {new Date(p.trendingScheduledAt).toLocaleDateString()}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-slate-100 shrink-0">
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-semibold text-xs transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="py-1.5 px-3 border border-slate-200 rounded-xl hover:bg-red-50 hover:text-red-500 hover:border-red-100 text-slate-405 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-bold">
            Showing <span className="text-slate-800">{(currentPage - 1) * 12 + 1}</span> to <span className="text-slate-800">{Math.min(currentPage * 12, totalItems)}</span> of <span className="text-slate-800">{totalItems}</span> Products
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="py-1.5 px-4 text-xs font-bold bg-slate-50 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center justify-center px-3 py-1.5 bg-brand-50 text-brand-600 font-extrabold text-xs rounded-xl border border-brand-100">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="py-1.5 px-4 text-xs font-bold bg-slate-50 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto flex flex-col relative animate-scaleUp">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-slate-800 text-base">
                {editingProduct ? 'Edit Catalog Product' : 'Add New Product'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-650 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs font-bold">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Brocade Bandhgala Jacket"
                  className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    placeholder="250.00"
                    className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Stock Quantity *</label>
                  <input
                    type="number"
                    value={formData.inventoryQty}
                    onChange={e => setFormData({ ...formData, inventoryQty: e.target.value })}
                    placeholder="15"
                    className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block">Category Selection *</label>
                    {(() => {
                      const currentPath = findCategoryPath(formData.categoryId) || [];

                      // Build levels: level 0 = root categories, then children of each selected level
                      const levels = [{ list: categories, selected: currentPath[0] || null, parentId: null }];
                      for (let i = 0; i < currentPath.length; i++) {
                        const children = currentPath[i].subCategories || [];
                        if (children.length > 0) {
                          levels.push({ list: children, selected: currentPath[i + 1] || null, parentId: currentPath[i].id });
                        }
                      }

                      return (
                        <div className="flex flex-col gap-2">
                          {levels.map((level, idx) => (
                            <select
                              key={level.parentId || 'root'}
                              value={level.selected?.id || (idx === 0 ? '' : '')}
                              onChange={e => {
                                const val = e.target.value;
                                if (val) {
                                  setFormData({ ...formData, categoryId: val });
                                } else if (idx > 0) {
                                  // User chose placeholder — go back to parent
                                  const parentCat = currentPath[idx - 1];
                                  setFormData({ ...formData, categoryId: parentCat ? parentCat.id : '' });
                                }
                              }}
                              className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 bg-white focus:outline-none focus:border-brand-500 font-semibold"
                            >
                              {idx === 0 && <option value="" disabled>Select Main Category</option>}
                              {idx > 0 && <option value="">{`-- Select Level ${idx + 1} --`}</option>}
                              {level.list.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Target Gender *</label>
                  <select
                    value={formData.targetGender}
                    onChange={e => setFormData({ ...formData, targetGender: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 bg-white focus:outline-none focus:border-brand-500 font-semibold"
                  >
                    <option value="UNISEX">Unisex</option>
                    <option value="MEN">Men</option>
                    <option value="WOMEN">Women</option>
                    <option value="KIDS">Kids</option>
                  </select>
                </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Fabric/Material</label>
                  <input
                    type="text"
                    value={formData.materialInfo}
                    onChange={e => setFormData({ ...formData, materialInfo: e.target.value })}
                    placeholder="e.g. 100% Merino Wool"
                    className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product detailed description..."
                  rows="3"
                  className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                />
              </div>

              <section className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-700">Customer customizations and add-ons</h4>
                  <p className="mt-1 text-[10px] text-slate-500">Category options are inherited by default. Add dress-specific choices or turn inheritance off for this product.</p>
                </div>
                <label className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={formData.inheritCategoryCustomizations} onChange={event => setFormData({ ...formData, inheritCategoryCustomizations: event.target.checked })} className="mt-0.5" />
                  Use options configured on this product's category and parent categories
                </label>
                <CustomizationGroupsEditor value={formData.customizationGroups} onChange={customizationGroups => setFormData({ ...formData, customizationGroups })} inherited={formData.inheritCategoryCustomizations} />
              </section>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Product Images (Up to 4) *</label>
                {[0, 1, 2, 3].map(index => (
                  <div key={index} className="flex gap-3 items-center">
                    <input
                      type="text"
                      value={formData.images[index] || ''}
                      onChange={e => {
                        const newImages = [...formData.images];
                        newImages[index] = e.target.value;
                        setFormData({ ...formData, images: newImages });
                      }}
                      placeholder={`https://example.com/image${index + 1}.jpg`}
                      className="flex-1 text-xs border border-slate-200 rounded-xl py-2.5 px-3 focus:outline-none focus:border-brand-500"
                      required={index === 0}
                    />
                    <label className="cursor-pointer shrink-0 py-2 px-3.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 select-none">
                      <span>{isUploading === index ? 'Uploading...' : 'Upload File'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, index)}
                        className="hidden"
                        disabled={isUploading !== false}
                      />
                    </label>
                  </div>
                ))}
              </div>

              {/* Product Banner Section */}
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center gap-1.5">
                  <Image className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold text-slate-700">Product Banner</span>
                </div>
                <p className="text-[9px] text-slate-400">A hero/cover banner image shown on product pages. This is separate from product gallery images.</p>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={formData.bannerImage}
                    onChange={e => setFormData({ ...formData, bannerImage: e.target.value })}
                    placeholder="https://example.com/banner.jpg"
                    className="flex-1 text-xs border border-slate-200 rounded-xl py-2.5 px-3 focus:outline-none focus:border-brand-500"
                  />
                  <label className="cursor-pointer shrink-0 py-2 px-3.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 select-none">
                    <span>{isBannerUploading ? 'Uploading...' : 'Upload Banner'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerUpload}
                      className="hidden"
                      disabled={isBannerUploading}
                    />
                  </label>
                </div>
                {formData.bannerImage && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-indigo-100 max-h-28">
                    <img src={formData.bannerImage} alt="Banner preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                    <span className="text-xs font-bold text-slate-700">Trending Product Settings</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.isTrending}
                    onChange={e => setFormData({ ...formData, isTrending: e.target.checked })}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-400"
                  />
                </div>
                {formData.isTrending && (
                  <div className="space-y-1 animate-fadeIn">
                    <label className="text-[9px] font-bold text-slate-400 uppercase block">Scheduled Trending Window Start</label>
                    <input
                      type="datetime-local"
                      value={formData.trendingScheduledAt}
                      onChange={e => setFormData({ ...formData, trendingScheduledAt: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-sm"
                >
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
