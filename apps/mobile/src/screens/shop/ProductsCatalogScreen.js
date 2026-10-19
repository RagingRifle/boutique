import React, { useState, useEffect, useRef, useMemo } from 'react';
import WishlistIcon from '../../components/common/WishlistIcon';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  Alert,
  Modal,
  PanResponder,
  Animated
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { toggleWishlist } from '../../utils/toggleWishlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Search,
  SlidersHorizontal,
  ShoppingBag,
  ShoppingCart,
  Heart,
  ChevronRight,
  ChevronDown,
  X,
  CheckSquare,
  Square,
  Check
} from 'lucide-react-native';
import { CustomCartAddIcon, CustomCartAddedIcon } from '../../components/CartIcons';

const { width } = Dimensions.get('window');

// Recursive helper to search categories tree
const findCategoryNode = (nodes, id) => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.subCategories) {
      const found = findCategoryNode(n.subCategories, id);
      if (found) return found;
    }
  }
  return null;
};

// Helper to find root category of any category/subcategory node
const getRootCategoryOfNode = (nodes, id) => {
  const isDescendantOf = (node, targetId) => {
    if (node.id === targetId) return true;
    if (node.subCategories) {
      return node.subCategories.some(child => isDescendantOf(child, targetId));
    }
    return false;
  };
  for (const root of nodes) {
    if (isDescendantOf(root, id)) {
      return root;
    }
  }
  return null;
};

