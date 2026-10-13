import React, { useState, useEffect } from 'react';
import WishlistIcon from '../../components/common/WishlistIcon';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { toggleWishlist } from '../../utils/toggleWishlist';
import { Alert } from 'react-native';
import { ArrowLeft, Sparkles, ShoppingBag, ShoppingCart, SlidersHorizontal } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function NewArrivalsScreen({ navigation }) {
  const { theme, fonts, shadows } = useTheme();
  const { user, requireAuth } = useAuth();
  const [products, setProducts] = useState([]);
  const [favorites, setFavorites] = useState(new Set());

  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('All'); // 'All', 'Men', 'Women', 'Kids', 'Unisex'
  const [showCategories, setShowCategories] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodRes, favRes] = await Promise.all([
        api.get('/products'),
        api.get('/products/favorites').catch(() => ({ success: false, data: [] }))
      ]);

      if (prodRes.success) {
        const items = [...prodRes.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setProducts(items);
      }
      if (favRes.success && favRes.data) {
        setFavorites(new Set(favRes.data.map(item => item.productId)));
      }

    } catch (err) {
      console.error('Error loading new arrivals data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation]);

  const toggleFavorite = (productId) =>
    toggleWishlist({ productId, favorites, setFavorites, user, requireAuth });

  const renderProductItem = ({ item }) => {
    const isFav = favorites.has(item.id);
    const originalPrice = item?.originalPrice ? Number(item.originalPrice) : null;

    return (
      <TouchableOpacity 
        style={[styles.prodCard, shadows.premium, { backgroundColor: theme.bg.card, borderColor: theme.border }]}
        onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
        activeOpacity={0.9}
      >
        <View style={[styles.prodImageWrapper, { backgroundColor: theme.bg.hover }]}>
          <Image 
            source={{ uri: (item.images && item.images[0]) || 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=300&auto=format&fit=crop' }} 
            style={styles.prodImage}
            resizeMode="cover"
          />
          
          <View style={[styles.newBadge, { backgroundColor: theme.brand[500] }]}>
            <Text style={[styles.newBadgeText, { fontFamily: fonts.bold, color: theme.brand[900] }]}>NEW</Text>
          </View>

          <TouchableOpacity 
            style={styles.favBtn}
            onPress={() => toggleFavorite(item.id)}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <WishlistIcon 
              size={15} 
              color={isFav ? '#ef4444' : theme.brand[900]} 
              fill={isFav ? '#ef4444' : 'transparent'} 
            />
          </TouchableOpacity>
        </View>

        <View style={styles.prodInfo}>
          <Text style={[styles.prodCategoryText, { fontFamily: fonts.bold, color: theme.brand[700] }]}>
            NEW ARRIVAL
          </Text>
          <Text style={[styles.prodName, { fontFamily: fonts.bold, color: theme.brand[900] }]} numberOfLines={1}>
            {item.name}
          </Text>
          
          <View style={styles.priceRow}>
            <Text style={[styles.prodPrice, { fontFamily: fonts.bold, color: theme.brand[900] }]}>
              ₹{Number(item.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
            {originalPrice ? (
              <Text style={[styles.originalPriceText, { fontFamily: fonts.medium }]}>
                ₹{originalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredProducts = products.filter(product => {
    if (selectedTab === 'All') return true;
    if (selectedTab === 'Men') return product.targetGender === 'MEN';
    if (selectedTab === 'Women') return product.targetGender === 'WOMEN';
    if (selectedTab === 'Kids') return product.targetGender === 'KIDS';
    if (selectedTab === 'Unisex') return product.targetGender === 'UNISEX';
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      {/* Header */}
      <View style={[styles.header, { borderColor: theme.border }]}>
        <TouchableOpacity 
          style={[styles.backBtn, { backgroundColor: theme.bg.card, borderColor: theme.border }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={theme.brand[900]} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.brand[900] }]}>
            New Arrivals
          </Text>
          <Text style={[styles.headerSubtitle, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
            Be the first to discover our latest couture pieces
          </Text>
        </View>
        <TouchableOpacity 
          style={[styles.filterSettingsBtn, { backgroundColor: showCategories ? theme.brand[500] : theme.bg.card }, shadows.premium]} 
          activeOpacity={0.7} 
          onPress={() => setShowCategories(v => !v)}
        >
          <SlidersHorizontal size={18} color={theme.brand[900]} />
        </TouchableOpacity>
      </View>

      {/* Categories Tabs Row */}
      {showCategories && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesTabsRow}>
          {['All', 'Men', 'Women', 'Kids', 'Unisex'].map((tab) => {
            const isActive = selectedTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.categoryTab,
                  isActive ? { backgroundColor: theme.brand[500] } : { backgroundColor: theme.bg.card },
                  shadows.premium
                ]}
                activeOpacity={0.8}
                onPress={() => setSelectedTab(tab)}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    { fontFamily: fonts.medium },
                    isActive ? { color: theme.brand[900], fontFamily: fonts.bold } : { color: theme.text.secondary }
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Product list */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.brand[500]} />
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
            No products found for this category.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderProductItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridPadding}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  filterSettingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  categoriesTabsRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    maxHeight: 64,
  },
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
  },
  categoryTabText: {
    fontSize: 13,
  },
  gridPadding: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  prodCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  prodImageWrapper: {
    position: 'relative',
    height: 185,
    width: '100%',
  },
  prodImage: {
    width: '100%',
    height: '100%',
  },
  favBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  newBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 5,
  },
  newBadgeText: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  prodInfo: {
    padding: 10,
    gap: 3,
  },
  prodCategoryText: {
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  prodName: {
    fontSize: 13,
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  prodPrice: {
    fontSize: 14,
  },
  originalPriceText: {
    fontSize: 11,
    color: '#B8A8B8',
    textDecorationLine: 'line-through',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
