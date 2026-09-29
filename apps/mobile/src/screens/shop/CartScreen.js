import React, { useState, useEffect } from 'react';
import WishlistIcon from '../../components/common/WishlistIcon';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import {
  ChevronLeft,
  ShoppingBag,
  Trash2,
  Minus,
  Plus,
  ChevronsRight,
  Gift
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function CartScreen({ navigation }) {
  const { theme, fonts, shadows } = useTheme();
  
  // Data States
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [qtyUpdating, setQtyUpdating] = useState(null);
  const [availableCoupons, setAvailableCoupons] = useState([]);

  const loadCart = async () => {
    try {
      if (cartItems.length === 0) {
        setLoading(true);
      }
      const [cartRes, couponsRes] = await Promise.all([
        api.get('/products/cart'),
        api.get('/auth/loyalty/coupons').catch(() => null)
      ]);
      if (cartRes.success) {
        setCartItems(cartRes.data || []);
      }
      if (couponsRes && couponsRes.success) {
        setAvailableCoupons(couponsRes.data || []);
      }
    } catch (err) {
      console.error('Error fetching cart:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadCart();
    });
    return unsubscribe;
  }, [navigation]);

  const handleUpdateQty = async (productId, currentQty, change) => {
    const newQty = currentQty + change;
    if (newQty < 1) return;

    try {
      setQtyUpdating(productId);
      const res = await api.post('/products/cart', {
        productId,
        quantity: newQty,
        selectedCustomizations: (cartItems.find(item => item.productId === productId)?.selectedCustomizations || []).map(group => ({
          groupId: group.groupId,
          optionIds: (group.options || []).map(option => option.optionId),
        })),
      });
      if (res.success) {
        setCartItems(prev => prev.map(item =>
          item.productId === productId ? { ...item, quantity: newQty } : item
        ));
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update quantity.');
    } finally {
      setQtyUpdating(null);
    }
  };

  const handleRemoveItem = async (productId) => {
    try {
      const res = await api.delete(`/products/cart/${productId}`);
      if (res.success) {
        setCartItems(prev => prev.filter(item => item.productId !== productId));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to remove item.');
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    setCouponLoading(true);
    try {
      const res = await api.post('/products/cart/coupon', { code: couponCode });
      if (res.success && res.coupon) {
        setAppliedCoupon(res.coupon);
        Alert.alert('Coupon Applied', `Coupon '${res.coupon.code}' applied successfully.`);
      }
    } catch (err) {
      setAppliedCoupon(null);
      Alert.alert('Invalid Coupon', err.message || 'Failed to apply coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSelectCoupon = async (code) => {
    setCouponCode(code);
    setCouponLoading(true);
    try {
      const res = await api.post('/products/cart/coupon', { code });
      if (res.success && res.coupon) {
        setAppliedCoupon(res.coupon);
        Alert.alert('Coupon Applied', `Coupon '${res.coupon.code}' applied successfully.`);
      }
    } catch (err) {
      setAppliedCoupon(null);
      Alert.alert('Invalid Coupon', err.message || 'Failed to apply coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    navigation.navigate('Checkout', {
      cartItems,
      appliedCoupon,
      discountAmount: discountVal
    });
  };

  // Mathematical Calculations
  const subtotal = cartItems.reduce((sum, item) => sum + (Number(item.unitPrice ?? item.product.price) * item.quantity), 0);
  
  let discountVal = 0;
  if (appliedCoupon) {
    if (Number(appliedCoupon.discountPercent) > 0) {
      discountVal = subtotal * (Number(appliedCoupon.discountPercent) / 100);
      if (appliedCoupon.maxDiscount && discountVal > Number(appliedCoupon.maxDiscount)) {
        discountVal = Number(appliedCoupon.maxDiscount);
      }
    } else if (Number(appliedCoupon.discountFlat) > 0) {
      discountVal = Number(appliedCoupon.discountFlat);
    }
  }

  const grandTotal = Math.max(0, subtotal - discountVal);

  if (loading && cartItems.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        {/* Header Skeleton */}
        <View style={styles.headerBar}>
          <View style={[styles.skeletonBtn, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonBtn, { backgroundColor: theme.border }]} />
        </View>

        <View style={styles.scrollContent}>
          {/* Cart Items Skeletons */}
          {[1, 2].map((idx) => (
            <View key={idx} style={[styles.skeletonCard, shadows.premium, { backgroundColor: theme.border }]} />
          ))}

          {/* Pricing Skeleton */}
          <View style={[styles.skeletonCard, shadows.premium, { backgroundColor: theme.border, height: 140, marginTop: 10 }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium]} onPress={() => navigation.goBack()}>
          <ChevronLeft size={20} color="#1e1e1e" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          My Cart
        </Text>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium]} onPress={() => navigation.navigate('Wishlist')} activeOpacity={0.7}>
          <WishlistIcon size={20} color="#1e1e1e" />
        </TouchableOpacity>
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ShoppingBag size={48} color="#9e9e9e" style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Your Cart is Empty
          </Text>
          <Text style={[styles.emptySubtitle, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
            Discover our collection of custom masterpieces and add items to your cart.
          </Text>
          <TouchableOpacity
            style={[styles.exploreBtn, { backgroundColor: theme.brand[500] }]}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Browse' })}
          >
            <Text style={[styles.exploreBtnText, { fontFamily: fonts.bold, color: '#3D2E3D' }]}>
              EXPLORE CATALOG
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadCart} colors={[theme.brand[500]]} />
            }
          >
            
            {/* Cart Items List */}
          <View style={styles.listContainer}>
            {cartItems.map((item) => (
              <View key={item.id} style={[styles.itemCard, shadows.premium, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
                <Image
                  source={{ uri: (item.product.images && item.product.images[0]) || 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&q=80' }}
                  style={styles.itemImage}
                />
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemName, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={2}>
                      {item.product.name}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemoveItem(item.productId)} activeOpacity={0.7} style={styles.deleteBtn}>
                      <Trash2 size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.itemSize, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                    Size: L
                  </Text>
                  {(item.selectedCustomizations || []).map(group => (
                    <Text key={group.groupId} style={[styles.itemSize, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                      {group.name}: {(group.options || []).map(option => `${option.name}${Number(option.price) > 0 ? ` (+₹${Number(option.price).toLocaleString('en-IN')})` : ''}`).join(', ')}
                    </Text>
                  ))}
                  <View style={styles.priceRow}>
                    <View>
            <Text style={{ fontSize: 10, color: '#7A6B7A', marginBottom: 2 }}>Starts from</Text>
            <Text style={[styles.itemPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                      ₹{Number(item.unitPrice ?? item.product.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
          </View>
                    
                    {/* Quantity Selector */}
                    <View style={[styles.qtyContainer, { backgroundColor: theme.bg.main, borderColor: theme.border }]}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, { backgroundColor: theme.bg.card }, shadows.premium]}
                        onPress={() => handleUpdateQty(item.productId, item.quantity, -1)}
                        disabled={qtyUpdating === item.productId}
                        activeOpacity={0.7}
                      >
                        <Minus size={16} color={theme.text.primary} />
                      </TouchableOpacity>
                      {qtyUpdating === item.productId ? (
                        <ActivityIndicator size="small" color={theme.brand[500]} style={{ width: 20, marginHorizontal: 12 }} />
                      ) : (
                        <Text style={[styles.qtyText, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                          {item.quantity}
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[styles.qtyBtn, { backgroundColor: theme.brand[500] }, shadows.premium]}
                        onPress={() => handleUpdateQty(item.productId, item.quantity, 1)}
                        disabled={qtyUpdating === item.productId}
                        activeOpacity={0.7}
                      >
                        <Plus size={16} color="#3D2E3D" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Promo Coupon Section */}
          <View style={[styles.promoContainer, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <TextInput
              style={[styles.promoInput, { fontFamily: fonts.regular, color: theme.text.primary, borderColor: theme.border }]}
              placeholder="Enter Discount Code"
              placeholderTextColor="#9e9e9e"
              value={couponCode}
              onChangeText={setCouponCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.promoBtn, { borderColor: theme.border }]}
              onPress={handleApplyCoupon}
              disabled={couponLoading}
            >
              {couponLoading ? (
                <ActivityIndicator size="small" color={theme.brand[500]} />
              ) : (
                <Text style={[styles.promoBtnText, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  Apply
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {availableCoupons.length > 0 && !appliedCoupon && (
            <View style={styles.availableCouponsWrapper}>
              <Text style={[styles.availableCouponsTitle, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>
                Your Redeemed Vouchers:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.availableCouponsScroll}>
                {availableCoupons.map(coupon => (
                  <TouchableOpacity
                    key={coupon.id}
                    style={[styles.availableCouponPill, { borderColor: theme.brand[200], backgroundColor: theme.brand[50] }]}
                    onPress={() => handleSelectCoupon(coupon.code)}
                    activeOpacity={0.7}
                  >
                    <Gift size={12} color={theme.brand[500]} />
                    <Text style={[styles.availableCouponText, { fontFamily: fonts.bold, color: theme.brand[700] }]}>
                      {coupon.code} (₹{Number(coupon.discountFlat).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          </ScrollView>

          {/* Sticky Bottom Section */}
          <View style={[styles.stickyBottomContainer, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
            {/* Billing Calculations */}
            <View style={[styles.billContainer, shadows.premium, { backgroundColor: theme.bg.main }]}>
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                Est. Subtotal:
              </Text>
              <Text style={[styles.billValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                ₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
            {discountVal > 0 && (
              <View style={styles.billRow}>
                <Text style={[styles.billLabel, { fontFamily: fonts.medium, color: theme.brand[500] }]}>
                  Discount:
                </Text>
                <Text style={[styles.billValue, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                  - ₹{discountVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            )}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.billRow}>
              <Text style={[styles.totalLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                Est. Total:
              </Text>
              <Text style={[styles.totalValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>

          {/* Swipe-to-Checkout Styled Button */}
          <TouchableOpacity
            style={[styles.checkoutBtn, { backgroundColor: theme.brand[500] }, shadows.premium]}
            onPress={handleCheckout}
            disabled={checkoutLoading}
            activeOpacity={0.9}
          >
            {checkoutLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <View style={styles.checkoutChevronCircle}>
                  <ChevronsRight size={18} color={theme.brand[500]} />
                </View>
                <Text style={[styles.checkoutText, { fontFamily: fonts.bold }]}>
                  Proceed to Checkout
                </Text>
                <View style={{ width: 32 }} />
              </>
            )}
          </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stickyBottomContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  skeletonTitle: {
    width: 100,
    height: 20,
    borderRadius: 6,
  },
  skeletonCard: {
    height: 110,
    borderRadius: 24,
    marginBottom: 16,
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
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  listContainer: {
    marginTop: 14,
    gap: 20,
    marginBottom: 24,
  },
  itemCard: {
    flexDirection: 'row',
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  itemImage: {
    width: 90,
    height: 100,
    borderRadius: 18,
    backgroundColor: '#eaeaea',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'space-between',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  deleteBtn: {
    padding: 6,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
  },
  itemSize: {
    fontSize: 13,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  itemPrice: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 15,
    marginHorizontal: 12,
    minWidth: 20,
    textAlign: 'center',
  },
  promoContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 8,
    gap: 10,
    marginBottom: 20,
  },
  promoInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  promoBtn: {
    width: 80,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBtnText: {
    fontSize: 13,
  },
  billContainer: {
    borderRadius: 20,
    padding: 18,
    gap: 12,
    marginBottom: 16,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLabel: {
    fontSize: 14.5,
  },
  billValue: {
    fontSize: 14.5,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 16,
  },
  totalValue: {
    fontSize: 18,
  },
  checkoutBtn: {
    height: 60,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 0,
  },
  checkoutChevronCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutText: {
    fontSize: 16,
    color: '#3D2E3D',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  exploreBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  exploreBtnText: {
    fontSize: 12,
    letterSpacing: 1,
  },
  availableCouponsWrapper: {
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  availableCouponsTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  availableCouponsScroll: {
    gap: 8,
  },
  availableCouponPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  availableCouponText: {
    fontSize: 11,
  },
});
