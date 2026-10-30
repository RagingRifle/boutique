import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Share
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import WishlistIcon from '../../components/common/WishlistIcon';
import {
  ChevronLeft,
  Share2,
  CalendarCheck,
  Sparkles,
  Truck,
  ShoppingBag,
  Zap
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function ProductDetailsScreen({ route, navigation }) {
  const { productId } = route.params;
  const { theme, fonts, shadows } = useTheme();
  const { user, requireAuth } = useAuth();

  // Data & Control States
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isFav, setIsFav] = useState(false);
  const [isInCart, setIsInCart] = useState(false);
  const [selectedSize, setSelectedSize] = useState('L'); // S, M, L, XL
  const [selectedCustomizations, setSelectedCustomizations] = useState({});
  const [adding, setAdding] = useState(false);
  const [activeThumbnailIndex, setActiveThumbnailIndex] = useState(0);
  const mainImageScrollRef = useRef(null);
  
  const [similarCategoryProducts, setSimilarCategoryProducts] = useState([]);
  const [similarSubCategoryProducts, setSimilarSubCategoryProducts] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [activeOffers, setActiveOffers] = useState([]);

  const loadProductDetails = async () => {
    try {
      if (!product || product.id !== productId) {
        setLoading(true);
      }
      const [prodRes, cartRes, favRes, allProductsRes, categoriesRes, offersRes] = await Promise.all([
        api.get(`/products/${productId}`).catch(err => ({ success: false, _err: err })),
        api.get('/products/cart').catch(() => ({ success: false, data: [] })),
        api.get('/products/favorites').catch(() => ({ success: false, data: [] })),
        api.get('/products?page=1&limit=200').catch(() => ({ success: false, data: [] })),
        api.get('/categories').catch(() => ({ success: false, data: [] })),
        api.get('/offers/active').catch(() => ({ success: false, data: [] }))
      ]);

      if (prodRes.success) {
        const prod = prodRes.data;
        setProduct(prod);
        setActiveThumbnailIndex(0);

        if (categoriesRes.success) {
          const cat = categoriesRes.data.find(c => c.id === prod.categoryId);
          if (cat) setCategoryName(cat.name);
        }

        if (allProductsRes.success) {
          const allProds = allProductsRes.data || [];
          const sameCategoryProds = allProds.filter(p => p.id !== prod.id && p.categoryId === prod.categoryId);
          setSimilarCategoryProducts(sameCategoryProds);
        }

        if (offersRes.success && offersRes.data) {
          const applicable = offersRes.data.filter(offer => {
            const isStorewide = (!offer.applicableProductIds || offer.applicableProductIds.length === 0) &&
                                (!offer.applicableCategoryIds || offer.applicableCategoryIds.length === 0);
            const isProductMatch = offer.applicableProductIds?.includes(prod.id);
            const isCategoryMatch = offer.applicableCategoryIds?.includes(prod.categoryId);
            return isStorewide || isProductMatch || isCategoryMatch;
          });
          setActiveOffers(applicable);
        }
      } else {
        console.warn('Product not found or failed to load:', prodRes);
        Alert.alert('Error', 'Product not found or failed to load.');
        navigation.goBack();
        return;
      }

      if (cartRes.success && cartRes.data) {
        const cartItem = cartRes.data.find(item => item.productId === productId);
        setIsInCart(Boolean(cartItem));
        setSelectedCustomizations(cartItem?.selectedCustomizations
          ? Object.fromEntries(cartItem.selectedCustomizations.map(group => [group.groupId, group.options.map(option => option.optionId)]))
          : {});
      }
      if (favRes.success && favRes.data) {
        setIsFav(favRes.data.some(item => item.productId === productId));
      }
    } catch (err) {
      console.warn('Error loading product details:', err.message);
      // Don't navigate back — just stop loading so user isn't trapped
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProductDetails();
  }, [productId]);

  const toggleFavorite = () => {
    if (!user) {
      Alert.alert('Login required', 'Please log in to add products to your wishlist.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log in', onPress: () => requireAuth() },
      ]);
      return;
    }
    if (!product) return;
    const wasFavorite = isFav;
    setIsFav(!wasFavorite);
    const request = wasFavorite
      ? api.delete(`/products/favorites/${product.id}`)
      : api.post('/products/favorites', { productId: product.id });
    request.catch(err => {
      setIsFav(wasFavorite);
      console.warn('Favorite toggle failed:', err.message);
    });
  };

  const handleAddToCart = async () => {
    requireAuth(async () => {
      if (!product) return;
    const missingRequired = (product.customizationGroups || []).find(group => group.required && !(selectedCustomizations[group.id] || []).length);
    if (missingRequired) {
      Alert.alert('Choose an option', `Please choose an option for ${missingRequired.name}.`);
      return;
    }

    setAdding(true);
    try {
      const res = await api.post('/products/cart', {
        productId: product.id,
        quantity: quantity,
        selectedCustomizations: Object.entries(selectedCustomizations).map(([groupId, optionIds]) => ({ groupId, optionIds })),
      });

      if (res.success) {
        setIsInCart(true);
        Alert.alert(
          isInCart ? 'Cart Updated' : 'Added to Cart',
          'Your product choices and pricing have been saved to your cart.',
          [
            { text: 'Continue Shopping', style: 'cancel' },
            { text: 'View Cart', onPress: () => navigation.navigate('Cart') }
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add item to cart.');
    } finally {
        setAdding(false);
      }
    });
  };

  const handleBuyNow = () => {
    requireAuth(() => {
      if (!product) return;
      const missingRequired = (product.customizationGroups || []).find(group => group.required && !(selectedCustomizations[group.id] || []).length);
      if (missingRequired) {
        Alert.alert('Choose an option', `Please choose an option for ${missingRequired.name}.`);
        return;
      }
      const directCheckoutItem = {
        id: 'direct_' + Date.now(),
        productId: product.id,
        quantity: quantity,
        product: product,
        selectedCustomizations: (product.customizationGroups || []).flatMap(group => {
          const choices = (selectedCustomizations[group.id] || []).map(optionId => {
            const option = group.options.find(candidate => candidate.id === optionId);
            return option ? { optionId: option.id, name: option.name, price: Number(option.price) } : null;
          }).filter(Boolean);
          return choices.length ? [{ groupId: group.id, name: group.name, options: choices }] : [];
        }),
        unitPrice: Number(product.price) + (product.customizationGroups || []).reduce((sum, group) => sum + (selectedCustomizations[group.id] || []).reduce((groupSum, optionId) => groupSum + Number(group.options.find(option => option.id === optionId)?.price || 0), 0), 0),
      };
      navigation.navigate('Checkout', {
        cartItems: [directCheckoutItem],
        appliedCoupon: null,
        discountAmount: 0
      });
    });
  };

  const handleBookConsultation = () => {
    requireAuth(() => {
      if (!product) return;
      navigation.navigate('BespokeBooking', {
        prefillProduct: product.name,
        prefillCategory: categoryName || 'Product Consultation',
        prefillProductImage: product.images && product.images[0] ? product.images[0] : ''
      });
    });
  };

  const handleShareProduct = async () => {
    if (!product) return;
    try {
      const mainImage = product.images && product.images[0] ? product.images[0] : '';
      const priceText = `₹${Number(product.price).toLocaleString('en-IN')}`;
      const productDeepLink = `marcos://product/${product.id}`;

      // Amazon-Style Rich Share Message with App Name & Deep Link
      const shareMessage = `🛍️ *MARCOS Bespoke Couture*\n\n✨ *${product.name}*\n💰 Price: ${priceText}\n\n📲 Tap to view in MARCOS App:\n${productDeepLink}`;

      await Share.share({
        title: `${product.name} | MARCOS Bespoke Couture`,
        message: shareMessage,
        url: mainImage || undefined,
      });
    } catch (error) {
      console.warn('Share error:', error.message);
    }
  };

  if (loading && (!product || product.id !== productId)) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        {/* Header Skeleton */}
        <View style={styles.headerBar}>
          <View style={[styles.headerBtn, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: theme.border }]} />
          <View style={[styles.headerBtn, { backgroundColor: theme.border }]} />
        </View>

        <View style={styles.scrollContent}>
          {/* Large Image Block Skeleton */}
          <View style={[styles.imageCard, { backgroundColor: theme.border, height: 320 }]} />
          
          {/* Info Section Skeleton */}
          <View style={styles.infoSection}>
            <View style={[styles.skeletonLine, { width: '60%', height: 24, backgroundColor: theme.border }]} />
            <View style={[styles.skeletonLine, { width: '45%', height: 20, backgroundColor: theme.border }]} />
            <View style={[styles.skeletonLine, { width: '90%', height: 60, backgroundColor: theme.border, marginTop: 10 }]} />
          </View>
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 }]}>
        <Text style={{ fontSize: 16, color: theme.text.secondary, textAlign: 'center', fontFamily: fonts.medium }}>
          Could not load product details. Please check your connection and try again.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: theme.brand[500], paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 }}
          onPress={() => { setLoading(true); loadProductDetails(); }}
        >
          <Text style={{ color: '#3D2E3D', fontFamily: fonts.bold }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: theme.text.secondary, fontFamily: fonts.medium }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const thumbnails = (product.images && product.images.length > 0) 
    ? product.images 
    : [];

  // Check if any active offer grants free delivery for this product
  const hasFreeDelivery = product.hasFreeShipping || activeOffers.some(
    offer => offer.isFreeShipping || offer.type === 'FREE_SHIPPING'
  );
  const selectedCustomizationPrice = (product.customizationGroups || []).reduce((sum, group) =>
    sum + (selectedCustomizations[group.id] || []).reduce((groupSum, optionId) =>
      groupSum + Number(group.options.find(option => option.id === optionId)?.price || 0), 0), 0);

  // Horizontal card renderer (for category products)
  const renderHorizontalProduct = (item) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.similarCard, { backgroundColor: theme.bg.card }, shadows.premium]}
      onPress={() => navigation.push('ProductDetails', { productId: item.id })}
      activeOpacity={0.8}
    >
      {item.images && item.images[0] ? (
        <Image 
          source={{ uri: item.images[0] }} 
          style={styles.similarImage} 
        />
      ) : (
        <View style={[styles.similarImage, { backgroundColor: theme.border, alignItems: 'center', justifyContent: 'center' }]}>
          <ShoppingBag size={28} color={theme.text.muted} />
        </View>
      )}
      <View style={styles.similarInfo}>
        <Text style={[styles.similarName, { fontFamily: fonts.semiBold, color: theme.text.primary }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.similarPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          ₹{Number(item.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Vertical grid card renderer (for subcategory products)
  const renderGridProduct = (item) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.gridCard, { backgroundColor: theme.bg.card }, shadows.premium]}
      onPress={() => navigation.push('ProductDetails', { productId: item.id })}
      activeOpacity={0.8}
    >
      {item.images && item.images[0] ? (
        <Image 
          source={{ uri: item.images[0] }} 
          style={styles.gridImage} 
        />
      ) : (
        <View style={[styles.gridImage, { backgroundColor: theme.border, alignItems: 'center', justifyContent: 'center' }]}>
          <ShoppingBag size={28} color={theme.text.muted} />
        </View>
      )}
      <View style={styles.gridInfo}>
        <Text style={[styles.gridName, { fontFamily: fonts.semiBold, color: theme.text.primary }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.gridPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          ₹{Number(item.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </Text>
        {item.hasFreeShipping && (
          <View style={styles.gridFreeShipBadge}>
            <Truck size={10} color="#16a34a" />
            <Text style={styles.gridFreeShipText}>Free Delivery</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium]} onPress={() => navigation.goBack()}>
          <ChevronLeft size={20} color="#1e1e1e" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Details
        </Text>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium]} onPress={handleShareProduct} activeOpacity={0.7}>
          <Share2 size={20} color="#1e1e1e" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Product Banner Image (above product images) */}
        {product.bannerImage ? (
          <Image 
            source={{ uri: product.bannerImage }} 
            style={[styles.bannerImage, shadows.premium]} 
            resizeMode="cover"
          />
        ) : null}

        {/* Large Product Image Card */}
        <View style={[styles.imageCard, shadows.premium]}>
          {thumbnails.length > 0 ? (
            <ScrollView
              ref={mainImageScrollRef}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={event => {
                const pageWidth = width - 40;
                setActiveThumbnailIndex(Math.max(0, Math.min(thumbnails.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth))));
              }}
            >
              {thumbnails.map((imageUri, index) => (
                <Image
                  key={`${product.id}-gallery-${index}`}
                  source={{ uri: imageUri }}
                  style={[styles.mainImage, { width: width - 40 }]}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.mainImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg.input }]}>
              <ShoppingBag size={42} color={theme.text.muted} />
            </View>
          )}
          <TouchableOpacity style={styles.heartBtn} activeOpacity={0.7} onPress={toggleFavorite}>
            <WishlistIcon size={20} color={isFav ? '#ef4444' : theme.brand[900]} fill={isFav ? '#ef4444' : 'transparent'} />
          </TouchableOpacity>
          {thumbnails.length > 1 && (
            <View style={{ position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(15,23,42,0.42)' }}>
              {thumbnails.map((_, index) => <View key={`gallery-dot-${index}`} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: index === activeThumbnailIndex ? '#fff' : 'rgba(255,255,255,0.5)' }} />)}
            </View>
          )}
        </View>
        
        {/* Thumbnails Row (Moved under main image) */}
        {thumbnails.length > 1 && (
          <View style={styles.thumbnailsRow}>
            {thumbnails.map((thumb, index) => {
              const isActive = index === activeThumbnailIndex;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.thumbnailWrapper, isActive && { borderColor: theme.brand[500], borderWidth: 2 }]}
                  onPress={() => {
                    setActiveThumbnailIndex(index);
                    mainImageScrollRef.current?.scrollTo({ x: index * (width - 40), animated: true });
                  }}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: thumb }} style={styles.thumbnailImage} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Product Meta Section */}
        <View style={styles.infoSection}>
          <View style={styles.titlePriceRow}>
            <View style={styles.titleCol}>
              <Text style={[styles.productName, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                {product.name}
              </Text>
              <Text style={[styles.categoryText, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                {product.materialInfo || 'Bespoke Premium Fabric'}
              </Text>
              {hasFreeDelivery && (
                <View style={[styles.freeDeliveryRow, { marginTop: 8 }]}>
                  <Truck size={14} color="#16a34a" style={{ marginRight: 5 }} />
                  <Text style={styles.freeDeliveryText}>Free Delivery</Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 10, color: theme.text.muted, fontFamily: fonts.medium, marginBottom: 2 }}>
                Starts from
              </Text>
              <Text style={[styles.productPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                ₹{Number(product.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>

          {/* Active Offers Section */}
          {activeOffers && activeOffers.length > 0 && (
            <View style={styles.offersContainer}>
              <View style={styles.offersHeader}>
                <Sparkles size={14} color={theme.brand[500]} style={{ marginRight: 6 }} />
                <Text style={[styles.offersHeading, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                  Special Promos & Offers
                </Text>
              </View>
              {activeOffers.map(offer => {
                const isFreeShip = offer.isFreeShipping || offer.type === 'FREE_SHIPPING';
                let offerTag = '';
                if (offer.type === 'PERCENTAGE') {
                  offerTag = `${offer.discountValue}% OFF`;
                } else if (offer.type === 'FLAT') {
                  offerTag = `₹${offer.discountValue} OFF`;
                } else if (isFreeShip) {
                  offerTag = 'FREE SHIP';
                }

                return (
                  <View key={offer.id} style={[styles.offerRow, { borderColor: theme.border, backgroundColor: theme.bg.input }]}>
                    <View style={[styles.offerBadge, { backgroundColor: theme.brand[500] }]}>
                      <Text style={[styles.offerBadgeText, { fontFamily: fonts.bold }]}>{offerTag}</Text>
                    </View>
                    <View style={styles.offerTextCol}>
                      <Text style={[styles.offerRowTitle, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={1}>
                        {offer.title}
                      </Text>
                      {offer.description ? (
                        <Text style={[styles.offerRowDesc, { fontFamily: fonts.medium, color: theme.text.secondary }]} numberOfLines={1}>
                          {offer.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}



          {(product.customizationGroups || []).length > 0 && (
            <View style={{ marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: theme.bg.card, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ fontFamily: fonts.bold, color: theme.text.primary, fontSize: 15, marginBottom: 4 }}>Customize this item</Text>
              <Text style={{ fontFamily: fonts.regular, color: theme.text.muted, fontSize: 12, marginBottom: 12 }}>Choose available options. Any extra price is shown beside the choice.</Text>
              {product.customizationGroups.map(group => (
                <View key={group.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ fontFamily: fonts.bold, color: theme.text.primary, fontSize: 13 }}>{group.name}{group.required ? ' *' : ''}</Text>
                  <Text style={{ fontFamily: fonts.regular, color: theme.text.muted, fontSize: 10, marginTop: 2 }}>{group.selectionType === 'MULTIPLE' ? 'Choose any that you want' : 'Choose one'}{group.required ? ' · Required' : ' · Optional'}</Text>
                  {(Array.isArray(group.options) ? group.options : []).map(option => {
                    const chosen = (selectedCustomizations[group.id] || []).includes(option.id);
                    return (
                      <TouchableOpacity key={option.id} onPress={() => setSelectedCustomizations(current => {
                        const selected = current[group.id] || [];
                        const next = group.selectionType === 'SINGLE'
                          ? (chosen ? [] : [option.id])
                          : (chosen ? selected.filter(id => id !== option.id) : [...selected, option.id]);
                        return { ...current, [group.id]: next };
                      })} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <View style={{ width: 20, height: 20, borderRadius: group.selectionType === 'SINGLE' ? 10 : 5, borderWidth: 1.5, borderColor: chosen ? theme.brand[500] : theme.border, backgroundColor: chosen ? theme.brand[500] : 'transparent', marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                            {chosen ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text> : null}
                          </View>
                          <Text style={{ fontFamily: fonts.medium, color: theme.text.primary, fontSize: 13, flex: 1 }}>{option.name}</Text>
                        </View>
                        <Text style={{ fontFamily: fonts.semiBold, color: Number(option.price) > 0 ? theme.brand[500] : theme.text.muted, fontSize: 12 }}>{Number(option.price) > 0 ? `+ ₹${Number(option.price).toLocaleString('en-IN')}` : 'Included'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(!Array.isArray(group.options) || group.options.length === 0) && (
                    <Text style={{ color: '#B42318', fontFamily: fonts.medium, fontSize: 12, marginTop: 8 }}>
                      No choices are configured for this group yet. Ask the admin to add choices and prices under Category CRUD.
                    </Text>
                  )}
                </View>
              ))}
              <Text style={{ marginTop: 10, textAlign: 'right', fontFamily: fonts.bold, color: theme.text.primary, fontSize: 13 }}>
                Product total with selected options: ₹{(Number(product.price) + selectedCustomizationPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          )}

          {/* Description Section */}
          <View style={styles.descriptionSection}>
            <Text style={[styles.sectionLabel, { fontFamily: fonts.bold, color: theme.text.primary, marginBottom: 8 }]}>
              Description
            </Text>
            <Text style={[styles.descriptionText, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
              {product.description || 'No description available for this luxury product. Every thread tells a story of craftsmanship.'}{' '}
              <Text style={{ color: theme.brand[500], fontFamily: fonts.bold }}>Learn More</Text>
            </Text>
          </View>
        </View>

        {/* Same Category Products Section (2 Cards per Row Grid) */}
        {similarCategoryProducts.length > 0 && (
          <View style={styles.similarSection}>
            <View style={styles.similarHeader}>
              <Text style={[styles.similarTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                More in {categoryName || 'this Category'}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'Browse', params: { categoryId: product.categoryId } })}>
                <Text style={[styles.seeAllText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.gridContainer}>
              {similarCategoryProducts.map(renderGridProduct)}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions - Two Row Layout */}
      <View style={[styles.bottomActionsContainer, shadows.premium]}>
        {/* Top Row: Add to Cart + Buy Now */}
        <View style={styles.topActionsRow}>
          <TouchableOpacity
            style={[
              styles.addToCartBtn,
              { borderColor: theme.brand[500], backgroundColor: theme.bg.card }
            ]}
            onPress={handleAddToCart}
            activeOpacity={0.8}
            disabled={adding}
          >
            {adding ? (
              <ActivityIndicator size="small" color={theme.brand[500]} />
            ) : (
              <>
                <ShoppingBag size={17} color={theme.brand[500]} style={{ marginRight: 7 }} />
                <Text style={[styles.addToCartBtnText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                  {isInCart ? 'UPDATE CART' : 'ADD TO CART'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buyNowBtn, { backgroundColor: '#3D2E3D' }]}
            onPress={handleBuyNow}
            activeOpacity={0.8}
          >
            <Zap size={17} color="#ffffff" style={{ marginRight: 7 }} />
            <Text style={[styles.buyNowBtnText, { fontFamily: fonts.bold, color: '#ffffff' }]}>
              BUY NOW
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Row: Wishlist + Book a Slot */}
        <View style={styles.bottomActionsRow}>
          <TouchableOpacity
            style={[
              styles.wishlistActionBtn,
              { borderColor: isFav ? '#ef4444' : theme.border, backgroundColor: isFav ? '#fff0f0' : theme.bg.card }
            ]}
            onPress={toggleFavorite}
            activeOpacity={0.8}
          >
            <WishlistIcon
              size={22}
              color={isFav ? '#ef4444' : theme.brand[900]}
              fill={isFav ? '#ef4444' : 'transparent'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bookSlotBtn, { backgroundColor: theme.brand[500] }]}
            onPress={handleBookConsultation}
            activeOpacity={0.8}
          >
            <CalendarCheck size={18} color="#3D2E3D" style={{ marginRight: 8 }} />
            <Text style={[styles.bookSlotBtnText, { fontFamily: fonts.bold, color: '#3D2E3D' }]}>
              BOOK A SLOT
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
  skeletonTitle: {
    width: 100,
    height: 20,
    borderRadius: 6,
  },
  skeletonLine: {
    borderRadius: 4,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
  },
  scrollContent: {
    paddingBottom: 175,
    paddingHorizontal: 20,
  },
  imageCard: {
    borderRadius: 24,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    height: 380,
    position: 'relative',
    // Removed paddingBottom to keep it clean for the main image
  },
  bannerImage: {
    width: '100%',
    height: 100, // Reduced height for better proportion
    borderRadius: 20,
    marginBottom: 16,
    marginTop: 4,
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  heartBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbnailsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 4,
  },
  thumbnailWrapper: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#eaeaea',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  infoSection: {
    marginTop: 20,
    gap: 20,
  },
  titlePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleCol: {
    flex: 1,
    marginRight: 16,
  },
  productName: {
    fontSize: 22,
    lineHeight: 28,
  },
  categoryText: {
    fontSize: 13,
    marginTop: 4,
  },
  productPrice: {
    fontSize: 22,
  },
  freeDeliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  freeDeliveryText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: 'bold',
  },
  selectorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  sizeSection: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 14,
    marginBottom: 10,
  },
  sizesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeText: {
    fontSize: 13,
  },
  qtySection: {
    justifyContent: 'flex-end',
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f7',
    borderRadius: 12,
    height: 38,
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 14,
    marginHorizontal: 10,
    minWidth: 16,
    textAlign: 'center',
  },
  descriptionSection: {
    marginTop: 5,
  },
  descriptionText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  bottomActionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f2',
  },
  topActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addToCartBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToCartBtnText: {
    fontSize: 13,
    letterSpacing: 1,
  },
  buyNowBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowBtnText: {
    fontSize: 13,
    letterSpacing: 1,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  wishlistActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookSlotBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookSlotBtnText: {
    fontSize: 13,
    letterSpacing: 1.1,
  },
  similarSection: {
    marginTop: 32,
    marginBottom: 8,
  },
  similarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  similarTitle: {
    fontSize: 18,
  },
  seeAllText: {
    fontSize: 13,
  },
  similarScroll: {
    gap: 16,
    paddingRight: 20, // Add padding at end of scroll
  },
  similarCard: {
    width: 150,
    borderRadius: 16,
    overflow: 'hidden',
  },
  similarImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#eaeaea',
  },
  similarInfo: {
    padding: 10,
    gap: 4,
  },
  similarName: {
    fontSize: 13,
  },
  similarPrice: {
    fontSize: 14,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridCard: {
    width: (width - 52) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 4,
  },
  gridImage: {
    width: '100%',
    height: (width - 52) / 2,
    backgroundColor: '#eaeaea',
  },
  gridInfo: {
    padding: 10,
    gap: 3,
  },
  gridName: {
    fontSize: 13,
  },
  gridPrice: {
    fontSize: 14,
  },
  gridFreeShipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  gridFreeShipText: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: 'bold',
  },
  offersContainer: {
    marginTop: 8,
    gap: 8,
  },
  offersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  offersHeading: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  offerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBadgeText: {
    color: '#ffffff',
    fontSize: 10,
  },
  offerTextCol: {
    flex: 1,
  },
  offerRowTitle: {
    fontSize: 12.5,
  },
  offerRowDesc: {
    fontSize: 10,
    marginTop: 1,
  },

});
