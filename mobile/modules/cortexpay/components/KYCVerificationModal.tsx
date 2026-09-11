import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, HelperText, IconButton, Modal, Portal, SegmentedButtons, Surface, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { cortexPayApi } from '../api';
import { KYCStatusResponse } from '../types';

interface KYCVerificationModalProps {
  visible: boolean;
  onDismiss: () => void;
  kycData?: KYCStatusResponse;
  onSubmitKYC: (params: {
    documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE';
    documentNumber: string;
    frontImageUrl: string;
    backImageUrl?: string;
    selfieUrl: string;
  }) => Promise<void>;
  onSimulateDecision?: (decision: 'APPROVED' | 'REJECTED', tier?: number, reason?: string) => Promise<void>;
  isSubmitting: boolean;
}

export const KYCVerificationModal: React.FC<KYCVerificationModalProps> = ({
  visible,
  onDismiss,
  kycData,
  onSubmitKYC,
  onSimulateDecision,
  isSubmitting,
}) => {
  const styles = useThemedStyles(createStyles);
  const [docType, setDocType] = useState<'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE'>('NATIONAL_ID');
  const [docNumber, setDocNumber] = useState('1002200192931');
  const [error, setError] = useState<string | null>(null);

  // Photo captures state
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [frontBase64, setFrontBase64] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [backBase64, setBackBase64] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const status = kycData?.kyc_status || 'NOT_STARTED';

  const pickImage = async (field: 'front' | 'back' | 'selfie', useCamera: boolean) => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (useCamera) {
        const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (permStatus !== 'granted') {
          Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à l\'appareil photo pour photographier vos documents.');
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: field === 'selfie' ? [1, 1] : [4, 3],
          quality: 0.8,
          base64: true,
          cameraType: field === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        });
      } else {
        const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permStatus !== 'granted') {
          Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à votre galerie photo.');
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: field === 'selfie' ? [1, 1] : [4, 3],
          quality: 0.8,
          base64: true,
        });
      }

      if (!result.canceled && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        if (field === 'front') {
          setFrontUri(selectedAsset.uri);
          setFrontBase64(selectedAsset.base64 || null);
        }
        if (field === 'back') {
          setBackUri(selectedAsset.uri);
          setBackBase64(selectedAsset.base64 || null);
        }
        if (field === 'selfie') {
          setSelfieUri(selectedAsset.uri);
          setSelfieBase64(selectedAsset.base64 || null);
        }
      }
    } catch (e: unknown) {
      const err = e as Error;
      Alert.alert('Erreur capture', err.message || 'Impossible de capturer la photo.');
    }
  };

  const handleChooseSource = (field: 'front' | 'back' | 'selfie') => {
    Alert.alert(
      'Document d\'identité',
      'Choisissez la source pour la photo',
      [
        {
          text: 'Prendre une photo (Appareil photo)',
          onPress: () => {
            void pickImage(field, true);
          },
        },
        {
          text: 'Choisir depuis la Galerie',
          onPress: () => {
            void pickImage(field, false);
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleSubmit = () => {
    if (!docNumber || docNumber.trim().length < 5) {
      setError('Veuillez renseigner un numéro de pièce officiel valide.');
      return;
    }
    if (!frontBase64) {
      setError('Veuillez photographier le recto de votre pièce d\'identité.');
      return;
    }
    if (docType === 'NATIONAL_ID' && !backBase64) {
      setError('Veuillez photographier le verso de votre CNI.');
      return;
    }
    if (!selfieBase64) {
      setError('Veuillez prendre un selfie pour vérification biométrique.');
      return;
    }

    setError(null);
    setIsUploading(true);

    void (async () => {
      try {
        // Upload front
        const frontRes = await cortexPayApi.uploadKYCImage(frontBase64, 'front');

        // Upload back if provided
        let backUrl: string | undefined;
        if (backBase64) {
          const backRes = await cortexPayApi.uploadKYCImage(backBase64, 'back');
          backUrl = backRes.image_url;
        }

        // Upload selfie
        const selfieRes = await cortexPayApi.uploadKYCImage(selfieBase64, 'selfie');

        // Submit form data with uploaded URLs
        await onSubmitKYC({
          documentType: docType,
          documentNumber: docNumber.trim(),
          frontImageUrl: frontRes.image_url,
          backImageUrl: backUrl,
          selfieUrl: selfieRes.image_url,
        });
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string };
        setError(err.response?.data?.detail || err.message || 'Erreur lors du téléchargement des photos');
      } finally {
        setIsUploading(false);
      }
    })();
  };

  const handleSimulate = (decision: 'APPROVED' | 'REJECTED', tier?: number, reason?: string) => {
    if (!onSimulateDecision) return;
    void onSimulateDecision(decision, tier, reason);
  };

  const getStatusBadgeStyle = () => {
    switch (status) {
      case 'APPROVED':
        return styles.status_APPROVED;
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return styles.status_SUBMITTED;
      case 'REJECTED':
        return styles.status_REJECTED;
      default:
        return styles.status_NOT_STARTED;
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text variant="headlineSmall" style={styles.title}>
            Vérification d&apos;Identité (KYC)
          </Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            Conformité BCEAO / UEMOA requise pour l&apos;activation et le provisionnement des cartes Visa USD.
          </Text>

          {/* Status Badge */}
          <Surface style={[styles.statusBadge, getStatusBadgeStyle()]} elevation={1}>
            <Text variant="labelLarge" style={styles.statusText}>
              Statut actuel : {status === 'APPROVED' ? 'VÉRIFIÉ (Tier 1)' : status === 'SUBMITTED' ? 'EN ATTENTE D\'EXAMEN' : status === 'REJECTED' ? 'REFUSÉ' : 'NON VÉRIFIÉ'}
            </Text>
            {kycData?.kyc_rejection_reason && (
              <Text variant="bodySmall" style={styles.rejectionReason}>
                Motif du refus : {kycData.kyc_rejection_reason}
              </Text>
            )}
          </Surface>

          {status === 'APPROVED' ? (
            <View style={styles.approvedSection}>
              <Text variant="bodyMedium" style={styles.approvedText}>
                Félicitations ! Votre profil est validé au Niveau 1. Vous pouvez émettre des cartes virtuelles Visa sans restriction.
              </Text>
              <Button mode="contained" onPress={onDismiss} style={styles.closeBtn}>
                Continuer
              </Button>
            </View>
          ) : status === 'SUBMITTED' ? (
            <View style={styles.pendingSection}>
              <Text variant="bodyMedium" style={styles.pendingText}>
                Vos pièces d&apos;identité ont été enregistrées. La validation automatique prend généralement quelques instants.
              </Text>

              {/* Dev Simulation Tools for testing */}
              {onSimulateDecision && (
                <Surface style={styles.demoBox} elevation={1}>
                  <Text variant="labelMedium" style={styles.demoTitle}>
                    🧪 Raccourci Démo / MVP :
                  </Text>
                  <View style={styles.demoButtons}>
                    <Button
                      mode="contained-tonal"
                      buttonColor="#DCFCE7"
                      textColor="#166534"
                      onPress={() => handleSimulate('APPROVED', 1)}
                    >
                      Approuver Tier 1
                    </Button>
                    <Button
                      mode="contained-tonal"
                      buttonColor="#FEE2E2"
                      textColor="#991B1B"
                      onPress={() => handleSimulate('REJECTED', 0, 'Photo de la pièce illisible')}
                    >
                      Refuser
                    </Button>
                  </View>
                </Surface>
              )}

              <Button mode="outlined" onPress={onDismiss} style={styles.closeBtn}>
                Fermer
              </Button>
            </View>
          ) : (
            <View style={styles.formSection}>
              <Text variant="labelLarge" style={styles.fieldLabel}>
                Type de document
              </Text>
              <SegmentedButtons
                value={docType}
                onValueChange={(val) => setDocType(val as 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE')}
                buttons={[
                  { value: 'NATIONAL_ID', label: 'CNI CEDEAO' },
                  { value: 'PASSPORT', label: 'Passeport' },
                ]}
                style={styles.segmented}
              />

              <TextInput
                label="Numéro de pièce d'identité"
                value={docNumber}
                onChangeText={setDocNumber}
                mode="outlined"
                style={styles.input}
              />

              <Text variant="labelMedium" style={styles.sectionDocTitle}>
                Photos de la pièce &amp; Selfie biométrique
              </Text>

              {/* Document Photo Pickers */}
              <View style={styles.photosGrid}>
                {/* Recto */}
                <TouchableOpacity
                  style={[styles.photoCard, frontUri ? styles.photoCardFilled : null]}
                  onPress={() => handleChooseSource('front')}
                >
                  {frontUri ? (
                    <Image source={{ uri: frontUri }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <IconButton icon="camera" size={26} iconColor="#2563EB" />
                      <Text variant="labelSmall" style={styles.placeholderLabel}>
                        Photo Recto *
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Verso (only for CNI or Driving License) */}
                {docType !== 'PASSPORT' && (
                  <TouchableOpacity
                    style={[styles.photoCard, backUri ? styles.photoCardFilled : null]}
                    onPress={() => handleChooseSource('back')}
                  >
                    {backUri ? (
                      <Image source={{ uri: backUri }} style={styles.previewImage} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <IconButton icon="camera" size={26} iconColor="#2563EB" />
                        <Text variant="labelSmall" style={styles.placeholderLabel}>
                          Photo Verso *
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {/* Selfie */}
                <TouchableOpacity
                  style={[styles.photoCard, selfieUri ? styles.photoCardFilled : null]}
                  onPress={() => handleChooseSource('selfie')}
                >
                  {selfieUri ? (
                    <Image source={{ uri: selfieUri }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <IconButton icon="face-recognition" size={26} iconColor="#16A34A" />
                      <Text variant="labelSmall" style={styles.placeholderLabel}>
                        Selfie Portrait *
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {error && <HelperText type="error" visible>{error}</HelperText>}

              <View style={styles.actionButtons}>
                <Button mode="text" onPress={onDismiss} disabled={isSubmitting || isUploading}>
                  Plus tard
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  loading={isSubmitting || isUploading}
                  disabled={isSubmitting || isUploading}
                  style={styles.submitBtn}
                >
                  {isUploading ? 'Téléchargement...' : 'Transmettre mes pièces'}
                </Button>
              </View>
            </View>
          )}
        </ScrollView>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modal: {
      backgroundColor: theme.colors.surface,
      margin: 16,
      borderRadius: 20,
      maxHeight: '92%',
    },
    scrollContent: {
      padding: 20,
    },
    title: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    subtitle: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
      marginBottom: 16,
    },
    statusBadge: {
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    status_NOT_STARTED: {
      backgroundColor: '#F3F4F6',
    },
    status_SUBMITTED: {
      backgroundColor: '#FEF3C7',
    },
    status_APPROVED: {
      backgroundColor: '#DCFCE7',
    },
    status_REJECTED: {
      backgroundColor: '#FEE2E2',
    },
    statusText: {
      fontWeight: 'bold',
      textAlign: 'center',
    },
    rejectionReason: {
      color: '#B91C1C',
      marginTop: 4,
      textAlign: 'center',
    },
    formSection: {
      marginTop: 8,
    },
    fieldLabel: {
      marginBottom: 8,
      fontWeight: '600',
    },
    sectionDocTitle: {
      fontWeight: '600',
      marginTop: 12,
      marginBottom: 8,
      color: theme.colors.onSurface,
    },
    photosGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 10,
    },
    photoCard: {
      flex: 1,
      minWidth: 90,
      height: 105,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: '#D1D5DB',
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#F9FAFB',
      overflow: 'hidden',
    },
    photoCardFilled: {
      borderStyle: 'solid',
      borderColor: '#10B981',
    },
    photoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderLabel: {
      fontSize: 10,
      fontWeight: 'bold',
      color: theme.colors.onSurfaceVariant,
      marginTop: -4,
    },
    previewImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    segmented: {
      marginBottom: 16,
    },
    input: {
      marginBottom: 6,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
    },
    submitBtn: {
      minWidth: 180,
    },
    approvedSection: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    approvedText: {
      textAlign: 'center',
      color: '#166534',
      marginBottom: 16,
    },
    pendingSection: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    pendingText: {
      textAlign: 'center',
      color: '#92400E',
      marginBottom: 16,
    },
    closeBtn: {
      marginTop: 8,
      width: '100%',
    },
    demoBox: {
      width: '100%',
      padding: 14,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 16,
    },
    demoTitle: {
      fontWeight: 'bold',
      marginBottom: 8,
    },
    demoButtons: {
      flexDirection: 'row',
      gap: 10,
    },
  });