export default function ProductsCatalogScreen({ navigation, route }) {
  const { theme, fonts, shadows } = useTheme();
  const { user, requireAuth } = useAuth();
  
  // Data States
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [cartItems, setCartItems] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState(() => route.params?.categoryId || 'All');
  const [activeFilterTab, setActiveFilterTab] = useState('Product'); // 'Product' or 'Price'
  const [minPrice, setMinPrice] = useState('0');
  const [maxPrice, setMaxPrice] = useState('50000');
  const [absoluteMin, setAbsoluteMin] = useState(0);
  const [absoluteMax, setAbsoluteMax] = useState(50000);
  const [searchQuery, setSearchQuery] = useState(() => route.params?.searchQuery || '');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(() => route.params?.searchQuery || '');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [activeThumb, setActiveThumb] = useState('right');
  const [subCategories, setSubCategories] = useState([]);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [showCategoryHierarchyModal, setShowCategoryHierarchyModal] = useState(false);
  const [activePopupSubCategory, setActivePopupSubCategory] = useState(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  const toggleExpand = (catId) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Get all descendant category IDs (including the node itself) for filtering
  const getAllDescendantIds = (node) => {
    const ids = [node.id];
    if (node.subCategories && node.subCategories.length > 0) {
      node.subCategories.forEach(child => {
        ids.push(...getAllDescendantIds(child));
      });
    }
    return ids;
  };

  // Recursive renderer for category tree nodes
  const renderCategoryNode = (node, depth = 0, rootId = null) => {
    const effectiveRoot = rootId || node.id;
    const isChecked = selectedCategory === node.id;
    const hasSub = node.subCategories && node.subCategories.length > 0;
    const isExpanded = expandedCategories.has(node.id);
    const indentLeft = depth * 16;

    return (
      <View key={node.id}>
        <View style={[styles.checkboxRow, { paddingLeft: indentLeft }]}>
          <TouchableOpacity
            style={styles.expandIconBox}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => { if (hasSub) toggleExpand(node.id); }}
          >
            {hasSub ? (
              isExpanded ? <ChevronDown size={15} color="#a1a1aa" /> : <ChevronRight size={15} color="#a1a1aa" />
            ) : (
              <View style={{ width: 15 }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRowContent}
            activeOpacity={0.65}
            onPress={() => {
              if (isChecked) {
                // Deselect — go back to All
                setSelectedCategory('All');
                setSelectedSubCategory(null);
              } else {
                // Select this node directly (works at any depth)
                setSelectedCategory(node.id);
                setSelectedSubCategory(null);
                if (hasSub) setExpandedCategories(prev => new Set(prev).add(node.id));
              }
            }}
          >
            <View style={[
              styles.customCheckbox,
              depth > 0 && styles.customCheckboxSmall,
              isChecked && styles.customCheckboxActive
            ]}>
              {isChecked && <View style={depth === 0 ? styles.customCheckboxInner : styles.customCheckboxInnerSmall} />}
            </View>
            <Text style={[
              depth === 0 ? styles.checkboxLabel : styles.subCheckboxLabel,
              {
                fontFamily: isChecked ? fonts.semiBold : fonts.regular,
                color: isChecked ? '#18181b' : (depth === 0 ? '#52525b' : '#71717a')
              }
            ]}>
              {node.name}
            </Text>
          </TouchableOpacity>
        </View>

        {isExpanded && hasSub && (
          <View style={{ paddingLeft: indentLeft + 8 }}>
            {node.subCategories.map(child => renderCategoryNode(child, depth + 1, effectiveRoot))}
          </View>
        )}
      </View>
    );
  };

  // Prevents focus listener from double-firing on first screen mount
  const hasMountedRef = useRef(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  // Slider Dragging Logic — use refs so PanResponder closures always read fresh values
  const [sliderWidth, setSliderWidth] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(width)).current;
  const hierarchySlideAnim = useRef(new Animated.Value(width)).current;

  const openFilters = () => {
    setModalVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14
    }).start();
  };

  const closeFilters = () => {
    setIsDraggingSlider(false);
    Animated.timing(slideAnim, {
      toValue: width,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setModalVisible(false));
  };

  const openHierarchyDrawer = () => {
    setShowCategoryHierarchyModal(true);
    hierarchySlideAnim.setValue(width);
    Animated.spring(hierarchySlideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14
    }).start();
  };

  const closeHierarchyDrawer = () => {
    Animated.timing(hierarchySlideAnim, {
      toValue: width,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setShowCategoryHierarchyModal(false));
  };

  const minPriceRef = useRef(Number(minPrice) || 0);
  const maxPriceRef = useRef(Number(maxPrice) || 50000);
  const absoluteMinRef = useRef(absoluteMin);
  const absoluteMaxRef = useRef(absoluteMax);
  const sliderWidthRef = useRef(sliderWidth);
  const leftStartX = useRef(0);
  const rightStartX = useRef(0);
  
  useEffect(() => {
    minPriceRef.current = Number(minPrice) || 0;
    maxPriceRef.current = Number(maxPrice) || 0;
  }, [minPrice, maxPrice]);

  useEffect(() => {
    absoluteMinRef.current = absoluteMin;
    absoluteMaxRef.current = absoluteMax;
  }, [absoluteMin, absoluteMax]);

  useEffect(() => {
    sliderWidthRef.current = sliderWidth;
  }, [sliderWidth]);

  const leftThumbPanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 1,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
         setIsDraggingSlider(true);
         setActiveThumb('left');
         leftStartX.current = minPriceRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
         const aMin = absoluteMinRef.current;
         const aMax = absoluteMaxRef.current;
         const sWidth = sliderWidthRef.current;
         const range = aMax - aMin;
         const minGapPrice = Math.max(100, Math.round(range * 0.02));
         if (range <= 0 || sWidth <= 0) return;
         const deltaPrice = (gestureState.dx / sWidth) * range;
         let rawMin = leftStartX.current + deltaPrice;
         let newMin = Math.round(rawMin / 100) * 100;
         if (newMin < aMin) newMin = aMin;
         if (newMin > maxPriceRef.current - minGapPrice) newMin = maxPriceRef.current - minGapPrice;
         setMinPrice(newMin.toString());
      },
      onPanResponderRelease: () => {
        setIsDraggingSlider(false);
      },
      onPanResponderTerminate: () => {
        setIsDraggingSlider(false);
      },
    }),
  []);

  const rightThumbPanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 1,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
         setIsDraggingSlider(true);
         setActiveThumb('right');
         rightStartX.current = maxPriceRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
         const aMin = absoluteMinRef.current;
         const aMax = absoluteMaxRef.current;
         const sWidth = sliderWidthRef.current;
         const range = aMax - aMin;
         const minGapPrice = Math.max(100, Math.round(range * 0.02));
         if (range <= 0 || sWidth <= 0) return;
         const deltaPrice = (gestureState.dx / sWidth) * range;
         let rawMax = rightStartX.current + deltaPrice;
         let newMax = Math.round(rawMax / 100) * 100;
         if (newMax > aMax) newMax = aMax;
         if (newMax < minPriceRef.current + minGapPrice) newMax = minPriceRef.current + minGapPrice;
         setMaxPrice(newMax.toString());
      },
      onPanResponderRelease: () => {
        setIsDraggingSlider(false);
      },
      onPanResponderTerminate: () => {
        setIsDraggingSlider(false);
      },
    }),
  []);

  // Sync search query or category parameter from HomeScreen when params change (re-navigation)
  useEffect(() => {
    if (route?.params?.searchQuery) {
      setSearchQuery(route.params.searchQuery);
      setDebouncedSearchQuery(route.params.searchQuery);
    }
    if (route?.params?.categoryId) {
      setSelectedCategory(route.params.categoryId);
      if (route.params.categoryId !== 'All') {
        setShowCategoryHierarchyModal(true);
      }
    } else if (!route?.params?.categoryId && !route?.params?.searchQuery) {
      setSelectedCategory('All');
    }

    if (route?.params?.subCategoryId) {
      setSelectedSubCategory(route.params.subCategoryId);
    }
  }, [route?.params]);

  // Set the default Level 2 subcategory and auto-expand all dropdowns when category changes
  useEffect(() => {
    if (selectedCategory && selectedCategory !== 'All' && categories.length > 0) {
      const activeCat = findCategoryNode(categories, selectedCategory);
      if (activeCat && activeCat.subCategories && activeCat.subCategories.length > 0) {
        setActivePopupSubCategory(activeCat.subCategories[0].id);
        
        // Populate set with all category + subcategory IDs to expand them by default
        const idsToExpand = [activeCat.id];
        activeCat.subCategories.forEach(sub => {
          idsToExpand.push(sub.id);
          if (sub.subCategories) {
            sub.subCategories.forEach(child => idsToExpand.push(child.id));
          }
        });
        setExpandedCategories(new Set(idsToExpand));
      } else {
        setActivePopupSubCategory(null);
      }
    }
  }, [selectedCategory, categories]);

  // Bug 3 fix: useCallback captures fresh selectedCategory/debouncedSearchQuery on every change,
  // preventing stale closure bugs in loadMore and the focus listener.
  const loadData = React.useCallback(async (page = 1, append = false) => {
    try {
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      let productsUrl = selectedCategory !== 'All'
        ? `/products?page=${page}&limit=${PAGE_SIZE}&categoryId=${selectedCategory}`
        : `/products?page=${page}&limit=${PAGE_SIZE}`;

      if (debouncedSearchQuery.trim()) {
        productsUrl += `&search=${encodeURIComponent(debouncedSearchQuery.trim())}`;
      }

      const requests = [
        api.get(productsUrl).catch(() => ({ success: false, data: [], pagination: {} })),
      ];

      // Fetch categories, and only fetch favorites/cart if user is logged in
      if (!append) {
        const token = await AsyncStorage.getItem('accessToken').catch(() => null);
        requests.push(api.get('/categories').catch(() => ({ success: false, data: [] })));
        
        if (token) {
          requests.push(
            api.get('/products/favorites').catch(() => ({ success: false, data: [] })),
            api.get('/products/cart').catch(() => ({ success: false, data: [] }))
          );
        } else {
          requests.push(
            Promise.resolve({ success: false, data: [] }),
            Promise.resolve({ success: false, data: [] })
          );
        }
      }

      const results = await Promise.all(requests);
      const productsRes = results[0];

      if (productsRes.success) {
        const prods = productsRes.data || [];
        const pagination = productsRes.pagination || {};

        if (append) {
          setProducts(prev => [...prev, ...prods]);
          if (prods.length > 0) {
            const prices = prods.map(p => Number(p.price) || 0);
            setAbsoluteMin(prev => Math.min(prev, Math.floor(Math.min(...prices))));
            setAbsoluteMax(prev => Math.max(prev, Math.ceil(Math.max(...prices))));
          }
        } else {
          setProducts(prods);
          if (prods.length > 0) {
            const prices = prods.map(p => Number(p.price) || 0);
            const lowest = Math.floor(Math.min(...prices));
            const highest = Math.ceil(Math.max(...prices));
            setAbsoluteMin(lowest);
            setAbsoluteMax(highest);
            setMinPrice(lowest.toString());
            setMaxPrice(highest.toString());
          }
        }

        const totalPages = pagination.pages || 1;
        setHasMore(page < totalPages);
        setCurrentPage(page);
      }

      if (!append) {
        const categoriesRes = results[1];
        const favRes = results[2];
        const cartRes = results[3];
        if (categoriesRes?.success) setCategories(categoriesRes.data || []);
        if (favRes?.success && favRes.data) {
          setFavorites(new Set(favRes.data.map(item => item.productId)));
        }
        if (cartRes?.success && cartRes.data) {
          setCartItems(new Set(cartRes.data.map(item => item.productId)));
        }
      }
    } catch (err) {
      console.error('Error loading catalog data:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedCategory, debouncedSearchQuery]);

  // Reload products whenever category or search changes (also fires on initial mount)
  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    loadData(1, false);
  }, [selectedCategory, debouncedSearchQuery]);

  const loadMoreProducts = () => {
    if (!loadingMore && hasMore && !loading) {
      loadData(currentPage + 1, true);
    }
  };

  // Lightweight favorites+cart refresh helper used by focus listener
  const refreshFavoritesAndCart = React.useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken').catch(() => null);
      if (!token) return;
      
      const [favRes, cartRes] = await Promise.all([
        api.get('/products/favorites').catch(() => ({ success: false, data: [] })),
        api.get('/products/cart').catch(() => ({ success: false, data: [] })),
      ]);
      if (favRes?.success && favRes.data) {
        setFavorites(new Set(favRes.data.map(item => item.productId)));
      }
      if (cartRes?.success && cartRes.data) {
        setCartItems(new Set(cartRes.data.map(item => item.productId)));
      }
    } catch (err) {
      console.error('Error refreshing favorites/cart:', err);
    }
  }, []);

  // Bug 1 & 4 fix: focus listener only does a lightweight favorites/cart refresh on re-focus.
  // The initial load is driven entirely by the [selectedCategory, debouncedSearchQuery] effect above.
  // hasMountedRef prevents the first focus event from triggering a duplicate full reload.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return; // skip — initial load already handled by category/search useEffect
      }
      refreshFavoritesAndCart();
    });
    return unsubscribe;
  }, [navigation, refreshFavoritesAndCart]);

  // Bug 2 fix: price range is now managed entirely inside loadData.
  // The old useEffect([products]) that reset min/maxPrice on every pagination
  // has been removed — slider position is now only reset on fresh category/search loads.

  // Load Subcategories when Category changes
  useEffect(() => {
    if (selectedCategory !== 'All' && categories.length > 0) {
      const category = findCategoryNode(categories, selectedCategory);
      setSubCategories(category?.subCategories || []);
    } else {
      setSubCategories([]);
    }
  }, [selectedCategory, categories]);

  const toggleFavorite = (productId) =>
    toggleWishlist({ productId, favorites, setFavorites, user, requireAuth });

  const handleAddToCart = async (productId) => {
    try {
      const inCart = cartItems.has(productId);
      if (!inCart) {
        const res = await api.post('/products/cart', { productId, quantity: 1 });
        if (res.success) {
          setCartItems(prev => {
            const next = new Set(prev);
            next.add(productId);
            return next;
          });
          Alert.alert('Success', 'Added to cart successfully!');
        }
      } else {
        navigation.navigate('Cart');
      }
    } catch (err) {
      const errorMsg = err?.message || 'Unable to add item to cart. Please try again.';
      Alert.alert('Error', errorMsg);
    }
  };

  // Filter products locally for price range
  const getFilteredProducts = () => {
    let result = products;

    // Filter by Price Range
    if (minPrice !== '' && maxPrice !== '') {
      const min = Number(minPrice) || 0;
      const max = Number(maxPrice) || Infinity;
      result = result.filter(product => {
        const price = Number(product.price);
        return price >= min && price <= max;
      });
    }

    // No client-side filtering by searchQuery or category since the backend already handles those

    return result;
  };

  // Helper functions for visual slider positions
  const getThumbLeftPercent = () => {
    if (absoluteMax <= absoluteMin) return 0;
    const currentMin = Number(minPrice) || 0;
    const minPercent = ((currentMin - absoluteMin) / (absoluteMax - absoluteMin)) * 100;
    return Math.max(0, Math.min(100, minPercent));
  };

  const getThumbRightPercent = () => {
    if (absoluteMax <= absoluteMin) return 100;
    const currentMax = Number(maxPrice) || 0;
    const maxPercent = ((currentMax - absoluteMin) / (absoluteMax - absoluteMin)) * 100;
    return Math.max(0, Math.min(100, maxPercent));
  };

  if (loading && products.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        {/* Header Search Bar Skeleton */}
        <View style={styles.searchRow}>
          <View style={[styles.searchBarContainer, { backgroundColor: theme.border }]} />
          <View style={[styles.filterSettingsBtn, { backgroundColor: theme.border }]} />
          <View style={[styles.wishlistHeaderBtn, { backgroundColor: theme.border }]} />
        </View>
        
        <View style={styles.scrollContent}>
          {/* Categories Title Skeleton */}
          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <View style={[styles.skeletonLine, { width: 120, height: 16, backgroundColor: theme.border }]} />
          </View>
          
          {/* Categories Horizontal Tabs Skeletons */}
          <View style={{ flexDirection: 'row', gap: 10, paddingLeft: 20, marginBottom: 20 }}>
            {[1, 2, 3].map((idx) => (
              <View key={idx} style={[styles.categoryTab, { backgroundColor: theme.border, width: 80, height: 38 }]} />
            ))}
          </View>

          {/* Grid Skeletons */}
          <View style={styles.gridContainer}>
            {[1, 2, 3, 4].map((idx) => (
              <View key={idx} style={[styles.productCard, { backgroundColor: theme.bg.card, height: 220, opacity: 0.6 }]}>
                <View style={[styles.productImageWrapper, { backgroundColor: theme.border }]} />
                <View style={{ padding: 10, gap: 8 }}>
                  <View style={[styles.skeletonLine, { width: '80%', height: 12, backgroundColor: theme.border }]} />
                  <View style={[styles.skeletonLine, { width: '50%', height: 12, backgroundColor: theme.border }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  const renderPopupCategoryNode = (node, depth = 0) => {
    const isChecked = selectedCategory === node.id;
    const hasSub = node.subCategories && node.subCategories.length > 0;
    const isExpanded = expandedCategories.has(node.id);

    return (
      <View key={node.id} style={{ marginBottom: 8 }}>
        <TouchableOpacity
          style={[
            styles.popupCategoryCard,
            {
              backgroundColor: isChecked ? '#EDE0ED' : (depth === 0 ? '#F8F8FA' : '#FFFFFF'),
              borderColor: isChecked ? theme.brand[500] : '#F4F4F5',
              marginLeft: depth * 14,
            }
          ]}
          activeOpacity={0.75}
          onPress={() => {
            setSelectedCategory(node.id);
            setSelectedSubCategory(null);
            setShowCategoryHierarchyModal(false);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
            {/* Minimalist Selection Radio Check */}
            <View style={[
              styles.popupRadioCircle,
              isChecked && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
            ]}>
              {isChecked && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
            </View>

            <Text style={[
              styles.popupTreeLabel,
              {
                fontFamily: isChecked ? fonts.bold : (depth === 0 ? fonts.semiBold : fonts.regular),
                color: isChecked ? theme.brand[500] : theme.text.primary,
                fontSize: depth === 0 ? 14.5 : 13.5
              }
            ]}>
              {node.name}
            </Text>

            {hasSub && (
              <View style={styles.popupSubBadge}>
                <Text style={[styles.popupSubBadgeText, { fontFamily: fonts.medium }]}>
                  {node.subCategories.length} {node.subCategories.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
            )}
          </View>

          {hasSub && (
            <TouchableOpacity
              style={styles.popupTreeExpandIcon}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => toggleExpand(node.id)}
            >
              {isExpanded ? <ChevronDown size={18} color="#71717A" /> : <ChevronRight size={18} color="#71717A" />}
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {isExpanded && hasSub && (
          <View style={{ marginTop: 4 }}>
            {node.subCategories.map(child => renderPopupCategoryNode(child, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  const renderCategoryHierarchyModal = () => {
    if (selectedCategory === 'All') return null;

    const parentCat = getRootCategoryOfNode(categories, selectedCategory);
    if (!parentCat) return null;

    return (
      <Modal
        visible={showCategoryHierarchyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCategoryHierarchyModal(false)}
      >
        <TouchableOpacity 
          style={styles.popupModalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowCategoryHierarchyModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[styles.popupModalContainer, { backgroundColor: theme.bg.card }]}
          >
            {/* Top Drag Indicator */}
            <View style={styles.popupDragHandle} />

            {/* Header */}
            <View style={styles.popupModalHeader}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.popupModalTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                    {parentCat.name}
                  </Text>
                </View>
                <Text style={[styles.popupModalSubtitle, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                  Select a collection or subcategory
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.popupCloseBtn}
                onPress={() => setShowCategoryHierarchyModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={theme.text.primary} />
              </TouchableOpacity>
            </View>

            {/* Tree Accordion Dropdown List */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.popupModalScroll}>
              <View style={{ paddingBottom: 16 }}>
                {renderPopupCategoryNode(parentCat, 0)}
              </View>
            </ScrollView>

            {/* View All / Reset Footer */}
            <View style={[styles.popupModalFooter, { borderTopColor: '#F4F4F5' }]}>
              <TouchableOpacity
                style={styles.popupViewAllBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedCategory(parentCat.id);
                  setSelectedSubCategory(null);
                  setShowCategoryHierarchyModal(false);
                }}
              >
                <Text style={[styles.popupViewAllBtnText, { fontFamily: fonts.bold }]}>
                  View All {parentCat.name}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  const filteredProducts = getFilteredProducts();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      
      {/* Header Search Bar */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBarContainer, { backgroundColor: theme.bg.card }, shadows.premium]}>
          <Search size={18} color="#9e9e9e" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { fontFamily: fonts.regular, color: theme.text.primary }]}
            placeholder="Search.."
            placeholderTextColor="#9e9e9e"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#9e9e9e" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={[styles.filterSettingsBtn, { backgroundColor: theme.bg.card }, shadows.premium]} 
          activeOpacity={0.7} 
          onPress={openFilters}
        >
          <SlidersHorizontal size={18} color="#1e1e1e" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.wishlistHeaderBtn, { backgroundColor: theme.bg.card }, shadows.premium]} 
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Wishlist')}
        >
          <Heart size={18} color="#1e1e1e" />
        </TouchableOpacity>
      </View>

      {/* Floating Filter Loader Indicator */}
      {loading && products.length > 0 && (
        <View style={styles.filteringFloatingLoader}>
          <ActivityIndicator size="small" color={theme.brand[500]} />
          <Text style={[styles.filteringFloatingLoaderText, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>
            Filtering products...
          </Text>
        </View>
      )}

      <View style={{ flex: 1, opacity: loading ? 0.5 : 1 }}>
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onEndReached={loadMoreProducts}
          onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <>
            {/* Active Category Header */}
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  {selectedCategory === 'All' ? 'Products' : (findCategoryNode(categories, selectedCategory)?.name || 'Products')}
                </Text>
                {selectedCategory !== 'All' && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#EDE0ED',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 12,
                      gap: 4,
                    }}
                    onPress={() => setShowCategoryHierarchyModal(true)}
                  >
                    <Text style={{ fontSize: 11, fontFamily: fonts.semiBold, color: '#3D2E3D' }}>Subcategories</Text>
                    <ChevronDown size={12} color="#3D2E3D" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Horizontal Subcategory Filter Pills */}
            {subCategories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}
              >
                <TouchableOpacity
                  style={[
                    styles.subCategoryPill,
                    selectedSubCategory === null && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                  ]}
                  onPress={() => {
                    const parentCat = getRootCategoryOfNode(categories, selectedCategory);
                    if (parentCat) setSelectedCategory(parentCat.id);
                    setSelectedSubCategory(null);
                  }}
                >
                  <Text style={[
                    styles.subCategoryText,
                    { fontFamily: fonts.medium, color: selectedSubCategory === null ? '#ffffff' : theme.text.secondary }
                  ]}>All</Text>
                </TouchableOpacity>
                {subCategories.map(sub => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[
                      styles.subCategoryPill,
                      (selectedCategory === sub.id || selectedSubCategory === sub.id) && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                    ]}
                    onPress={() => {
                      setSelectedCategory(sub.id);
                      setSelectedSubCategory(sub.id);
                    }}
                  >
                    <Text style={[
                      styles.subCategoryText,
                      { fontFamily: fonts.medium, color: (selectedCategory === sub.id || selectedSubCategory === sub.id) ? '#ffffff' : theme.text.secondary }
                    ]}>
                      {sub.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        }
        renderItem={({ item }) => {
            const isFav = favorites.has(item.id);
            const inCart = cartItems.has(item.id);
            const originalPrice = item.originalPrice ? Number(item.originalPrice) : null;

            return (
              <TouchableOpacity
                style={[styles.productCard, shadows.premium, { backgroundColor: theme.bg.card }]}
                onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
                activeOpacity={0.9}
              >
                <View style={styles.productImageWrapper}>
                  <Image
                    source={{ uri: (item.images && item.images[0]) || undefined }}
                    style={styles.productImage}
                  />
                </View>
                
                <View style={styles.productInfo}>
                  <Text style={[styles.productName, { fontFamily: fonts.semiBold, color: theme.text.primary }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.priceRow}>
                    <View style={styles.priceContainer}>
                      <Text style={{ fontSize: 10, color: '#7A6B7A', marginBottom: 2 }}>Starts from</Text>
                      <Text style={[styles.productPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                        ₹{Number(item.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </Text>
                      {originalPrice ? (
                        <Text style={[styles.originalPriceText, { color: '#B8A8B8' }]}>
                          ₹{originalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.wishlistBtnBottom}
                      onPress={() => toggleFavorite(item.id)}
                      activeOpacity={0.6}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <WishlistIcon
                        size={22}
                        color={isFav ? '#ef4444' : '#94a3b8'}
                        fill={isFav ? '#ef4444' : 'transparent'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
        }}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color={theme.brand[500]} />
              <Text style={[styles.loadingMoreText, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                Loading more products...
              </Text>
            </View>
          ) : !hasMore && filteredProducts.length > 0 ? (
            <View style={styles.loadingMoreContainer}>
              <Text style={[styles.loadingMoreText, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                You've seen all products
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <ShoppingBag size={48} color="#9e9e9e" />
              <Text style={[styles.emptyText, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>
                No products found in this category.
              </Text>
            </View>
          ) : null
        }
      />
      </View>

      {/* Filters Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeFilters}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop pressable area */}
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={closeFilters} 
          />

          <Animated.View style={[styles.sideDrawer, { backgroundColor: theme.bg.main, transform: [{ translateX: slideAnim }] }, shadows.premium]}>
            <View style={{ flex: 1 }}>
              <View style={styles.filterDrawerHeader}>
                <Text style={[styles.filterDrawerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>Filter by category</Text>
                <TouchableOpacity onPress={closeFilters} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={20} color={theme.text.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.filterDrawerSubheader}>
                 <Text style={[styles.filterDrawerSubText, { color: theme.text.secondary }]}>
                   {selectedCategory === 'All' && !selectedSubCategory ? 'No filters selected' : '1 filter selected'}
                 </Text>
              </View>

              <ScrollView 
                scrollEnabled={!isDraggingSlider}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={{ paddingBottom: 24 }}
              >
              {/* Category Tree */}
              <View style={styles.categoryCheckboxList}>
                {categories.map(cat => renderCategoryNode(cat, 0))}
              </View>

              {/* Minimalist Premium Price Range Slider */}
              <View style={[styles.priceFilterContainer, { marginTop: 16 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={[styles.filterLabel, { fontFamily: fonts.bold, color: theme.text.primary, fontSize: 16, marginBottom: 0, marginTop: 0, paddingHorizontal: 0 }]}>
                    Price Range
                  </Text>
                  <Text style={{ fontFamily: fonts.bold, color: theme.brand[500], fontSize: 13 }}>
                    ₹{Number(minPrice).toLocaleString('en-IN')} — ₹{Number(maxPrice).toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Minimalist Slider Visual */}
                <View
                  style={styles.sliderVisualContainer}
                  onLayout={e => setSliderWidth(e.nativeEvent.layout.width)}
                >
                  {/* Background track line */}
                  <View style={styles.sliderTrackLine} />
                  {/* Active range fill */}
                  <View style={[
                    styles.sliderActiveLine,
                    {
                      left: `${getThumbLeftPercent()}%`,
                      width: `${Math.max(0, getThumbRightPercent() - getThumbLeftPercent())}%`,
                    }
                  ]} />
                  {/* Left (Min) Thumb */}
                  <View
                    style={[styles.sliderThumbContainer, { left: `${getThumbLeftPercent()}%` }]}
                    {...leftThumbPanResponder.panHandlers}
                  >
                    <View style={styles.sliderThumbCircle} />
                  </View>
                  {/* Right (Max) Thumb */}
                  <View
                    style={[styles.sliderThumbContainer, { left: `${getThumbRightPercent()}%` }]}
                    {...rightThumbPanResponder.panHandlers}
                  >
                    <View style={styles.sliderThumbCircle} />
                  </View>
                </View>

                {/* Quick Budget Preset Chips */}
                <Text style={{ fontFamily: fonts.medium, color: theme.text.secondary, fontSize: 12, marginBottom: 8, marginTop: 4 }}>
                  Quick Budget Presets
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'All', min: absoluteMin, max: absoluteMax },
                    { label: 'Under ₹5k', min: 0, max: 5000 },
                    { label: '₹5k - ₹15k', min: 5000, max: 15000 },
                    { label: '₹15k - ₹30k', min: 15000, max: 30000 },
                    { label: 'Above ₹30k', min: 30000, max: Math.max(50000, absoluteMax) },
                  ].map((preset, pIdx) => {
                    const isActive = Number(minPrice) === preset.min && Number(maxPrice) === preset.max;
                    return (
                      <TouchableOpacity
                        key={pIdx}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: isActive ? theme.brand[500] : '#e4e4e7',
                          backgroundColor: isActive ? '#EDE0ED' : theme.bg.card,
                        }}
                        onPress={() => {
                          setMinPrice(preset.min.toString());
                          setMaxPrice(preset.max.toString());
                        }}
                      >
                        <Text style={{
                          fontSize: 11,
                          fontFamily: isActive ? fonts.bold : fonts.medium,
                          color: isActive ? theme.brand[500] : theme.text.primary,
                        }}>
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Min / Max Editable Inputs */}
                <View style={styles.priceInputsRow}>
                  <View style={styles.priceInputBox}>
                    <Text style={[styles.priceInputLabel, { fontFamily: fonts.medium }]}>MIN</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.priceCurrencySymbol, { fontFamily: fonts.bold }]}>₹</Text>
                      <TextInput
                        style={[styles.priceInputValue, { fontFamily: fonts.bold }]}
                        value={minPrice}
                        onChangeText={val => {
                          const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
                          if (!isNaN(n)) setMinPrice(Math.min(n, Number(maxPrice) - 1).toString());
                          else setMinPrice('');
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View style={styles.priceInputBox}>
                    <Text style={[styles.priceInputLabel, { fontFamily: fonts.medium }]}>MAX</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.priceCurrencySymbol, { fontFamily: fonts.bold }]}>₹</Text>
                      <TextInput
                        style={[styles.priceInputValue, { fontFamily: fonts.bold }]}
                        value={maxPrice}
                        onChangeText={val => {
                          const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
                          if (!isNaN(n)) setMaxPrice(Math.max(n, Number(minPrice) + 1).toString());
                          else setMaxPrice('');
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              </View>
              
            </ScrollView>
            
            <View style={styles.filterActionsRowFixed}>
              <TouchableOpacity 
                style={styles.cancelFilterBtnLight} 
                onPress={() => { setSelectedCategory('All'); setSelectedSubCategory(null); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelFilterBtnTextLight, { fontFamily: fonts.bold }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.applyFilterBtnBlack} 
                onPress={closeFilters}
                activeOpacity={0.8}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.applyFilterBtnBlackText, { fontFamily: fonts.bold }]}>Apply filters</Text>
                )}
              </TouchableOpacity>
            </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {renderCategoryHierarchyModal()}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonLine: {
    borderRadius: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 10,
    gap: 12,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
  },
  filterSettingsBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
  },
  seeAllText: {
    fontSize: 12,
  },
  subCategoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subCategoryText: {
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  sideDrawer: {
    width: width * 0.85,
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    flexDirection: 'column',
  },
  filterDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 8,
  },
  filterDrawerTitle: {
    fontSize: 18,
  },
  filterDrawerSubheader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  filterDrawerSubText: {
    fontSize: 13,
  },
  filterTabsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
    paddingHorizontal: 20,
  },
  topFilterTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  topFilterTabText: {
    fontSize: 15,
    color: '#a1a1aa', // gray
  },
  topFilterTabTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -1,
    width: 40,
    height: 4,
    backgroundColor: '#000000',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  filterLabel: {
    fontSize: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
    marginTop: 8,
  },
  filterTabsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  filterTabPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabText: {
    fontSize: 14,
    textAlign: 'center',
  },
  priceFilterContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  sliderVisualContainer: {
    height: 48,
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
    marginHorizontal: 10,
  },
  sliderTrackLine: {
    height: 4,
    width: '100%',
    backgroundColor: '#E4E4E7',
    borderRadius: 2,
    position: 'absolute',
    top: 22,
  },
  sliderActiveLine: {
    height: 4,
    backgroundColor: '#18181B',
    borderRadius: 2,
    position: 'absolute',
    top: 22,
  },
  sliderThumbContainer: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    top: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  sliderThumbCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#18181B',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  priceInputsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 10,
  },
  priceInputBox: {
    flex: 1,
    backgroundColor: '#f4f4f5',
    padding: 16,
    borderRadius: 16,
  },
  priceInputLabel: {
    color: '#71717a',
    fontSize: 13,
    marginBottom: 6,
  },
  priceCurrencySymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginRight: 4,
  },
  priceInputValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    padding: 0,
    flex: 1,
  },
  filterActionsRowFixed: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    borderTopWidth: 1,
    borderTopColor: '#f4f4f5',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  categoryCheckboxList: {
    paddingHorizontal: 20,
  },
  checkboxItemWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  expandIconBox: {
    width: 28,
    alignItems: 'center',
    marginRight: 2,
  },
  checkboxRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  customCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d4d4d8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customCheckboxActive: {
    borderColor: '#18181b',
    backgroundColor: '#18181b',
  },
  customCheckboxSmall: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  customCheckboxInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  customCheckboxInnerSmall: {
    width: 8,
    height: 8,
    borderRadius: 1,
    backgroundColor: '#ffffff',
  },
  checkboxLabel: {
    fontSize: 15,
  },
  subCategoryCheckboxList: {
    paddingLeft: 42,
    paddingBottom: 8,
  },
  subCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  subCheckboxLabel: {
    fontSize: 14,
  },
  applyFilterBtnBlack: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFilterBtnBlackText: {
    color: '#ffffff',
    fontSize: 14,
  },
  cancelFilterBtnLight: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelFilterBtnTextLight: {
    color: '#18181b',
    fontSize: 14,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  loadingMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
  },
  productCard: {
    borderRadius: 20,
    overflow: 'hidden',
    width: '48%',
    marginBottom: 16,
  },
  productImageWrapper: {
    position: 'relative',
    height: 160,
    width: '100%',
    backgroundColor: '#eaeaea',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  wishlistBtnBottom: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    padding: 10,
    gap: 4,
    height: 104,
    position: 'relative',
  },
  productName: {
    fontSize: 13,
    lineHeight: 17,
    height: 34,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  priceContainer: {
    flex: 1,
    paddingRight: 36,
  },
  productPrice: {
    fontSize: 13,
  },
  originalPriceText: {
    fontSize: 10,
    color: '#B8A8B8',
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  cartBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  midBanner: {
    width: width - 40,
    height: 75,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginVertical: 12,
    alignSelf: 'center',
  },
  midBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  midBannerPercent: {
    fontSize: 28,
    color: '#ffffff',
  },
  midBannerText: {
    fontSize: 12,
    color: '#ffffff',
    lineHeight: 15,
  },
  midBannerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  seeAllBtnText: {
    fontSize: 11,
  },
  wishlistHeaderBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  popupModalContainer: {
    width: '100%',
    maxHeight: '75%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  popupDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4E7',
    alignSelf: 'center',
    marginBottom: 16,
  },
  popupModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 4,
  },
  popupModalTitle: {
    fontSize: 18,
    letterSpacing: -0.2,
  },
  popupModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  popupCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupModalScroll: {
    marginVertical: 4,
  },
  popupCategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  popupRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    borderColor: '#D4D4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupSubBadge: {
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
  },
  popupSubBadgeText: {
    fontSize: 11,
    color: '#71717A',
  },
  popupTreeExpandIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupTreeLabel: {
    fontSize: 14,
  },
  popupModalFooter: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 8,
  },
  popupViewAllBtn: {
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  popupViewAllBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  filteringFloatingLoader: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 8,
    zIndex: 999,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  filteringFloatingLoaderText: {
    fontSize: 12,
  },
});
