import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Modal,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LottieView from 'lottie-react-native';
import { useTheme } from '../../styles/ThemeContext';
import api, { API_URL } from '../../utils/api';
import {
  ChevronLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Save,
  Award,
  Calendar,
  ChevronDown,
  Check,
  Edit3,
  X,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react-native';

const GENDER_OPTIONS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Prefer not to say', value: 'OTHER' },
];

export default function AccountDetailsScreen({ navigation }) {
  const { theme, fonts, shadows } = useTheme();

  // Data States
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Form States
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);

  // Edit State & Backup values
  const [isEditing, setIsEditing] = useState(false);
  const [backupFullName, setBackupFullName] = useState('');
  const [backupGender, setBackupGender] = useState('');
  const [backupStreetAddress, setBackupStreetAddress] = useState('');
  const [backupLandmark, setBackupLandmark] = useState('');
  const [backupAlternatePhone, setBackupAlternatePhone] = useState('');
  const [backupPincode, setBackupPincode] = useState('');
  const [backupArea, setBackupArea] = useState('');
  const [backupCity, setBackupCity] = useState('');
  const [showUpdatedPopup, setShowUpdatedPopup] = useState(false);

  useEffect(() => {
    if (showUpdatedPopup) {
      const timer = setTimeout(() => {
        setShowUpdatedPopup(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [showUpdatedPopup]);

  // Split Address States
  const [streetAddress, setStreetAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [rawAddressArray, setRawAddressArray] = useState([]);

  // Email change flow
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone change flow
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const fetchProfile = async () => {
    try {
      if (!profile) setLoading(true);
      const res = await api.get('/auth/profile');
      if (res.success && res.data) {
        setProfile(res.data);
        setFullName(res.data.fullName || '');
        setGender(res.data.gender || '');
        
        // Parse address structure
        const addressStr = res.data.address;
        let parsedList = [];
        let isJsonArray = false;
        if (addressStr) {
          try {
            const parsed = JSON.parse(addressStr);
            if (Array.isArray(parsed)) {
              parsedList = parsed;
              isJsonArray = true;
            }
          } catch (e) {
            // Legacy plain text address
          }
        }
        
        setRawAddressArray(parsedList);
        
        if (isJsonArray && parsedList.length > 0) {
          const activeAddr = parsedList.find(a => a.selected) || parsedList[0];
          setStreetAddress(activeAddr.address || '');
          setLandmark(activeAddr.landmark || '');
          setAlternatePhone(activeAddr.phone2 || '');
          setPincode(activeAddr.pincode || '');
          setArea(activeAddr.area || '');
          setCity(activeAddr.city || '');
        } else {
          setStreetAddress(addressStr || '');
          setLandmark('');
          setAlternatePhone('');
          setPincode('');
          setArea('');
          setCity('');
        }
      }
    } catch (err) {
      console.warn('Profile fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch profile on initial mount AND whenever screen is focused (after login/navigation)
  useEffect(() => {
    fetchProfile();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProfile();
    });
    return unsubscribe;
  }, [navigation]);

  const handleUpdate = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    
    if ((landmark.trim() || pincode.trim() || area.trim() || city.trim() || alternatePhone.trim()) && !streetAddress.trim()) {
      Alert.alert('Address Required', 'Please enter the street address/house number.');
      return;
    }

    setUpdating(true);
    try {
      let updatedAddressValue = null;
      if (streetAddress.trim()) {
        if (rawAddressArray.length > 0) {
          let activeIndex = rawAddressArray.findIndex(a => a.selected);
          if (activeIndex === -1) activeIndex = 0;
          
          const updatedArray = [...rawAddressArray];
          updatedArray[activeIndex] = {
            ...updatedArray[activeIndex],
            address: streetAddress.trim(),
            landmark: landmark.trim(),
            phone2: alternatePhone.trim(),
            pincode: pincode.trim(),
            area: area.trim(),
            city: city.trim(),
            phone: profile?.phoneNumber || updatedArray[activeIndex].phone || '',
            name: profile?.fullName || updatedArray[activeIndex].name || 'My Address'
          };
          updatedAddressValue = JSON.stringify(updatedArray);
        } else {
          const newAddressObj = {
            id: Date.now().toString(),
            name: fullName.trim() || profile?.fullName || 'My Address',
            address: streetAddress.trim(),
            landmark: landmark.trim(),
            city: city.trim(),
            area: area.trim(),
            pincode: pincode.trim(),
            phone: profile?.phoneNumber || '',
            phone2: alternatePhone.trim(),
            selected: true,
            type: 'home'
          };
          updatedAddressValue = JSON.stringify([newAddressObj]);
        }
      }

      const res = await api.put('/auth/profile', {
        fullName: fullName.trim(),
        gender: gender || null,
        address: updatedAddressValue,
      });
      if (res.success) {
        setIsEditing(false);
        setShowUpdatedPopup(true);
        fetchProfile();
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update profile details.');
    } finally {
      setUpdating(false);
    }
  };

  const handleChooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to choose a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const extension = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
      const formData = new FormData();
      formData.append('image', {
        uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
        name: `profile_${Date.now()}.${extension}`,
        type: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      });
      const token = await AsyncStorage.getItem('accessToken');
      const upload = await axios.post(`${API_URL}/tickets/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
      });
      const avatarUrl = upload.data?.data?.url;
      if (!avatarUrl) throw new Error('The uploaded image URL was missing.');
      const saved = await api.put('/auth/profile', { avatarUrl });
      if (!saved.success) throw new Error('Unable to save your profile picture.');
      setProfile(current => ({ ...current, avatarUrl }));
      await fetchProfile();
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not update your profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDetectAddress = async () => {
    setDetectingLocation(true);
    try {
      const Location = await import('expo-location');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'You can enter your address manually, or allow location access to fill it automatically.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const addresses = await Location.reverseGeocodeAsync(position.coords);
      const detected = addresses?.[0];
      if (!detected) throw new Error('Could not find an address for your current location.');
      setStreetAddress([detected.streetNumber, detected.street].filter(Boolean).join(' ') || detected.name || '');
      setLandmark(detected.district || detected.subregion || '');
      setPincode(detected.postalCode || '');
      setArea(detected.district || detected.subregion || detected.name || '');
      setCity([detected.city, detected.region].filter(Boolean).join(', '));
      setIsEditing(true);
    } catch (err) {
      Alert.alert('Location unavailable', err.message || 'Please enter your address manually.');
    } finally {
      setDetectingLocation(false);
    }
  };

  // Password Verification
  const handleVerifyPassword = async () => {
    if (!password) {
      Alert.alert('Required', 'Please enter your account password.');
      return;
    }
    const loadingSetter = editingEmail ? setEmailLoading : setPhoneLoading;
    loadingSetter(true);
    try {
      const res = await api.post('/auth/profile/verify-password', { password });
      if (res.success) {
        setIsPasswordVerified(true);
        Keyboard.dismiss();
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Incorrect password.');
    } finally {
      loadingSetter(false);
    }
  };

  // Email Change
  const handleSendEmailOtp = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (newEmail.trim().toLowerCase() === profile?.email?.toLowerCase()) {
      Alert.alert('Duplicate Email', 'New email address must be different from your current email.');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await api.post('/auth/profile/request-update', { 
        password,
        newEmail: newEmail.trim().toLowerCase() 
      });
      if (res.success) {
        setEmailOtpSent(true);
        Keyboard.dismiss();
        Alert.alert('Verification Code Sent', 'A 6-digit security code has been sent to your current email address.');
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Failed to request update.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtp || emailOtp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await api.post('/auth/profile/confirm-update', {
        code: emailOtp.trim(),
      });
      if (res.success) {
        if (res.accessToken) {
          await AsyncStorage.setItem('accessToken', res.accessToken);
        }
        Alert.alert('✓ Email Updated', 'Your registered email address has been updated successfully.');
        handleCloseEmailModal();
        fetchProfile();
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Verification failed.');
    } finally {
      setEmailLoading(false);
    }
  };

  // Phone Change
  const handleSendPhoneOtp = async () => {
    if (!newPhone.trim() || newPhone.length < 8) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await api.post('/auth/profile/request-update', { 
        password,
        newPhoneNumber: newPhone.trim() 
      });
      if (res.success) {
        setPhoneOtpSent(true);
        Keyboard.dismiss();
        Alert.alert('Verification Code Sent', 'A 6-digit security code has been sent to your registered email address.');
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Failed to request update.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!phoneOtp || phoneOtp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await api.post('/auth/profile/confirm-update', {
        code: phoneOtp.trim(),
      });
      if (res.success) {
        if (res.accessToken) {
          await AsyncStorage.setItem('accessToken', res.accessToken);
        }
        Alert.alert('✓ Phone Updated', 'Your registered phone number has been updated successfully.');
        handleClosePhoneModal();
        fetchProfile();
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Verification failed.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleCloseEmailModal = () => {
    setEditingEmail(false);
    setEmailOtpSent(false);
    setNewEmail('');
    setEmailOtp('');
    setPassword('');
    setShowPassword(false);
    setIsPasswordVerified(false);
  };

  const handleClosePhoneModal = () => {
    setEditingPhone(false);
    setPhoneOtpSent(false);
    setNewPhone('');
    setPhoneOtp('');
    setPassword('');
    setShowPassword(false);
    setIsPasswordVerified(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const getGenderLabel = () => {
    const found = GENDER_OPTIONS.find(o => o.value === gender);
    return found ? found.label : 'Select gender';
  };

  if (loading && !profile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        <View style={styles.headerBar}>
          <View style={[styles.skeletonBtn, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: theme.border }]} />
          <View style={[styles.skeletonBtn, { backgroundColor: theme.border }]} />
        </View>
        <View style={styles.scrollContent}>
          <View style={[styles.skeletonCard, shadows.premium, { backgroundColor: theme.bg.card }]} />
          <View style={[styles.skeletonCard, shadows.premium, { backgroundColor: theme.bg.card, height: 220 }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium]} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ChevronLeft size={20} color="#1e1e1e" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Account Details
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Summary Card */}
        <View style={[styles.summaryCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
          <View style={styles.summaryItem}>
            <View style={[styles.iconBg, { backgroundColor: theme.brand[50] }]}>
              <Award size={20} color={theme.brand[500]} />
            </View>
            <View style={styles.summaryText}>
              <Text style={[styles.summaryLabel, { fontFamily: fonts.medium, color: theme.text.secondary }]}>Loyalty Points</Text>
              <Text style={[styles.summaryValue, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                {profile?.pointsBalance || 0} pts
              </Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={[styles.iconBg, { backgroundColor: theme.brand[50] }]}>
              <Calendar size={20} color={theme.brand[500]} />
            </View>
            <View style={styles.summaryText}>
              <Text style={[styles.summaryLabel, { fontFamily: fonts.medium, color: theme.text.secondary }]}>Member Since</Text>
              <Text style={[styles.summaryValue, styles.memberSinceValue, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={2}>
                {formatDate(profile?.createdAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Personal Details Card */}
        <View style={[styles.formCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
          <View style={styles.avatarSection}>
            <View style={styles.avatarFrame}>
              {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} /> : <User size={30} color={theme.text.muted} />}
            </View>
            <TouchableOpacity style={[styles.avatarButton, { backgroundColor: theme.brand[500] }]} onPress={handleChooseAvatar} disabled={uploadingAvatar}>
              {uploadingAvatar ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.avatarButtonText, { fontFamily: fonts.semiBold }]}>Change profile photo</Text>}
            </TouchableOpacity>
          </View>
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Personal Details
          </Text>

          {/* Full Name */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>FULL NAME</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
              <User size={17} color={theme.text.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={theme.text.muted}
                editable={isEditing}
              />
            </View>
          </View>

          {/* Gender Dropdown */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>GENDER</Text>
            <TouchableOpacity
              style={[styles.inputWrapper, styles.dropdownBtn, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}
              onPress={() => {
                if (isEditing) setShowGenderPicker(true);
              }}
              disabled={!isEditing}
              activeOpacity={0.7}
            >
              <User size={17} color={theme.text.muted} style={styles.inputIcon} />
              <Text style={[styles.dropdownText, { fontFamily: fonts.medium, color: gender ? theme.text.primary : theme.text.muted }]}>
                {getGenderLabel()}
              </Text>
              <ChevronDown size={17} color={theme.text.muted} />
            </TouchableOpacity>
          </View>

          {/* Address Information Section */}
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 10 }]}>
            Shipping Address
          </Text>
          <View style={styles.locationActions}>
            <Text style={[styles.sectionSubtitle, { fontFamily: fonts.medium, color: theme.text.secondary, flex: 1 }]}>Enter your address or fill it from your current location.</Text>
            <TouchableOpacity style={[styles.detectButton, { borderColor: theme.brand[500] }]} onPress={handleDetectAddress} disabled={detectingLocation}>
              {detectingLocation ? <ActivityIndicator size="small" color={theme.brand[500]} /> : <MapPin size={15} color={theme.brand[500]} />}
              <Text style={[styles.detectButtonText, { color: theme.brand[500], fontFamily: fonts.semiBold }]}>Detect</Text>
            </TouchableOpacity>
          </View>

          {/* House No / Street Name */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>HOUSE NO / STREET NAME</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
              <MapPin size={17} color={theme.text.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                value={streetAddress}
                onChangeText={setStreetAddress}
                placeholder="e.g. 123, Luxury Apartments, Park Street"
                placeholderTextColor={theme.text.muted}
                editable={isEditing}
              />
            </View>
          </View>

          {/* Landmark */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>LANDMARK (OPTIONAL)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
              <MapPin size={17} color={theme.text.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                value={landmark}
                onChangeText={setLandmark}
                placeholder="e.g. Near City Mall"
                placeholderTextColor={theme.text.muted}
                editable={isEditing}
              />
            </View>
          </View>

          {/* Alternate Phone */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>ALT PHONE NUMBER (OPTIONAL)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
              <Phone size={17} color={theme.text.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                value={alternatePhone}
                onChangeText={setAlternatePhone}
                placeholder="e.g. +91 9876543210"
                placeholderTextColor={theme.text.muted}
                keyboardType="phone-pad"
                editable={isEditing}
              />
            </View>
          </View>

          {/* Pincode and Area Row */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>PINCODE</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
                <TextInput
                  style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                  value={pincode}
                  onChangeText={setPincode}
                  placeholder="e.g. 90210"
                  placeholderTextColor={theme.text.muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={isEditing}
                />
              </View>
            </View>

            <View style={[styles.inputContainer, { flex: 1.2 }]}>
              <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>AREA</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
                <TextInput
                  style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                  value={area}
                  onChangeText={setArea}
                  placeholder="e.g. Beverly Hills"
                  placeholderTextColor={theme.text.muted}
                  editable={isEditing}
                />
              </View>
            </View>
          </View>

          {/* City */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>CITY / STATE</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input }, !isEditing && { opacity: 0.85 }]}>
              <TextInput
                style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Los Angeles, CA"
                placeholderTextColor={theme.text.muted}
                editable={isEditing}
              />
            </View>
          </View>
        </View>

        {/* Edit Details / Save & Cancel Button Row */}
        {!isEditing ? (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.brand[500] }, shadows.premium]}
            onPress={() => {
              setBackupFullName(fullName);
              setBackupGender(gender);
              setBackupStreetAddress(streetAddress);
              setBackupLandmark(landmark);
              setBackupAlternatePhone(alternatePhone);
              setBackupPincode(pincode);
              setBackupArea(area);
              setBackupCity(city);
              setIsEditing(true);
            }}
            activeOpacity={0.85}
          >
            <Edit3 size={18} color="#ffffff" />
            <Text style={[styles.saveBtnText, { fontFamily: fonts.bold }]}>EDIT DETAILS</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1, backgroundColor: '#f1f5f9' }, shadows.premium]}
              onPress={() => {
                setFullName(backupFullName);
                setGender(backupGender);
                setStreetAddress(backupStreetAddress);
                setLandmark(backupLandmark);
                setAlternatePhone(backupAlternatePhone);
                setPincode(backupPincode);
                setArea(backupArea);
                setCity(backupCity);
                setIsEditing(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.saveBtnText, { fontFamily: fonts.bold, color: '#475569' }]}>CANCEL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1.5, backgroundColor: theme.brand[500] }, shadows.premium]}
              onPress={handleUpdate}
              disabled={updating}
              activeOpacity={0.85}
            >
              {updating ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Save size={18} color="#ffffff" />
                  <Text style={[styles.saveBtnText, { fontFamily: fonts.bold }]}>SAVE CHANGES</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Contact Details Card */}
        <View style={[styles.formCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Contact Information
          </Text>
          <Text style={[styles.sectionSubtitle, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
            Changing these requires password verification to keep your account secure.
          </Text>

          {/* Email Section */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>EMAIL ADDRESS</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                <Mail size={17} color={theme.text.muted} style={styles.inputIcon} />
                <Text style={{ fontFamily: fonts.medium, color: theme.text.primary, fontSize: 14, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
                  {profile?.email || '—'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.editContactBtn, { backgroundColor: theme.brand[50] }]}
                onPress={() => { setEditingEmail(true); setEmailOtpSent(false); setNewEmail(''); setEmailOtp(''); setPassword(''); setShowPassword(false); }}
                activeOpacity={0.7}
              >
                <Edit3 size={13} color={theme.brand[500]} />
                <Text style={[styles.editContactText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Phone Section */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>PHONE NUMBER</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                <Phone size={17} color={theme.text.muted} style={styles.inputIcon} />
                <Text style={{ fontFamily: fonts.medium, color: theme.text.primary, fontSize: 14, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
                  {profile?.phoneNumber || '—'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.editContactBtn, { backgroundColor: theme.brand[50] }]}
                onPress={() => { setEditingPhone(true); setPhoneOtpSent(false); setNewPhone(''); setPhoneOtp(''); setPassword(''); setShowPassword(false); }}
                activeOpacity={0.7}
              >
                <Edit3 size={13} color={theme.brand[500]} />
                <Text style={[styles.editContactText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Gender Picker Modal */}
      <Modal visible={showGenderPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowGenderPicker(false)} activeOpacity={1}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.bg.card }]}>
            <Text style={[styles.pickerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>Select Gender</Text>
            {GENDER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pickerOption, gender === opt.value && { backgroundColor: theme.brand[50] }]}
                onPress={() => { setGender(opt.value); setShowGenderPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerOptionText, { fontFamily: fonts.medium, color: gender === opt.value ? theme.brand[500] : theme.text.primary }]}>
                  {opt.label}
                </Text>
                {gender === opt.value && <Check size={16} color={theme.brand[500]} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.pickerCancel, { borderColor: theme.border }]} onPress={() => setShowGenderPicker(false)}>
              <Text style={[styles.pickerCancelText, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Ultra-Minimalist Email Change Bottom Sheet Modal */}
      <Modal visible={editingEmail} transparent animationType="slide" onRequestClose={handleCloseEmailModal}>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={handleCloseEmailModal} 
          />
          <View style={[styles.changeSheet, { backgroundColor: theme.bg.card }]}>
            {/* Drag Handle Indicator */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.changeSheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Mail size={20} color={theme.text.primary} />
                <Text style={[styles.changeSheetTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  Change Email
                </Text>
              </View>
              <TouchableOpacity onPress={handleCloseEmailModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            {!isPasswordVerified ? (
              <>
                <Text style={[styles.changeSheetSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                  Enter your account password to authorize changing your email.
                </Text>
                
                {/* Password Input */}
                <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, marginTop: 16 }]}>
                  <Lock size={17} color={theme.text.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Account password"
                    placeholderTextColor={theme.text.muted}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} color={theme.text.muted} /> : <Eye size={18} color={theme.text.muted} />}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.luxuryActionBtn, { backgroundColor: '#18181B', marginTop: 20 }]}
                  onPress={handleVerifyPassword}
                  disabled={emailLoading}
                  activeOpacity={0.85}
                >
                  {emailLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
                    <Text style={[styles.luxuryActionBtnText, { fontFamily: fonts.bold }]}>Verify Password</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : !emailOtpSent ? (
              <>
                <View style={styles.verifiedBadge}>
                  <Check size={14} color="#10B981" />
                  <Text style={[styles.verifiedBadgeText, { fontFamily: fonts.semiBold, color: '#10B981' }]}>
                    Password Verified
                  </Text>
                </View>

                <Text style={[styles.changeSheetSub, { fontFamily: fonts.medium, color: theme.text.secondary, marginTop: 4 }]}>
                  Enter your new email address. A 6-digit verification code will be sent to confirm.
                </Text>

                {/* New Email Input */}
                <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, marginTop: 16 }]}>
                  <Mail size={17} color={theme.text.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="New email address"
                    placeholderTextColor={theme.text.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.luxuryActionBtn, { backgroundColor: '#18181B', marginTop: 20 }]}
                  onPress={handleSendEmailOtp}
                  disabled={emailLoading}
                  activeOpacity={0.85}
                >
                  {emailLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
                    <Text style={[styles.luxuryActionBtnText, { fontFamily: fonts.bold }]}>Send Verification Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.changeSheetSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                  Enter the 6-digit code sent to your registered email to update your address to: <Text style={{ fontFamily: fonts.bold, color: theme.text.primary }}>{newEmail}</Text>
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, marginTop: 16 }]}>
                  <TextInput
                    style={[styles.input, { fontFamily: fonts.bold, color: theme.text.primary, fontSize: 20, letterSpacing: 8, textAlign: 'center' }]}
                    value={emailOtp}
                    onChangeText={setEmailOtp}
                    placeholder="000000"
                    placeholderTextColor={theme.text.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.luxuryActionBtn, { backgroundColor: '#18181B', marginTop: 20 }]}
                  onPress={handleVerifyEmailOtp}
                  disabled={emailLoading}
                  activeOpacity={0.85}
                >
                  {emailLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
                    <Text style={[styles.luxuryActionBtnText, { fontFamily: fonts.bold }]}>Confirm & Update Email</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Ultra-Minimalist Phone Change Bottom Sheet Modal */}
      <Modal visible={editingPhone} transparent animationType="slide" onRequestClose={handleClosePhoneModal}>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={handleClosePhoneModal} 
          />
          <View style={[styles.changeSheet, { backgroundColor: theme.bg.card }]}>
            {/* Drag Handle Indicator */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.changeSheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Phone size={20} color={theme.text.primary} />
                <Text style={[styles.changeSheetTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  Change Phone Number
                </Text>
              </View>
              <TouchableOpacity onPress={handleClosePhoneModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            {!isPasswordVerified ? (
              <>
                <Text style={[styles.changeSheetSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                  Enter your account password to authorize changing your phone number.
                </Text>
                
                {/* Password Input */}
                <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, marginTop: 16 }]}>
                  <Lock size={17} color={theme.text.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Account password"
                    placeholderTextColor={theme.text.muted}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} color={theme.text.muted} /> : <Eye size={18} color={theme.text.muted} />}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.luxuryActionBtn, { backgroundColor: '#18181B', marginTop: 20 }]}
                  onPress={handleVerifyPassword}
                  disabled={phoneLoading}
                  activeOpacity={0.85}
                >
                  {phoneLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
                    <Text style={[styles.luxuryActionBtnText, { fontFamily: fonts.bold }]}>Verify Password</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : !phoneOtpSent ? (
              <>
                <View style={styles.verifiedBadge}>
                  <Check size={14} color="#10B981" />
                  <Text style={[styles.verifiedBadgeText, { fontFamily: fonts.semiBold, color: '#10B981' }]}>
                    Password Verified
                  </Text>
                </View>

                <Text style={[styles.changeSheetSub, { fontFamily: fonts.medium, color: theme.text.secondary, marginTop: 4 }]}>
                  Enter your new phone number. A 6-digit verification code will be sent to confirm.
                </Text>

                {/* New Phone Input */}
                <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, marginTop: 16 }]}>
                  <Phone size={17} color={theme.text.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { fontFamily: fonts.medium, color: theme.text.primary }]}
                    value={newPhone}
                    onChangeText={setNewPhone}
                    placeholder="+91 9999988888"
                    placeholderTextColor={theme.text.muted}
                    keyboardType="phone-pad"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.luxuryActionBtn, { backgroundColor: '#18181B', marginTop: 20 }]}
                  onPress={handleSendPhoneOtp}
                  disabled={phoneLoading}
                  activeOpacity={0.85}
                >
                  {phoneLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
                    <Text style={[styles.luxuryActionBtnText, { fontFamily: fonts.bold }]}>Send Verification Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.changeSheetSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                  Enter the 6-digit code sent to your registered email to update your phone number to: <Text style={{ fontFamily: fonts.bold, color: theme.text.primary }}>{newPhone}</Text>
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bg.input, marginTop: 16 }]}>
                  <TextInput
                    style={[styles.input, { fontFamily: fonts.bold, color: theme.text.primary, fontSize: 20, letterSpacing: 8, textAlign: 'center' }]}
                    value={phoneOtp}
                    onChangeText={setPhoneOtp}
                    placeholder="000000"
                    placeholderTextColor={theme.text.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.luxuryActionBtn, { backgroundColor: '#18181B', marginTop: 20 }]}
                  onPress={handleVerifyPhoneOtp}
                  disabled={phoneLoading}
                  activeOpacity={0.85}
                >
                  {phoneLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
                    <Text style={[styles.luxuryActionBtnText, { fontFamily: fonts.bold }]}>Confirm & Update Phone</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Updated Details Success Modal */}
      <Modal visible={showUpdatedPopup} transparent animationType="fade">
        <View style={styles.animationOverlay}>
          <View style={[styles.animationContent, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <View style={styles.animationSvgWrapper}>
              <LottieView
                source={require('../../../assets/updated_success.json')}
                autoPlay
                loop={false}
                style={{ width: 130, height: 130 }}
              />
            </View>
            <Text style={[styles.animationTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
              Details Updated!
            </Text>
            <Text style={[styles.animationSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
              Your profile information has been successfully updated.
            </Text>
            <TouchableOpacity 
              style={[styles.animationCloseBtn, { backgroundColor: theme.brand[500] }]} 
              onPress={() => setShowUpdatedPopup(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.animationCloseBtnText, { fontFamily: fonts.bold }]}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 50 },
  summaryCard: {
    flexDirection: 'row', borderRadius: 24, padding: 14,
    marginBottom: 20, alignItems: 'center', justifyContent: 'space-between',
  },
  summaryItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { flex: 1, minWidth: 0 },
  iconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 12, marginTop: 2, flexShrink: 1 },
  memberSinceValue: { lineHeight: 15, alignSelf: 'flex-start' },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#f0f0f2', marginHorizontal: 8 },
  formCard: { borderRadius: 24, padding: 20, marginBottom: 20, gap: 18 },
  sectionTitle: { fontSize: 15, marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, lineHeight: 18, marginBottom: 4, marginTop: -6 },
  avatarSection: { alignItems: 'center', gap: 10, marginBottom: 2 },
  avatarFrame: { width: 84, height: 84, borderRadius: 42, overflow: 'hidden', backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarButton: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 150, alignItems: 'center' },
  avatarButtonText: { color: '#fff', fontSize: 12 },
  locationActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8 },
  detectButton: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  detectButtonText: { fontSize: 12 },
  inputContainer: { gap: 8 },
  inputLabel: { fontSize: 10.5, letterSpacing: 0.6 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    height: 50, borderRadius: 14, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: '100%', fontSize: 14 },
  dropdownBtn: { justifyContent: 'space-between' },
  dropdownText: { flex: 1, fontSize: 14 },
  saveBtn: {
    height: 54, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 6,
  },
  saveBtnText: { color: '#ffffff', fontSize: 15 },
  editContactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  editContactText: { fontSize: 12 },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4E7',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  pickerTitle: { fontSize: 17, marginBottom: 20, textAlign: 'center' },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14, marginBottom: 8,
  },
  pickerOptionText: { fontSize: 15 },
  pickerCancel: {
    marginTop: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerCancelText: { fontSize: 14 },
  changeSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  changeSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  changeSheetTitle: { fontSize: 18, letterSpacing: -0.2 },
  changeSheetSub: { fontSize: 13, lineHeight: 19 },
  luxuryActionBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  luxuryActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
  },
  // Skeleton
  skeletonBtn: { width: 40, height: 40, borderRadius: 12 },
  skeletonTitle: { width: 120, height: 20, borderRadius: 6 },
  skeletonCard: { height: 80, borderRadius: 24, marginBottom: 20 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 8,
  },
  verifiedBadgeText: {
    fontSize: 12,
  },
  animationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  animationContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
  },
  animationSvgWrapper: {
    marginBottom: 12,
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animationTitle: {
    fontSize: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  animationSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  animationCloseBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animationCloseBtnText: {
    fontSize: 13,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
