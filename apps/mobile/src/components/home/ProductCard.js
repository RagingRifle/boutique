import React, { memo } from 'react';
import WishlistIcon from '../common/WishlistIcon';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

const ProductCard = memo(function ProductCard({
  item,
  isHorizontal = false,
  isFav,
  inCart,
  theme,
  fonts,
  shadows,
  navigation,
  toggleFavorite,
  handleAddToCart,
}) {
  const originalPrice = item?.originalPrice ? Number(item.originalPrice) : null;

  return (
    <TouchableOpacity
      style={[
        styles.productCard,
        shadows.premium,
        { backgroundColor: theme.bg.card },
        isHorizontal && { width: 160, marginBottom: 10 }
      ]}
      onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
      activeOpacity={0.9}
    >
      <View style={styles.productImageWrapper}>
        <Image
          source={{ uri: (item.images && item.images[0]) || 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&q=80' }}
          style={styles.productImage}
        />

        {item.hasFreeShipping && (
          <View style={[styles.freeShippingBadge, { backgroundColor: '#EDE0ED' }]}>
            <Text style={[styles.freeShippingText, { color: '#6B4B6B' }]}>Free Shipping</Text>
          </View>
        )}
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
});

export default ProductCard;

const styles = StyleSheet.create({
  productCard: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '47%',
    marginBottom: 16,
  },
  productImageWrapper: {
    position: 'relative',
    height: 160,
    backgroundColor: '#f1f5f9',
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
  freeShippingBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopRightRadius: 8,
  },
  freeShippingText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  productInfo: {
    padding: 12,
    height: 112,
    position: 'relative',
  },
  productName: {
    fontSize: 14,
    lineHeight: 18,
    height: 36,
    marginBottom: 6,
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
    fontSize: 15,
  },
  originalPriceText: {
    fontSize: 11,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  cartBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
