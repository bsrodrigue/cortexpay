import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Modal, Portal, SegmentedButtons, Surface, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

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

  const status = kycData?.kyc_status || 'NOT_STARTED';

  const handleSubmit = () => {
    if (!docNumber || docNumber.trim().length < 5) {
      setError('Veuillez renseigner un numéro de pièce valide.');
      return;
    }
    setError(null);
    void onSubmitKYC({
      documentType: docType,
      documentNumber: docNumber.trim(),
      frontImageUrl: 'https://mock.storage.cortexcard.sn/kyc/cni_front.jpg',
      backImageUrl: 'https://mock.storage.cortexcard.sn/kyc/cni_back.jpg',
      selfieUrl: 'https://mock.storage.cortexcard.sn/kyc/selfie.jpg',
    }).catch((e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Erreur soumission');
    });
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

              {error && <HelperText type="error" visible>{error}</HelperText>}

              <Surface style={styles.uploadPreview} elevation={1}>
                <Text variant="bodySmall" style={styles.uploadText}>
                  📷 Photos simulées (Recto CNI + Selfie biométrique prêt)
                </Text>
              </Surface>

              <View style={styles.actionButtons}>
                <Button mode="text" onPress={onDismiss}>
                  Plus tard
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  style={styles.submitBtn}
                >
                  Transmettre mes pièces
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
      margin: 20,
      borderRadius: 20,
      maxHeight: '90%',
    },
    scrollContent: {
      padding: 24,
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
    segmented: {
      marginBottom: 16,
    },
    input: {
      marginBottom: 12,
    },
    uploadPreview: {
      padding: 14,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceVariant,
      marginVertical: 12,
      alignItems: 'center',
    },
    uploadText: {
      color: theme.colors.onSurfaceVariant,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
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
