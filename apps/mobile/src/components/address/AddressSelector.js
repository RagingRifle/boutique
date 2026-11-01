import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions
} from 'react-native';
import {
  MapPin,
  ChevronRight,
  Plus,
  X,
  MoreVertical,
  Home,
  Phone,
  Briefcase,
  Building,
  Flag,
  Map,
  Globe,
  Hash,
  CheckCircle2,
  User as UserIcon
} from 'lucide-react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';

const { width } = Dimensions.get('window');

export default function AddressSelector({ 
  visible, 
  onClose, 
  userProfile, 
  setUserProfile 
}) {
  const { theme, fonts, shadows } = useTheme();
  
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [newAddressName, setNewAddressName] = useState('');
  const [newAddressText, setNewAddressText] = useState('');
  const [newAddressLandmark, setNewAddressLandmark] = useState('');
  const [newAddressCity, setNewAddressCity] = useState('');
  const [newAddressArea, setNewAddressArea] = useState('');
  const [newAddressPincode, setNewAddressPincode] = useState('');
  const [newAddressPhone, setNewAddressPhone] = useState('');
  const [newAddressPhone2, setNewAddressPhone2] = useState('');
  const [newAddressType, setNewAddressType] = useState('home');

  const getParsedAddresses = () => {
    let addressStr = userProfile?.address;
    if (!addressStr || addressStr === '[]') {
      return [];
    }

    const parseAddressItem = (item) => {
      if (typeof item === 'string') {
        try {
          const parsed = JSON.parse(item);
          if (parsed && (Array.isArray(parsed) || typeof parsed === 'object')) {
            return parseAddressItem(parsed);
          }
        } catch (e) {
          // Plain string
        }
        return [
          {
            id: 'default',
            name: userProfile?.fullName || 'My Address',
            address: item,
            city: '',
            area: '',
            pincode: '',
            phone: userProfile?.phoneNumber || '',
            phone2: '',
            selected: true,
            type: 'home'
          }
        ];
      }

      if (Array.isArray(item)) {
        let flattened = [];
        item.forEach(subItem => {
          flattened = flattened.concat(parseAddressItem(subItem));
        });
        return flattened;
      }

      if (item && typeof item === 'object') {
        if (typeof item.address === 'string' && (item.address.trim().startsWith('[') || item.address.trim().startsWith('{'))) {
          try {
            const nested = JSON.parse(item.address);
            const resolved = parseAddressItem(nested);
            if (resolved.length > 0) {
              return resolved.map(r => ({
                ...r,
                selected: r.selected || item.selected,
                type: r.type || item.type || 'home'
              }));
            }
          } catch (e) {
            // Treat as plain text
          }
        }

        return [
          {
            id: item.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
            name: item.name || userProfile?.fullName || 'My Address',
            address: item.address || item.street || '',
            landmark: item.landmark || '',
            city: item.city || '',
            area: item.area || '',
            pincode: item.pincode || '',
            phone: item.phone || userProfile?.phoneNumber || '',
            phone2: item.phone2 || '',
            selected: item.selected === true,
            type: item.type || 'home'
          }
        ];
      }

      return [];
    };

    try {
      let parsed = JSON.parse(addressStr);
      let list = parseAddressItem(parsed);
      
      const seen = new Set();
      const uniqueList = [];
      list.forEach(addr => {
        const uniqueKey = `${addr.name}_${addr.address}_${addr.pincode}`;
        if (!seen.has(uniqueKey) && addr.address) {
          seen.add(uniqueKey);
          uniqueList.push(addr);
        }
      });

      if (uniqueList.length > 0 && !uniqueList.some(a => a.selected)) {
        uniqueList[0].selected = true;
      }
      return uniqueList;
    } catch (e) {
      // Fallback
    }

    return [
      {
        id: 'default',
        name: userProfile?.fullName || 'My Address',
        address: addressStr,
        city: '',
        area: '',
        pincode: '',
        phone: userProfile?.phoneNumber || '',
        phone2: '',
        selected: true,
        type: 'home'
      }
    ];
  };

  const handleSelectAddress = async (addressId) => {
    const list = getParsedAddresses();
    const updated = list.map(a => ({
      ...a,
      selected: a.id === addressId
    }));
    try {
      const res = await api.put('/auth/profile', { address: JSON.stringify(updated) });
      if (res.success) {
        setUserProfile(res.data);
        onClose();
      }
    } catch (err) {
      console.error('Error selecting address:', err);
    }
  };

  const handleDeleteAddress = (addressId) => {
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const list = getParsedAddresses();
            const updated = list.filter(a => a.id !== addressId);
            if (updated.length > 0 && !updated.some(a => a.selected)) {
              updated[0].selected = true;
            }
            const val = updated.length > 0 ? JSON.stringify(updated) : null;
            try {
              const res = await api.put('/auth/profile', { address: val });
              if (res.success) {
                setUserProfile(res.data);
              }
            } catch (err) {
              console.error('Error deleting address:', err);
            }
          }
        }
      ]
    );
  };

  const handleAddNewAddress = async () => {
    if (!newAddressName.trim() || !newAddressText.trim() || !newAddressCity.trim() || !newAddressArea.trim() || !newAddressPincode.trim() || !newAddressPhone.trim()) {
      Alert.alert('Validation Error', 'Please fill in all address details.');
      return;
    }
    const list = getParsedAddresses();
    const deselected = list.map(a => ({ ...a, selected: false }));
    const newAddress = {
      id: Date.now().toString(),
      name: newAddressName.trim(),
      address: newAddressText.trim(),
      landmark: newAddressLandmark.trim(),
      city: newAddressCity.trim(),
      area: newAddressArea.trim(),
      pincode: newAddressPincode.trim(),
      phone: newAddressPhone.trim(),
      phone2: newAddressPhone2.trim(),
      selected: true,
      type: newAddressType
    };
    const updated = [...deselected, newAddress];
    try {
      const res = await api.put('/auth/profile', { address: JSON.stringify(updated) });
      if (res.success) {
        setUserProfile(res.data);
        setIsAddingNewAddress(false);
        resetForm();
      }
    } catch (err) {
      console.error('Error adding new address:', err);
    }
  };

  const resetForm = () => {
    setNewAddressName('');
    setNewAddressText('');
    setNewAddressLandmark('');
    setNewAddressCity('');
    setNewAddressArea('');
    setNewAddressPincode('');
    setNewAddressPhone('');
    setNewAddressPhone2('');
    setNewAddressType('home');
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={() => {
        onClose();
        setIsAddingNewAddress(false);
      }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalOverlayDismiss}
          activeOpacity={1}
          onPress={() => {
            onClose();
            setIsAddingNewAddress(false);
          }}
        />
        <View style={styles.modalContentCard}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { fontFamily: fonts.bold }]}>
              {isAddingNewAddress ? 'Add new address' : 'Select delivery address'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                onClose();
                setIsAddingNewAddress(false);
              }}
              style={styles.modalCloseBtn}
            >
              <X size={20} color="#475569" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {isAddingNewAddress ? (
            <ScrollView style={styles.addAddressFormScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
              <View style={styles.addAddressForm}>
                <View style={styles.formSection}>
                  <View style={styles.formSectionHeader}>
                    <UserIcon size={16} color={theme.brand[500]} strokeWidth={2} />
                    <Text style={[styles.formSectionTitle, { fontFamily: fonts.bold }]}>Contact Details</Text>
                  </View>
                  
                  <View style={styles.inputWrapper}>
                    <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>Full Name</Text>
                    <View style={[styles.inputContainer, { backgroundColor: theme.brand[50], borderColor: theme.brand[100] }]}>
                      <UserIcon size={18} color="#94a3b8" strokeWidth={2} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                        value={newAddressName || 'John Doe'}
                        editable={false}
                      />
                      <CheckCircle2 size={16} color="#4ade80" strokeWidth={2} style={styles.inputStatusIcon} />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>Primary Phone</Text>
                    <View style={[styles.inputContainer, { backgroundColor: theme.brand[50], borderColor: theme.brand[100] }]}>
                      <Phone size={18} color="#94a3b8" strokeWidth={2} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                        value={newAddressPhone || '+91 00000 00000'}
                        editable={false}
                      />
                      <CheckCircle2 size={16} color="#4ade80" strokeWidth={2} style={styles.inputStatusIcon} />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>Alternative Phone (Optional)</Text>
                    <View style={styles.inputContainer}>
                      <Phone size={18} color={theme.brand[500]} strokeWidth={2} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                        placeholder="e.g. +91 98765 43210"
                        placeholderTextColor="#94a3b8"
                        value={newAddressPhone2}
                        onChangeText={setNewAddressPhone2}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.formSection}>
                  <View style={styles.formSectionHeader}>
                    <MapPin size={16} color={theme.brand[500]} strokeWidth={2} />
                    <Text style={[styles.formSectionTitle, { fontFamily: fonts.bold }]}>Address Information</Text>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>House No / Street Name</Text>
                    <View style={[styles.inputContainer, { height: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
                      <Building size={18} color={theme.brand[500]} strokeWidth={2} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.formInputNew, { fontFamily: fonts.regular, height: '100%', textAlignVertical: 'top', paddingTop: 0 }]}
                        placeholder="e.g. 123, Luxury Apartments, Park Street"
                        placeholderTextColor="#94a3b8"
                        value={newAddressText}
                        onChangeText={setNewAddressText}
                        multiline={true}
                      />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>Landmark (Optional)</Text>
                    <View style={styles.inputContainer}>
                      <Flag size={18} color={theme.brand[500]} strokeWidth={2} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                        placeholder="e.g. Near City Mall"
                        placeholderTextColor="#94a3b8"
                        value={newAddressLandmark}
                        onChangeText={setNewAddressLandmark}
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.inputWrapper, { flex: 1, marginRight: 8 }]}>
                      <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>Area</Text>
                      <View style={styles.inputContainer}>
                        <Map size={18} color={theme.brand[500]} strokeWidth={2} style={styles.inputIcon} />
                        <TextInput
                          style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                          placeholder="e.g. Beverly Hills"
                          placeholderTextColor="#94a3b8"
                          value={newAddressArea}
                          onChangeText={setNewAddressArea}
                        />
                      </View>
                    </View>
                    <View style={[styles.inputWrapper, { flex: 1, marginLeft: 8 }]}>
                      <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>City</Text>
                      <View style={styles.inputContainer}>
                        <Globe size={18} color={theme.brand[500]} strokeWidth={2} style={styles.inputIcon} />
                        <TextInput
                          style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                          placeholder="e.g. Los Angeles"
                          placeholderTextColor="#94a3b8"
                          value={newAddressCity}
                          onChangeText={setNewAddressCity}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.formLabel, { fontFamily: fonts.medium }]}>Pincode</Text>
                    <View style={styles.inputContainer}>
                      <Hash size={18} color={theme.brand[500]} strokeWidth={2} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.formInputNew, { fontFamily: fonts.regular }]}
                        placeholder="e.g. 90210"
                        placeholderTextColor="#94a3b8"
                        value={newAddressPincode}
                        onChangeText={setNewAddressPincode}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={[styles.formSectionTitle, { fontFamily: fonts.bold, marginBottom: 12 }]}>Save Address As</Text>
                  <View style={styles.typeSelectorRow}>
                    <TouchableOpacity 
                      style={[styles.typeOption, newAddressType === 'home' && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }]}
                      onPress={() => setNewAddressType('home')}
                    >
                      <Home size={18} color={newAddressType === 'home' ? '#ffffff' : '#64748b'} strokeWidth={2} />
                      <Text style={[styles.typeText, { fontFamily: fonts.bold }, newAddressType === 'home' && styles.typeTextActive]}>Home</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.typeOption, newAddressType === 'work' && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }]}
                      onPress={() => setNewAddressType('work')}
                    >
                      <Briefcase size={18} color={newAddressType === 'work' ? '#ffffff' : '#64748b'} strokeWidth={2} />
                      <Text style={[styles.typeText, { fontFamily: fonts.bold }, newAddressType === 'work' && styles.typeTextActive]}>Work</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.typeOption, newAddressType === 'other' && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }]}
                      onPress={() => setNewAddressType('other')}
                    >
                      <MapPin size={18} color={newAddressType === 'other' ? '#ffffff' : '#64748b'} strokeWidth={2} />
                      <Text style={[styles.typeText, { fontFamily: fonts.bold }, newAddressType === 'other' && styles.typeTextActive]}>Other</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.formButtonRow}>
                  <TouchableOpacity
                    style={[styles.formBtn, styles.formBtnCancel, shadows.premium]}
                    onPress={() => setIsAddingNewAddress(false)}
                  >
                    <Text style={[styles.formBtnCancelText, { fontFamily: fonts.semiBold }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.formBtn, styles.formBtnSave, { backgroundColor: theme.brand[500] }, shadows.premium]}
                    onPress={handleAddNewAddress}
                  >
                    <Text style={[styles.formBtnSaveText, { fontFamily: fonts.bold }]}>Save Address</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={styles.addressListScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.modalAddNewBtn, { backgroundColor: theme.brand[50], borderColor: theme.brand[200] }]}
                activeOpacity={0.7}
                onPress={() => {
                  setNewAddressName(userProfile?.fullName || '');
                  setNewAddressPhone(userProfile?.phoneNumber || '');
                  setIsAddingNewAddress(true);
                }}
              >
                <View style={styles.addNewLeftRow}>
                  <Plus size={18} color={theme.brand[500]} strokeWidth={2.5} style={{ marginRight: 8 }} />
                  <Text style={[styles.addNewText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>Add New</Text>
                </View>
                <ChevronRight size={18} color={theme.brand[500]} strokeWidth={2.5} />
              </TouchableOpacity>

              <Text style={[styles.savedAddressesTitle, { fontFamily: fonts.bold }]}>
                Saved addresses
              </Text>

              {getParsedAddresses().length === 0 ? (
                <View style={styles.emptyAddressContainer}>
                  <Text style={[styles.emptyAddressText, { fontFamily: fonts.medium }]}>
                    No saved addresses. Please add a new address.
                  </Text>
                </View>
              ) : (
                getParsedAddresses().map((item) => {
                  const isSelected = item.selected;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.addressCard,
                        isSelected ? { borderColor: theme.brand[200], backgroundColor: theme.brand[50] } : null
                      ]}
                      activeOpacity={0.85}
                      onPress={() => handleSelectAddress(item.id)}
                    >
                      <View style={[
                        styles.addressCardIconBg,
                        isSelected ? { backgroundColor: theme.brand[100] } : null
                      ]}>
                        {item.type === 'home' ? (
                          <Home size={18} color={isSelected ? theme.brand[500] : '#64748b'} strokeWidth={2} />
                        ) : item.type === 'work' ? (
                          <Briefcase size={18} color={isSelected ? theme.brand[500] : '#64748b'} strokeWidth={2} />
                        ) : (
                          <MapPin size={18} color={isSelected ? theme.brand[500] : '#64748b'} strokeWidth={2} />
                        )}
                      </View>

                      <View style={styles.addressCardContent}>
                        <View style={styles.addressCardHeader}>
                          <Text style={[styles.addressCardName, { fontFamily: fonts.bold }]}>
                            {item.name}
                          </Text>
                          {isSelected && (
                            <View style={[styles.selectedBadge, { backgroundColor: theme.brand[100], borderColor: theme.brand[300] }]}>
                              <Text style={[styles.selectedBadgeText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                                Selected
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.addressCardText, { fontFamily: fonts.regular }]}>
                          {item.address}{item.landmark ? `, Near ${item.landmark}` : ''}{item.area ? `, ${item.area}` : ''}{item.city ? `, ${item.city}` : ''}{item.pincode ? ` - ${item.pincode}` : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                          {item.phone ? (
                            <View style={styles.addressCardPhoneRow}>
                              <Phone size={12} color="#475569" style={{ marginRight: 4 }} />
                              <Text style={[styles.addressCardPhone, { fontFamily: fonts.medium }]}>
                                {item.phone}
                              </Text>
                            </View>
                          ) : null}
                          {item.phone2 ? (
                            <View style={styles.addressCardPhoneRow}>
                              <Phone size={12} color="#475569" style={{ marginRight: 4 }} />
                              <Text style={[styles.addressCardPhone, { fontFamily: fonts.medium }]}>
                                {item.phone2} (Alt)
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.addressCardActionsBtn}
                        onPress={() => handleDeleteAddress(item.id)}
                      >
                        <MoreVertical size={18} color="#94a3b8" strokeWidth={2} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayDismiss: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContentCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    height: '85%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 0.8,
    borderColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 18,
    color: '#1e293b',
  },
  modalCloseBtn: {
    padding: 4,
  },
  addAddressFormScroll: {
    flex: 1,
    marginTop: 12,
  },
  addAddressForm: {
    gap: 12,
    paddingBottom: 30,
    paddingTop: 8,
  },
  formSection: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8,
  },
  formSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  formSectionTitle: {
    fontSize: 14,
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    gap: 4,
  },
  formLabel: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 52,
  },
  inputDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    marginRight: 10,
  },
  formInputNew: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    paddingVertical: 0,
    height: '100%',
  },
  inputStatusIcon: {
    marginLeft: 8,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    height: 48,
  },
  typeOptionActive: {
    backgroundColor: '#d8bfd8',
    borderColor: '#d8bfd8',
  },
  typeText: {
    fontSize: 13,
    color: '#64748b',
  },
  typeTextActive: {
    color: '#ffffff',
  },
  formButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  formBtn: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formBtnCancel: {
    backgroundColor: '#f1f5f9',
  },
  formBtnCancelText: {
    color: '#475569',
    fontSize: 15,
  },
  formBtnSave: {
    backgroundColor: '#d8bfd8',
  },
  formBtnSaveText: {
    color: '#ffffff',
    fontSize: 15,
  },
  addressListScroll: {
    flex: 1,
    marginTop: 16,
  },
  modalAddNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#faf5fa',
    borderWidth: 1,
    borderColor: '#ebe0eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  addNewLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addNewText: {
    fontSize: 14,
    color: '#d8bfd8',
  },
  savedAddressesTitle: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  emptyAddressContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyAddressText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  addressCardIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressCardContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  addressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressCardName: {
    fontSize: 14,
    color: '#1e293b',
  },
  selectedBadge: {
    backgroundColor: '#f3eaf3',
    borderWidth: 0.5,
    borderColor: '#e3d4e3',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  selectedBadgeText: {
    fontSize: 10,
    color: '#d8bfd8',
  },
  addressCardText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginTop: 4,
  },
  addressCardPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  addressCardPhone: {
    fontSize: 12,
    color: '#475569',
  },
  addressCardActionsBtn: {
    padding: 6,
  },
});
