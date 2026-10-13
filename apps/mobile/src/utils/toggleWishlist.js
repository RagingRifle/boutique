import { Alert } from 'react-native';
import api from './api';

export function toggleWishlist({ productId, favorites, setFavorites, user, requireAuth }) {
  if (!user) {
    Alert.alert(
      'Login required',
      'Please log in to add products to your wishlist.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log in', onPress: () => requireAuth() },
      ]
    );
    return;
  }

  const wasFavorite = favorites.has(productId);
  setFavorites(previous => {
    const next = new Set(previous);
    if (wasFavorite) next.delete(productId);
    else next.add(productId);
    return next;
  });

  const request = wasFavorite
    ? api.delete(`/products/favorites/${productId}`)
    : api.post('/products/favorites', { productId });

  request.catch(error => {
    setFavorites(previous => {
      const next = new Set(previous);
      if (wasFavorite) next.add(productId);
      else next.delete(productId);
      return next;
    });
    console.error('Error toggling favorite:', error);
  });
}
