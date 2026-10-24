import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../styles/ThemeContext';
import { Platform, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Polygon } from 'react-native-svg';

// Auth Screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginIdentifierScreen from '../screens/auth/LoginIdentifierScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import SetupPasswordScreen from '../screens/auth/SetupPasswordScreen';
import OtpVerifyScreen from '../screens/auth/OtpVerifyScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import TermsOfServiceScreen from '../screens/auth/TermsOfServiceScreen';

// Core Screens
import HomeScreen from '../screens/core/HomeScreen';
import ReelsScreen from '../screens/core/ReelsScreen';
import MoreScreen from '../screens/core/MoreScreen';

// Shop Screens
import ProductsCatalogScreen from '../screens/shop/ProductsCatalogScreen';
import ProductDetailsScreen from '../screens/shop/ProductDetailsScreen';
import SearchScreen from '../screens/shop/SearchScreen';

import TrendingProductsScreen from '../screens/shop/TrendingProductsScreen';
import NewArrivalsScreen from '../screens/shop/NewArrivalsScreen';
import BestSellersScreen from '../screens/shop/BestSellersScreen';
import RecommendedProductsScreen from '../screens/shop/RecommendedProductsScreen';
import SeasonalCollectionsScreen from '../screens/shop/SeasonalCollectionsScreen';
import FestivalOffersScreen from '../screens/shop/FestivalOffersScreen';
import DiscountsScreen from '../screens/shop/DiscountsScreen';
import WishlistScreen from '../screens/shop/WishlistScreen';
import CheckoutScreen from '../screens/shop/CheckoutScreen';
import StoreLocatorScreen from '../screens/shop/StoreLocatorScreen';

// Services Screens
import AppointmentBookingScreen from '../screens/services/AppointmentBookingScreen';
import StoreVisitRequestScreen from '../screens/services/StoreVisitRequestScreen';
import BespokeBookingScreen from '../screens/services/BespokeBookingScreen';

// Account Screens
import ProfileScreen from '../screens/account/ProfileScreen';
import LoyaltyDashboardScreen from '../screens/account/LoyaltyDashboardScreen';
import InviteEarnScreen from '../screens/account/InviteEarnScreen';
import NotificationHistoryScreen from '../screens/account/NotificationHistoryScreen';
import SupportTicketScreen from '../screens/account/SupportTicketScreen';
import SupportTicketChatScreen from '../screens/account/SupportTicketChatScreen';
import OrderHistoryScreen from '../screens/account/OrderHistoryScreen';
import OrderTrackingScreen from '../screens/account/OrderTrackingScreen';
import AccountDetailsScreen from '../screens/account/AccountDetailsScreen';
import PaymentsScreen from '../screens/account/PaymentsScreen';
import PrivacyPolicyScreen from '../screens/account/PrivacyPolicyScreen';
import RefundPolicyScreen from '../screens/account/RefundPolicyScreen';
import ShippingPolicyScreen from '../screens/account/ShippingPolicyScreen';

// Icon library
import {
  Home,
  ShoppingCart,
  User as UserIcon,
  Calendar,
  ShoppingBag,
  } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack Navigation
