import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Alert
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import {
  ChevronLeft,
  User,
  Bell,
  LogOut,
  Phone,
  Edit,
  ChevronRight,
  Shield,
  Package,
  Gift,
  RefreshCw,
  FileText,
  Truck
} from 'lucide-react-native';

import { PRODUCT_NAME, PRODUCT_VERSION } from '../../config/productName';

export default function ProfileScreen({ navigation }) {
  const { theme, fonts, shadows } = useTheme();
  const { user, logout, requireAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        if (!user) {
          setProfile(null);
          setLoading(false);
          return;
        }
        if (!profile) {
          setLoading(true);
        }
        const res = await api.get('/auth/profile');
        if (res.success) {
          setProfile(res.data);
        }
      } catch (err) {
        console.warn('Profile fetch failed (likely session expired):', err.message);
      } finally {
        setLoading(false);
      }
    }
    
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProfile();
    });

    return unsubscribe;
  }, [navigation, profile]);

  if (loading && !profile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        {/* Header Skeleton */}
        <View style={styles.headerBar}>
          <View style={[styles.skeletonBtn, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonBtn, { backgroundColor: theme.border }]} />
        </View>
        
        <View style={styles.scrollContent}>
          {/* Profile Card Skeleton */}
          <View style={[styles.profileCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <View style={styles.profileLeft}>
              <View style={[styles.profileImageContainer, { backgroundColor: theme.border }]} />
              <View style={styles.profileMeta}>
                <View style={[styles.skeletonTextLine, { width: 120, height: 16, backgroundColor: theme.border, marginBottom: 8 }]} />
                <View style={[styles.skeletonTextLine, { width: 160, height: 12, backgroundColor: theme.border }]} />
              </View>
            </View>
          </View>

          {/* Settings List Title Skeleton */}
          <View style={[styles.skeletonTextLine, { width: 80, height: 16, backgroundColor: theme.border, marginVertical: 16 }]} />
          
          {/* Settings Row Skeletons */}
          {[1, 2, 3, 4, 5].map((idx) => (
            <View key={idx} style={[styles.settingRow, shadows.premium, { backgroundColor: theme.bg.card, marginBottom: 12 }]}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconBg, { backgroundColor: theme.border }]} />
                <View style={[styles.skeletonTextLine, { width: 100, height: 14, backgroundColor: theme.border }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Format email with asterisks just like the mockup (e.g. alex.richards@***ple.com)
  const getObfuscatedEmail = (email) => {
    if (!email) return '';
    const [name, domain] = email.split('@');
    if (name.length <= 3) return email;
    const obfName = name.substring(0, 3) + '***';
    return `${obfName}@${domain}`;
  };

  const renderSettingItem = (icon, label, onPress) => (
    <TouchableOpacity
      style={[styles.settingRow, shadows.premium, { backgroundColor: theme.bg.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIconBg, { backgroundColor: theme.bg.input }]}>
          {icon}
        </View>
        <Text style={[styles.settingLabel, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>
          {label}
        </Text>
      </View>
      <ChevronRight size={16} color="#767676" />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium]} onPress={() => navigation.goBack()}>
          <ChevronLeft size={20} color="#1e1e1e" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Account
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Profile Details Card */}
        <View style={[styles.profileCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
          {user ? (
            <>
              <View style={styles.profileLeft}>
                <View style={[styles.profileImageContainer, { backgroundColor: theme.brand[500] }]}>
                  <Image 
                    source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&q=80' }} 
                    style={styles.profileImage}
                  />
                </View>
                <View style={styles.profileMeta}>
                  <Text style={[styles.profileName, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                    {profile?.fullName || user?.fullName || 'User Profile'}
                  </Text>
                  <Text style={[styles.profileEmail, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                    {getObfuscatedEmail(profile?.email || user?.email || '')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.editBtn, { borderColor: theme.border }]} activeOpacity={0.7} onPress={() => requireAuth(() => navigation.navigate('AccountDetails'))}>
                <Edit size={16} color={theme.text.primary} />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.guestProfileRow}>
              <View style={[styles.profileLeft, styles.guestProfileLeft]}>
                <View style={[styles.profileImageContainer, { backgroundColor: theme.border }]}>
                  <User size={24} color="#64748b" />
                </View>
                <View style={[styles.profileMeta, styles.guestProfileMeta]}>
                  <Text style={[styles.profileName, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                    Welcome Guest
                  </Text>
                  <Text style={[styles.profileEmail, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                    Login to access your account
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.guestLoginBtn, { borderColor: theme.brand[500] }]}
                onPress={() => requireAuth()}
              >
                <Text style={{color: theme.brand[500], fontFamily: fonts.bold, fontSize: 13}}>Log In</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Settings List */}
        <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Settings
        </Text>
        <View style={styles.settingsList}>
          {/* My Orders - Special prominent card */}
          <TouchableOpacity
            style={[styles.ordersCard, { backgroundColor: theme.brand[500] }, shadows.premium]}
            onPress={() => requireAuth(() => navigation.navigate('Orders'))}
            activeOpacity={0.85}
          >
            <View style={styles.ordersCardLeft}>
              <View style={styles.ordersIconBg}>
                <Package size={20} color={theme.brand[500]} />
              </View>
              <View>
                <Text style={[styles.ordersLabel, { fontFamily: fonts.bold }]}>My Orders</Text>
                <Text style={[styles.ordersSublabel, { fontFamily: fonts.medium }]}>Track & view your orders</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#ffffff" />
          </TouchableOpacity>

          {renderSettingItem(
            <User size={18} color="#1e1e1e" />,
            'Account Details',
            () => requireAuth(() => navigation.navigate('AccountDetails'))
          )}
          {renderSettingItem(
            <Gift size={18} color="#1e1e1e" />,
            'Invite & Earn',
            () => requireAuth(() => navigation.navigate('InviteEarn'))
          )}
          {renderSettingItem(
            <Bell size={18} color="#1e1e1e" />,
            'Notifications',
            () => requireAuth(() => navigation.navigate('NotificationHistory'))
          )}
          {renderSettingItem(
            <Shield size={18} color="#1e1e1e" />,
            'Privacy Policy',
            () => navigation.navigate('PrivacyPolicy')
          )}
          {renderSettingItem(
            <RefreshCw size={18} color="#1e1e1e" />,
            'Refund & Cancellation Policy',
            () => navigation.navigate('RefundPolicy')
          )}
          {renderSettingItem(
            <FileText size={18} color="#1e1e1e" />,
            'Terms of Usage',
            () => navigation.navigate('TermsOfService')
          )}
          {renderSettingItem(
            <Truck size={18} color="#1e1e1e" />,
            'Shipping Policy',
            () => navigation.navigate('ShippingPolicy')
          )}
          {user && renderSettingItem(
            <LogOut size={18} color="#ef4444" />,
            'Log Out',
            () => {
              Alert.alert(
                'Log Out',
                `Are you sure you want to securely log out of ${PRODUCT_NAME}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Log Out', style: 'destructive', onPress: logout }
                ]
              );
            }
          )}
        </View>

        {/* Support Section */}
        <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Support
        </Text>
        <View style={styles.settingsList}>
          {renderSettingItem(
            <Phone size={18} color="#1e1e1e" />,
            'Contact Us',
            () => navigation.navigate('Support') // Customer ticketing ticketing desk
          )}
        </View>

        <Text style={{ textAlign: 'center', fontSize: 11, color: theme.text.muted, marginTop: 12 }}>
          {PRODUCT_NAME} v{PRODUCT_VERSION}
        </Text>

      </ScrollView>
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
  skeletonTextLine: {
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
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    marginBottom: 24,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  guestProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  guestProfileLeft: {
    flex: 1,
    minWidth: 0,
  },
  guestProfileMeta: {
    flex: 1,
    minWidth: 0,
  },
  guestLoginBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    marginLeft: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileImageContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profileMeta: {
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 16,
  },
  profileEmail: {
    fontSize: 12.5,
    marginTop: 2,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingsList: {
    gap: 12,
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 14,
  },
  ordersCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  ordersCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ordersIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersLabel: {
    fontSize: 15,
    color: '#ffffff',
  },
  ordersSublabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
