import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  TextInput,
  Linking,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { useTheme } from '../../styles/ThemeContext';
import { APP_CONFIG } from '../../config/app.config';
import api, { API_URL } from '../../utils/api';
import { 
  Phone, 
  MessageSquare, 
  Mail, 
  HelpCircle, 
  Send, 
  Plus, 
  X, 
  ChevronRight, 
  ChevronLeft,
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Headphones,
  Paperclip,
  MessageCircle
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function SupportTicketScreen({ navigation }) {
  const { theme, fonts, shadows } = useTheme();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Focus tracking for inputs
  const [subjectFocused, setSubjectFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  // Form states
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  
  // Image attachments states
  const [attachedImage, setAttachedImage] = useState(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get('/tickets');
      if (res.success) {
        setTickets(res.data || []);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadTickets();
    });
    return unsubscribe;
  }, [navigation]);

  const handleAttachImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need permission to access your library to attach images.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        setAttachedImage(selectedUri);
        await handleUploadImage(selectedUri);
      }
    } catch (err) {
      console.error('Error selecting image:', err);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handleUploadImage = async (imageUri) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      const uriParts = imageUri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      const filename = `attachment_${Date.now()}.${fileType}`;

      formData.append('image', {
        uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
        name: filename,
        type: `image/${fileType === 'jpg' ? 'jpeg' : fileType}`,
      });

      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.post(`${API_URL}/tickets/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.data && response.data.success) {
        setUploadedImageUrl(response.data.data.url);
      } else {
        Alert.alert('Upload Failed', 'Failed to upload image to server.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Error', 'Error uploading image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRaiseTicket = async () => {
    if (!subject || !description) {
      Alert.alert('Required', 'Please enter a subject and details.');
      return;
    }
    if (uploadingImage) {
      Alert.alert('Uploading', 'Please wait for the image upload to complete.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/tickets', {
        subject,
        description,
        imageUrl: uploadedImageUrl,
      });

      if (res.success) {
        Alert.alert('Ticket Raised', 'Support ticket opened successfully. We will contact you soon.');
        setSubject('');
        setDescription('');
        setAttachedImage(null);
        setUploadedImageUrl(null);
        setCreateModalVisible(false);
        loadTickets();
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to raise ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setSubject('');
    setDescription('');
    setAttachedImage(null);
    setUploadedImageUrl(null);
    setCreateModalVisible(false);
  };

  const handleCall = () => {
    Linking.openURL(`tel:${APP_CONFIG.CONTACT_PHONE}`);
  };

  const handleWhatsApp = () => {
    const text = `Hello ${APP_CONFIG.STORE_NAME}, I need assistance with my measurements/orders.`;
    Linking.openURL(`whatsapp://send?phone=${APP_CONFIG.CONTACT_WHATSAPP}&text=${encodeURIComponent(text)}`).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed on this device.');
    });
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${APP_CONFIG.CONTACT_EMAIL}?subject=Support Assistance`);
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'OPEN': return { color: '#ef4444', bg: '#fef2f2', icon: <AlertCircle size={12} color="#ef4444" />, label: 'Open' };
      case 'IN_PROGRESS': return { color: '#f59e0b', bg: '#fffbeb', icon: <Clock size={12} color="#f59e0b" />, label: 'In Progress' };
      case 'RESOLVED': return { color: '#10b981', bg: '#f0fdf4', icon: <CheckCircle2 size={12} color="#10b981" />, label: 'Resolved' };
      case 'CLOSED': return { color: '#64748b', bg: '#f8fafc', icon: <X size={12} color="#64748b" />, label: 'Closed' };
      default: return { color: '#64748b', bg: '#f8fafc', icon: <HelpCircle size={12} color="#64748b" />, label: status };
    }
  };

  const renderTicket = ({ item }) => {
    const config = getStatusConfig(item.status);
    const ticketDate = new Date(item.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <TouchableOpacity 
        style={[
          styles.ticketCard, 
          shadows.premium, 
          { 
            backgroundColor: theme.bg.card, 
            borderColor: theme.border,
          }
        ]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('SupportTicketChat', { 
          ticketId: item.id, 
          subject: item.subject, 
          description: item.description, 
          status: item.status, 
          imageUrl: item.imageUrl 
        })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.subjectRow}>
            <Text style={[styles.ticketSubject, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={1}>
              {item.subject}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: config.bg, borderColor: config.color + '20' }]}>
              {config.icon}
              <Text style={[styles.statusText, { color: config.color, fontFamily: fonts.bold }]}>
                {config.label}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.ticketDesc, { fontFamily: fonts.medium, color: theme.text.secondary }]} numberOfLines={2}>
          {item.description}
        </Text>

        {item.imageUrl ? (
          <View style={[styles.cardImageContainer, { borderColor: theme.border }]}>
            <Image source={{ uri: item.imageUrl }} style={styles.cardAttachedImage} />
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.dateWrapper}>
            <Clock size={12} color={theme.text.muted} />
            <Text style={[styles.ticketDateText, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
              {ticketDate}
            </Text>
          </View>
          <View style={styles.chatIndicator}>
            <MessageCircle size={14} color={theme.brand[500]} />
            <Text style={[styles.chatIndicatorText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>OPEN CHAT</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header Bar */}
      <View style={[styles.headerBar, { backgroundColor: theme.bg.main }]}>
        <TouchableOpacity style={[styles.headerBtn, shadows.premium, { backgroundColor: theme.bg.card }]} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Top Welcome Banner Card */}
        <View style={[styles.welcomeCard, shadows.premium]}>
          <LinearGradient
            colors={[theme.brand[700], theme.brand[500]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeGradient}
          >
            <View style={styles.welcomeLeft}>
              <Text style={[styles.welcomeTitle, { fontFamily: fonts.bold }]}>How can we help?</Text>
              <Text style={[styles.welcomeSub, { fontFamily: fonts.medium }]}>
                Connect directly with our master tailors or raise a priority support ticket below.
              </Text>
              <View style={styles.replyBadge}>
                <Clock size={12} color="#ffffff" />
                <Text style={[styles.replyBadgeText, { fontFamily: fonts.bold }]}>Avg. response: within 24hrs</Text>
              </View>
            </View>
            <View style={styles.welcomeRight}>
              <Headphones size={60} color="#ffffff" style={styles.welcomeBgIcon} />
            </View>
          </LinearGradient>
        </View>

        {/* Support Channels */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.muted }]}>DIRECT CHANNELS</Text>
        </View>
        
        <View style={styles.channelsList}>
          {/* WhatsApp Card */}
          <TouchableOpacity 
            style={[styles.channelRowCard, shadows.premium, { backgroundColor: theme.bg.card }]} 
            onPress={handleWhatsApp} 
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#25d366', '#128c7e']} style={styles.channelRowIconBg}>
              <MessageSquare size={20} color="#ffffff" strokeWidth={2} />
            </LinearGradient>
            <View style={styles.channelRowMeta}>
              <Text style={[styles.channelRowName, { fontFamily: fonts.bold, color: theme.text.primary }]}>WhatsApp Chat</Text>
              <Text style={[styles.channelRowSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>Instant messaging & photos exchange</Text>
            </View>
            <ChevronRight size={18} color={theme.text.muted} />
          </TouchableOpacity>

          {/* Call Desk Card */}
          <TouchableOpacity 
            style={[styles.channelRowCard, shadows.premium, { backgroundColor: theme.bg.card }]} 
            onPress={handleCall} 
            activeOpacity={0.8}
          >
            <LinearGradient colors={[theme.brand[400], theme.brand[600]]} style={styles.channelRowIconBg}>
              <Phone size={20} color="#ffffff" strokeWidth={2} />
            </LinearGradient>
            <View style={styles.channelRowMeta}>
              <Text style={[styles.channelRowName, { fontFamily: fonts.bold, color: theme.text.primary }]}>Call Support Desk</Text>
              <Text style={[styles.channelRowSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>Direct hotline to our master artisans</Text>
            </View>
            <ChevronRight size={18} color={theme.text.muted} />
          </TouchableOpacity>

          {/* Email Card */}
          <TouchableOpacity 
            style={[styles.channelRowCard, shadows.premium, { backgroundColor: theme.bg.card }]} 
            onPress={handleEmail} 
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#64748b', '#475569']} style={styles.channelRowIconBg}>
              <Mail size={20} color="#ffffff" strokeWidth={2} />
            </LinearGradient>
            <View style={styles.channelRowMeta}>
              <Text style={[styles.channelRowName, { fontFamily: fonts.bold, color: theme.text.primary }]}>Email Assistance</Text>
              <Text style={[styles.channelRowSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>For measurement revisions & corporate inquiries</Text>
            </View>
            <ChevronRight size={18} color={theme.text.muted} />
          </TouchableOpacity>
        </View>

        {/* Tickets Section */}
        <View style={styles.ticketsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.muted }]}>ACTIVE TICKETS ({tickets.length})</Text>
            <TouchableOpacity style={[styles.addTicketBtn, { backgroundColor: theme.brand[500] }]} onPress={() => setCreateModalVisible(true)} activeOpacity={0.85}>
              <Plus size={16} color="#ffffff" />
              <Text style={[styles.addTicketBtnText, { fontFamily: fonts.bold, color: '#ffffff' }]}>NEW TICKET</Text>
            </TouchableOpacity>
          </View>

          {loading && tickets.length === 0 ? (
            <View style={styles.loaderSmall}>
              <ActivityIndicator size="small" color={theme.brand[500]} />
            </View>
          ) : tickets.length === 0 ? (
            <View style={[styles.emptyTickets, { backgroundColor: theme.bg.card }]}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: theme.bg.input }]}>
                <Headphones size={40} color={theme.text.muted} />
              </View>
              <Text style={[styles.emptyTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>No support tickets</Text>
              <Text style={[styles.emptyText, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                If you have any issues with your order or measurements, please raise a ticket.
              </Text>
            </View>
          ) : (
            <FlatList
              data={tickets}
              renderItem={renderTicket}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.ticketsList}
            />
          )}
        </View>
      </ScrollView>

      {/* New Ticket Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>RAISE SUPPORT TICKET</Text>
                <Text style={[styles.modalSub, { fontFamily: fonts.medium, color: theme.text.secondary }]}>Describe your issue for priority resolution</Text>
              </View>
              <TouchableOpacity style={[styles.closeModalBtn, { backgroundColor: theme.bg.input }]} onPress={handleCloseModal}>
                <X size={20} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>SUBJECT</Text>
                <TextInput
                  style={[
                    styles.input, 
                    { 
                      fontFamily: fonts.medium, 
                      backgroundColor: theme.bg.input, 
                      borderColor: subjectFocused ? theme.brand[500] : theme.border, 
                      color: theme.text.primary 
                    },
                    subjectFocused && {
                      shadowColor: theme.brand[500],
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      elevation: 4,
                    }
                  ]}
                  value={subject}
                  onChangeText={setSubject}
                  onFocus={() => setSubjectFocused(true)}
                  onBlur={() => setSubjectFocused(false)}
                  placeholder="What can we help you with?"
                  placeholderTextColor={theme.text.muted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>DESCRIPTION</Text>
                <TextInput
                  style={[
                    styles.input, 
                    styles.textArea, 
                    { 
                      fontFamily: fonts.regular, 
                      backgroundColor: theme.bg.input, 
                      borderColor: descFocused ? theme.brand[500] : theme.border, 
                      color: theme.text.primary 
                    },
                    descFocused && {
                      shadowColor: theme.brand[500],
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      elevation: 4,
                    }
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                  placeholder="Provide comprehensive details for our team..."
                  placeholderTextColor={theme.text.muted}
                />
              </View>

              {attachedImage ? (
                <View style={[styles.previewContainer, { borderColor: theme.border }]}>
                  <Image source={{ uri: attachedImage }} style={styles.previewImage} />
                  {uploadingImage ? (
                    <View style={styles.previewOverlay}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={[styles.previewStatusText, { fontFamily: fonts.medium }]}>Uploading...</Text>
                    </View>
                  ) : uploadedImageUrl ? (
                    <View style={[styles.previewStatusBadge, { backgroundColor: '#10b981' }]}>
                      <CheckCircle2 size={12} color="#ffffff" />
                      <Text style={[styles.previewStatusText, { fontFamily: fonts.bold }]}>Uploaded</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity 
                    style={[styles.removePreviewBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]} 
                    onPress={() => {
                      setAttachedImage(null);
                      setUploadedImageUrl(null);
                    }}
                  >
                    <X size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={[styles.attachBtn, { borderColor: theme.brand[300], backgroundColor: theme.brand[50] }]}
                  onPress={handleAttachImage}
                  activeOpacity={0.8}
                >
                  <Paperclip size={18} color={theme.brand[500]} />
                  <Text style={[styles.attachBtnText, { fontFamily: fonts.bold, color: theme.brand[600] }]}>ATTACH FILE / PHOTO</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.submitBtnPremiumWrapper}
                onPress={handleRaiseTicket}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[theme.brand[600], theme.brand[500]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitBtnPremium}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Text style={[styles.submitBtnText, { fontFamily: fonts.bold }]}>SUBMIT TICKET</Text>
                      <Send size={18} color="#ffffff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
  welcomeCard: {
    marginHorizontal: 24,
    marginTop: 10,
    borderRadius: 24,
    overflow: 'hidden',
  },
  welcomeGradient: {
    flexDirection: 'row',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcomeLeft: {
    flex: 1,
    paddingRight: 10,
  },
  welcomeTitle: {
    fontSize: 22,
    color: '#ffffff',
    marginBottom: 8,
  },
  welcomeSub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 18,
    marginBottom: 16,
  },
  replyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    gap: 6,
  },
  replyBadgeText: {
    fontSize: 11,
    color: '#ffffff',
  },
  welcomeRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeBgIcon: {
    opacity: 0.15,
  },
  channelsList: {
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  channelRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
  },
  channelRowIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelRowMeta: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  channelRowName: {
    fontSize: 14.5,
  },
  channelRowSub: {
    fontSize: 11,
    marginTop: 2,
  },
  ticketsSection: {
    paddingHorizontal: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  addTicketBtnText: {
    fontSize: 11,
  },
  loaderSmall: {
    paddingVertical: 40,
  },
  emptyTickets: {
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  ticketsList: {
    gap: 16,
  },
  ticketCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
  },
  cardHeader: {
    marginBottom: 12,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  ticketSubject: {
    fontSize: 16,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  ticketDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  cardImageContainer: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
  },
  cardAttachedImage: {
    width: '100%',
    height: '100%',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  dateWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketDateText: {
    fontSize: 11,
  },
  chatIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatIndicatorText: {
    fontSize: 11,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(30, 20, 15, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '85%',
    maxHeight: '90%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    letterSpacing: 1,
  },
  modalSub: {
    fontSize: 12,
    marginTop: 4,
  },
  closeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    fontSize: 15,
  },
  textArea: {
    height: 120,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 10,
    marginBottom: 24,
  },
  attachBtnText: {
    fontSize: 12,
  },
  previewContainer: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
    borderWidth: 1,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  previewStatusBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  previewStatusText: {
    fontSize: 10,
    color: '#ffffff',
  },
  removePreviewBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnPremiumWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitBtnPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    gap: 12,
  },
  submitBtnText: {
    fontSize: 15,
    color: '#ffffff',
  },
});