export function AuthNavigator() {
  const { login } = useAuth();
  const navigation = require('@react-navigation/native').useNavigation();

  const handleLoginSuccess = async (userData) => {
    await login(userData);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainApp');
    }
  };

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="LoginIdentifier">
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="LoginIdentifier" component={LoginIdentifierScreen} />
      <Stack.Screen name="Login">
        {props => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
      </Stack.Screen>
      <Stack.Screen name="SetupPassword">
        {props => <SetupPasswordScreen {...props} onLoginSuccess={handleLoginSuccess} />}
      </Stack.Screen>
      <Stack.Screen name="Register">
        {props => <RegisterScreen {...props} onLoginSuccess={handleLoginSuccess} />}
      </Stack.Screen>
      <Stack.Screen name="OtpVerify">
        {props => <OtpVerifyScreen {...props} onLoginSuccess={handleLoginSuccess} />}
      </Stack.Screen>
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// Custom SVG Bottom Navigation Icons
const CustomHomeIcon = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="0 0 116.4 125.9">
    <Path fill={color} d="m106 36.5-38.4-28.2c-2.7-1.9-5.4-3.2-9.4-3.3s-6.8 1-9.1 2.6l-38.6 28c-1.5 1.2-2.7 1.9-4 3.2l1.7-0.8c-1.7 2.4-3 4.4-3.6 8.5l-0.1 2.5v55.8c0.2 7.8 3.2 11.6 7 14.4s7.5 3.1 11 3.2h17.9-2.4v-20.4c0-11.4 7.9-21 20.3-21.2 8.6 0 19.9 6.2 19.9 21.2v18.4h17.8c3-0.1 5.5-0.4 8.6-2.1 3.8-2.3 7.4-7.3 7.4-13.3v-56.8l-0.3-2.4c-0.7-4-3.4-7.3-5.7-9.3z" />
    <Path fill={color} d="m58.2 90.7c-5.6 0-10.8 4.3-10.8 10.8v19.1h21.7v-19.1c-0.1-6.5-4.8-10.8-10.9-10.8z" />
  </Svg>
);

const CustomProfileIcon = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="0 0 144.9 171">
    <Path fill={color} d="m71 5.3c18.6-0.2 28.2 9.8 33.9 18.7 3.4 5.9 4.9 10.6 5.1 19 0.1 18.2-12.3 34.9-31.1 39-5 0.9-8.8 1-13.7 0.3-15.2-2-30.5-14.2-32.4-34.4-0.7-12.9 2.9-21.5 9.7-28.9 5-5.6 11.4-10.1 18.4-12.3 2.9-0.9 6.9-1.3 10.1-1.4zm68.7 132.7c-0.1 12.4-5.8 22.9-19.3 26.5-3.7 1.1-8.6 1.4-14.8 1.4h-70.9c-16.4 0.3-29.3-7.7-29.6-26.8v-2.5c0.4-13.6 2.8-27.1 7.8-36.3 5-9.1 12.6-16.6 26.9-17.3 3.1-0.2 5.5 1.5 9.9 4.3l6.3 3.7c2.9 1.3 6.7 2.6 8.7 3.1 5.6 1.2 9.6 1.5 15.7 0.2l7.3-2.4c4.3-2 10.9-6.9 13.7-8.2 1.7-0.8 2.5-0.8 3.6-0.8 6.6 0 17.3 2 23.5 11.1 4.2 5.6 11.1 16.5 11.2 44z" />
  </Svg>
);

const CustomBookIcon = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="1 95.7 640.8 578">
    <Path fill={color} d="m362 541c0-72 57.3-144.5 146.1-144.5 24.1 0 46.4 7 66.2 18.9v-185c-0.1-44.5-33.3-85.4-76.3-85.4h-48.1v-10c0-9.8-7.5-17.1-17.9-17.1s-19.9 7.5-19.9 17.1v10h-222l-0.1-10c0-10-6.1-18-17-18s-19.5 6.5-19.5 18v10h-47.2c-39.9 0-74.8 29.7-82 71.8l-0.7 7.2v315c2.2 40.9 31.8 76.9 76 79l6.7 0.7 279.3-0.1c-15-21.6-23.6-48.4-23.6-77.6zm73.3-224.6c11.6 0 21 9 21.2 20.7 0 10.6-8.8 20.3-21.2 19.6-11.7 0-21.8-9.3-21.8-19.6 0-11.4 9.9-20.7 21.8-20.7zm-134.6 0c10.7 0 21.1 8.5 21.1 20.7 0.4 10.5-9.2 20.3-21.1 19.6-11.1 0-20.6-8.3-20.6-19.6s9.5-20.7 20.6-20.7zm-133.4 0c11.8 0 21.3 8.1 21.5 20.7 0 10.7-8.3 20.8-21.5 20.3-11.3 0-21.5-8.9-21.3-20.3s10.5-20.7 21.3-20.7zm-0.7 157.5c-10.7 0-21.1-8.8-20.7-20.8 0-10.6 8.5-20.5 20.7-19.9 11.5 0 21.9 9.3 21.9 19.9s-9.8 21.9-21.9 20.8zm134.6 0.4c-10.8 0-21.1-8.5-20.8-20.7 0-10.5 9-20.4 20.8-19.8 11.7 0 22.1 9.3 21 21.5 0 8.3-8.3 19-21 19z" />
    <Path fill={color} d="m507.1 426.8c-55.5-0.3-107.1 45.1-113.9 102.2-2.6 59.8 40.4 118.1 106.1 122.5 65.7 3.4 117.7-39.9 121.6-100.5 3.9-56.7-43.3-124.2-113.8-124.2zm53.9 103.5-1.8 3.7-57.7 46.3c-8.2 5.7-18.6 4.5-25-2.7l-24.1-30.8c-4.6-7.4-4.2-17.8 4.1-23.7 7.5-5.8 17.6-4.6 24.2 1.3l12.9 15.6 42.4-34.6c7.7-6.5 20.1-4.7 24.9 1.9 5.5 5.9 6.3 18.1 0.1 23z" />
  </Svg>
);

