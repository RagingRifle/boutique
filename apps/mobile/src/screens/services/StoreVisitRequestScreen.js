import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import { APP_CONFIG } from '../../config/app.config';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { MapPin, Calendar, Clipboard, CheckCircle2, User, Plus, X } from 'lucide-react-native';

export default function StoreVisitRequestScreen({ navigation }) {
  const { theme, fonts, shadows } = useTheme();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { requireAuth } = useAuth();

  // Form states
  const [dateStr, setDateStr] = useState('2026-06-20');
  const [address, setAddress] = useState('');
  const [requirements, setRequirements] = useState('');

  const loadVisits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/visits');
      if (res.success) {
        setVisits(res.data);
      }
    } catch (err) {
      console.error('Error fetching visits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadVisits();
    });
    return unsubscribe;
  }, [navigation]);

  // Load default address from profile
  useEffect(() => {
    async function loadAddress() {
      try {
        const res = await api.get('/auth/profile');
        if (res.success && res.data.address) {
          setAddress(res.data.address);
        }
      } catch (err) {
        console.error(err);
      }
    }
    if (requestModalVisible && !address) {
      loadAddress();
    }
  }, [requestModalVisible]);

  const handleRequestVisit = async () => {
    if (!dateStr || !address || !requirements) {
      Alert.alert('Required', 'Please fill out all fields.');
      return;
    }
    setSubmitting(true);
    try {
      const formattedDate = new Date(`${dateStr}T10:00:00Z`).toISOString();
      const res = await api.post('/visits', {
        preferredDate: formattedDate,
        address,
        requirements,
      });

      if (res.success) {
        Alert.alert('Request Submitted', 'A store representative visit has been requested.');
        setRequestModalVisible(false);
        setRequirements('');
        loadVisits();
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIndex = (status) => {
    const statuses = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
    return statuses.indexOf(status);
  };

  const renderTimeline = (status) => {
    const currentIdx = getStatusIndex(status);
    const steps = ['Pending', 'Assigned', 'In Progress', 'Completed'];

    return (
      <View style={styles.timelineRow}>
        {steps.map((step, idx) => {
          const isActive = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          const showLine = idx < steps.length - 1;

          return (
            <React.Fragment key={step}>
              <View style={styles.timelineNodeContainer}>
                <View style={[
                  styles.timelineNode,
                  { borderColor: theme.border },
                  isActive && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                ]}>
                  {isActive ? (
                    <CheckCircle2 size={12} color="#ffffff" />
                  ) : (
                    <View style={styles.inactiveDot} />
                  )}
                </View>
                <Text style={[
                  styles.timelineNodeLabel,
                  { color: theme.text.secondary, fontFamily: fonts.medium },
                  isCurrent && { color: theme.brand[500], fontFamily: fonts.bold }
                ]}>
                  {step}
                </Text>
              </View>
              {showLine && (
                <View style={[
                  styles.timelineLine,
                  { backgroundColor: theme.border },
                  idx < currentIdx && { backgroundColor: theme.brand[500] }
                ]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  const renderVisit = ({ item }) => {
    const visitDate = new Date(item.preferredDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <View style={[styles.visitCard, shadows.premium, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
        <View style={styles.visitCardHeader}>
          <Text style={[styles.visitDateTitle, { color: theme.text.primary, fontFamily: fonts.bold }]}>
            Visit Date: {visitDate}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: theme.brand[50] }]}>
            <Text style={[styles.statusBadgeText, { color: theme.brand[500], fontFamily: fonts.bold }]}>
              {item.status}
            </Text>
          </View>
        </View>

        {/* Address & requirements */}
        <View style={styles.detailsBlock}>
          <View style={styles.detailRow}>
            <MapPin size={14} color={theme.text.secondary} />
            <Text style={[styles.detailText, { color: theme.text.primary, fontFamily: fonts.medium }]} numberOfLines={2}>
              Address: {item.address}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Clipboard size={14} color={theme.text.secondary} />
            <Text style={[styles.detailText, { color: theme.text.primary, fontFamily: fonts.medium }]} numberOfLines={2}>
              Requirements: {item.requirements}
            </Text>
          </View>
          {item.assignedStaff ? (
            <View style={styles.detailRow}>
              <User size={14} color={theme.brand[500]} />
              <Text style={[styles.detailText, { color: theme.brand[500], fontFamily: fonts.bold }]}>
                Assigned: {item.assignedStaff.fullName}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Status timeline */}
        <Text style={[styles.timelineHeading, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>
          Visit Status Tracker
        </Text>
        {renderTimeline(item.status)}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.bg.card, borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text.primary, fontFamily: fonts.bold }]}>
            Tailor Home Visits
          </Text>
          <Text style={[styles.headerSub, { color: theme.text.secondary, fontFamily: fonts.regular }]}>
            Request physical measurements at home
          </Text>
        </View>
        <Text style={[styles.storeText, { color: theme.text.muted, fontFamily: fonts.regular }]}>
          {APP_CONFIG.STORE_NAME} v{APP_CONFIG.VERSION}
        </Text>
      </View>

      {loading && visits.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.brand[500]} />
        </View>
      ) : visits.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MapPin size={64} color={theme.text.muted} />
          <Text style={[styles.emptyText, { color: theme.text.secondary, fontFamily: fonts.medium }]}>
            No tailor visit requests placed yet.
          </Text>
          <TouchableOpacity 
            style={[styles.bookBtn, { backgroundColor: theme.brand[500] }]}
            onPress={() => requireAuth(() => setRequestModalVisible(true))}
          >
            <Text style={[styles.bookBtnText, { color: '#3D2E3D', fontFamily: fonts.bold }]}>
              Request Store Representative Visit
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={visits}
            renderItem={renderVisit}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listPadding}
            showsVerticalScrollIndicator={false}
          />

          {/* Floating Action Button */}
          <TouchableOpacity 
            style={[styles.fab, shadows.premium, { backgroundColor: theme.brand[500] }]}
            onPress={() => requireAuth(() => setRequestModalVisible(true))}
          >
            <Plus size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Booking Form Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={requestModalVisible}
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary, fontFamily: fonts.bold }]}>
                Request Tailor Visit
              </Text>
              <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
                <X size={20} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
              {/* Preferred date */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>
                  Preferred Visit Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  style={[styles.input, { 
                    borderColor: theme.border, 
                    backgroundColor: theme.bg.input,
                    color: theme.text.primary,
                    fontFamily: fonts.medium 
                  }]}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="e.g. 2026-06-20"
                />
              </View>

              {/* Physical Address */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>
                  Fitting Address *
                </Text>
                <TextInput
                  style={[styles.input, { 
                    borderColor: theme.border, 
                    backgroundColor: theme.bg.input,
                    color: theme.text.primary,
                    fontFamily: fonts.regular,
                    height: 60,
                    textAlignVertical: 'top'
                  }]}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  placeholder="Full street address for staff routing..."
                />
              </View>

              {/* Requirements */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>
                  Requirements / Notes *
                </Text>
                <TextInput
                  style={[styles.input, { 
                    borderColor: theme.border, 
                    backgroundColor: theme.bg.input,
                    color: theme.text.primary,
                    fontFamily: fonts.regular,
                    height: 60,
                    textAlignVertical: 'top'
                  }]}
                  value={requirements}
                  onChangeText={setRequirements}
                  multiline
                  placeholder="Specify items (e.g. Wedding Lehenga fitting, suit measurement details)..."
                />
              </View>

              {/* Submit button */}
              <TouchableOpacity 
                style={[styles.submitBtn, { backgroundColor: theme.brand[500] }]}
                onPress={handleRequestVisit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#3D2E3D" />
                ) : (
                  <Text style={[styles.submitBtnText, { color: '#3D2E3D', fontFamily: fonts.bold }]}>
                    Request Home Visit
                  </Text>
                )}
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  storeText: {
    fontSize: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  bookBtn: {
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  bookBtnText: {
    fontSize: 13,
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  listPadding: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  visitCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  visitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  visitDateTitle: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 9,
  },
  detailsBlock: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  timelineHeading: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  timelineNodeContainer: {
    alignItems: 'center',
  },
  timelineNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
  },
  timelineNodeLabel: {
    fontSize: 9,
    marginTop: 6,
    textAlign: 'center',
  },
  timelineLine: {
    flex: 1,
    height: 2.5,
    marginTop: -16, // offset layout alignment with nodes
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '85%',
    maxHeight: '90%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
  },
  modalScroll: {
    paddingBottom: 40,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  submitBtn: {
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#d8bfd8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnText: {
    fontSize: 15,
  },
});