const CustomShoppingIcon = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="14 7.5 88 91">
    <Path fill={color} d="m86 12.8c-1.1-1.1-2.7-1.9-5-2.1h-45.1c-1.6 0.1-3.1 0.7-4.4 1.9l-4.1 4.1h61.4l-4.2-2.4 3.6 2.4-2.2-3.9zm10.5 41.1-2-19.9-0.6-5.8c-0.3-2.9-2.9-5.7-6.6-5.7l-58.7 0.1c-3.5 0.2-6.3 2.8-6.4 6.1l-0.6 6.5-2.2 23.8-2.2 25.6c-0.3 5.3 3.2 10.1 9.1 10.7h63.7c5.5-0.4 8.9-4.5 8.8-9.6l-0.8-8.1-1.5-16.1v-7.6zm-14.6-11.2c0 12.3-9.3 23.1-23.9 23.1-13.2 0-23.9-9.9-23.9-23.5v-4.4c0-2.2 1.7-4.1 4-4.1 2.3-0.1 4.4 1.8 4.4 4.1v4.4c0.2 7.5 5.7 15.5 15.2 15.6 8.8 0 15.6-6.3 15.7-15.2v-4.8c0-2.3 2-4.2 4.1-4.1 2.3-0.1 4.4 1.8 4.4 4.1v4.8z" />
  </Svg>
);

const CustomStoreIcon = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="1.4 9.6 87.5 88">
    <Path fill={color} d="m33.6 71h-15.8c-0.8 0-1.4 0.6-1.4 1.4v10.2c-0.1 0.7 0.5 1.2 1.3 1.2h15.8c0.8 0 1.3-0.6 1.3-1.3l0.1-10.1c0-0.8-0.6-1.4-1.3-1.4z"/>
    <Path fill={color} d="m72.5 16.5c-4.8 0-8.7 3.4-9.6 8-0.5 7.8 7.1 12.5 12.7 10.5 3.3-1.1 5.9-4 6.2-8.2s-2.9-10.3-9.3-10.3z"/>
    <Path fill={color} d="m72.5 9.6c-8.5 0-16.7 6.8-16.7 16.5 0 7 8.7 22.2 14.1 32.5 0.7 1.5 2.6 1.7 4 0.7v-0.2c0.1-0.1 15-24.2 15-32.2 0-9.3-7.3-17.3-16.4-17.3zm-0.1 28.7c-6.3 0-12.4-4.7-12.4-12.1 0-6.2 4.9-12.3 12.2-12.3s12.6 5.1 12.6 12.2-5.5 12.2-12.4 12.2z"/>
    <Path fill={color} d="m80.7 95.5c-0.1-0.5-0.6-0.9-1.3-0.9h-5.5v-32.1c-2.3 0.7-4.6-0.3-5.9-2.2-2-3.3-10.9-19.2-14.2-29.9h-6.2c0.5 4.6 1.2 9.2 1.9 14.6h5.6c1.5 0 1.9 2.4 0 2.8h-5.1v3.2c0 4.9 5.4 7.7 9.6 5 1.9-1.3 3.3 0.8 2 2.1-4.6 3.1-10.5 2.3-13.5-2.2-3.4 5.5-11.6 5.7-15.1 0-3 5-11 6.2-15.8 0-1.5 2.6-5.3 4.5-9.3 3.9v34.5h-5.1c-1.7 0-1.8 2.7 0.2 2.7h76.4c0.9 0 1.4-0.9 1.3-1.5zm-37.7-23.2c0-2.6 1.9-4.9 4.5-4.9h13.5c2.4 0 4.6 1.7 4.6 4.8v22.1h-2.9v-22.1c0-1.1-0.8-1.8-1.8-1.8h-13.6c-1 0-1.8 0.7-1.8 1.7v22.3h-2.8v-22.1h0.3zm4.6 2.3c0-0.7 0.6-1.3 1.3-1.3h10.5c0.8 0 1.2 0.6 1.2 1.4v6.3c0 0.7-0.6 1.3-1.3 1.3h-10.5c-0.7 0-1.3-0.6-1.3-1.3l0.1-6.4zm0 11.8c0-0.7 0.7-1.2 1.3-1.2 0.7 0 1.4 0.6 1.4 1.2v1.9c0 0.7-0.6 1.4-1.4 1.3-0.7 0-1.3-0.6-1.3-1.3v-1.9zm-10-4c0 2.2-1.7 4.2-4.2 4.2h-15.6c-2.4 0-4.2-1.7-4.2-4.2v-9.9c0-2.4 1.9-4.3 4.2-4.3h15.6c2.2 0 4.2 1.7 4.2 4.1v10.1z"/>
    <Rect fill={color} x="50.4" y="76" width="7.6" height="3.7"/>
    <Path fill={color} d="m35.2 45h11.8c-0.7-4-1.4-9-1.9-14.6h-7.8l-1.9 11.9-0.2 2.7z"/>
    <Polygon fill={color} points="19.7 45 32.3 45 34.4 30.4 26.7 30.4"/>
    <Path fill={color} d="m4.7 45h12l6.7-15h-6.1c-0.8 0.1-1.5 0.4-2.1 1l-10.5 14z"/>
    <Path fill={color} d="m16.3 47.8h-12.8v3.2c0 3.3 2.7 6.4 6.4 6.4 3.5 0 6.3-2.7 6.4-6.1v-3.5z"/>
    <Path fill={color} d="m18.9 51.3c0 6.9 9.1 9 12.4 3.3 0.9-1.7 0.8-3.2 0.8-6.8h-13.2v3.5z"/>
    <Path fill={color} d="m34.8 47.8v3.2c0 3.3 2.7 6.3 6.2 6.4 3.3 0 6.1-2.3 6.3-5.8v-3.8h-12.5z"/>
  </Svg>
);

const CustomCartIcon = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="9 5.7 64 74">
    <Path fill={color} d="m68 27.1c-0.4-3.4-3.4-7.1-7.6-7.1h-6.4v-0.6c0-5.5-4.6-12.6-12.6-12.7s-13.3 6.2-13.3 12.7v0.6h-4.8c-4.2 0-7.8 3.4-8.3 7l-5.1 42c-0.2 4.5 3.4 9.1 8.7 10h44.8c5.2 0 9-4 9.1-9v-0.4l-4.5-42.5zm-14 2.8c0 0.8-0.7 1.6-1.6 1.6s-1.6-0.7-1.6-1.5v-10h-19.5v10c0.1 2-3.3 1.8-3.3-0.1v-9.9h3.4c0-4.8 3.9-9.8 9.7-9.9 5.7-0.1 9.9 4.5 9.9 9.5v0.4h3v9.9z" />
  </Svg>
);

// Bottom Tab Navigation (Redesigned for the requested mockup design)
function TabNavigator() {
  const { theme, fonts, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#3D2E3D', // Active label and icon
        tabBarInactiveTintColor: '#7A6B7A', // Inactive label and icon
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          height: Platform.OS === 'ios'
            ? 96 + Math.max(0, insets.bottom - 28)
            : 76 + insets.bottom,
          paddingBottom: Platform.OS === 'ios'
            ? Math.max(28, insets.bottom)
            : 12 + insets.bottom,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: '#E8D9E8',
          elevation: 2,
          shadowColor: 'rgba(16, 24, 40, 0.06)',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: 9.5,
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          const size = 20;
          let icon = null;

          if (route.name === 'HomeTab') {
            icon = <CustomHomeIcon color={color} size={size} />;
          } else if (route.name === 'BookingsTab') {
            icon = <CustomBookIcon color={color} size={size} />;
          } else if (route.name === 'Profile') {
            icon = <CustomProfileIcon color={color} size={size} />;
          } else if (route.name === 'Browse') {
            icon = <CustomShoppingIcon color={color} size={size} />;
          } else if (route.name === 'Cart') {
            icon = <CustomCartIcon color={color} size={size} />;
          } else if (route.name === 'Stores') {
            icon = <CustomStoreIcon color={color} size={size} />;
          }

          if (focused) {
            return (
              <View style={{
                backgroundColor: '#EDE0ED',
                paddingVertical: 5,
                paddingHorizontal: 16,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {icon}
              </View>
            );
          }

          return (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 5 }}>
              {icon}
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />

      <Tab.Screen
        name="Browse"
        component={ProductsCatalogScreen}
        options={{ tabBarLabel: 'Shopping' }}
      />

      <Tab.Screen
        name="Stores"
        component={StoreLocatorScreen}
        options={{ tabBarLabel: 'Stores' }}
      />

      <Tab.Screen
        name="BookingsTab"
        component={AppointmentBookingScreen}
        options={{ tabBarLabel: 'Bookings' }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Account' }}
      />
    </Tab.Navigator>
  );
}

// Main Logged-In App Navigator
export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Tab bar is the home core screen */}
      <Stack.Screen name="MainTabs" component={TabNavigator} />

      {/* Nested secondary pages */}
      <Stack.Screen name="Browse" component={ProductsCatalogScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="ProductsCatalog" component={ProductsCatalogScreen} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="Reels" component={ReelsScreen} />
      <Stack.Screen name="More" component={MoreScreen} />

      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Wishlist" component={WishlistScreen} />
      <Stack.Screen name="Loyalty" component={LoyaltyDashboardScreen} />
      <Stack.Screen name="InviteEarn" component={InviteEarnScreen} />
      <Stack.Screen name="NotificationHistory" component={NotificationHistoryScreen} />
      <Stack.Screen name="Support" component={SupportTicketScreen} />
      <Stack.Screen name="SupportTicketChat" component={SupportTicketChatScreen} />
      <Stack.Screen name="Orders" component={OrderHistoryScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="RefundPolicy" component={RefundPolicyScreen} />
      <Stack.Screen name="ShippingPolicy" component={ShippingPolicyScreen} />
      <Stack.Screen name="Appointments" component={AppointmentBookingScreen} />
      <Stack.Screen name="StoreVisits" component={StoreVisitRequestScreen} />
      <Stack.Screen name="BespokeBooking" component={BespokeBookingScreen} />
      <Stack.Screen name="TrendingProducts" component={TrendingProductsScreen} />
      <Stack.Screen name="NewArrivals" component={NewArrivalsScreen} />
      <Stack.Screen name="BestSellers" component={BestSellersScreen} />
      <Stack.Screen name="RecommendedProducts" component={RecommendedProductsScreen} />
      <Stack.Screen name="SeasonalCollections" component={SeasonalCollectionsScreen} />
      <Stack.Screen name="FestivalOffers" component={FestivalOffersScreen} />
      <Stack.Screen name="Discounts" component={DiscountsScreen} />
    </Stack.Navigator>
  );
}

// Root Navigator combining Main App and Auth Stack
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, presentation: 'modal' }}>
      <Stack.Screen name="MainApp" component={AppNavigator} />
      <Stack.Screen name="AuthStack" component={AuthNavigator} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="RefundPolicy" component={RefundPolicyScreen} />
      <Stack.Screen name="ShippingPolicy" component={ShippingPolicyScreen} />
      <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
    </Stack.Navigator>
  );
}
