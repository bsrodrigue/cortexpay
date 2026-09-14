import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { Dispute, FXQuoteResponse, KYCStatusResponse, ThreeDSChallenge, VirtualCard } from '../types';
import { CardDetailsModal } from './CardDetailsModal';
import { ConvertModal } from './ConvertModal';
import { DepositModal } from './DepositModal';
import { KYCVerificationModal } from './KYCVerificationModal';
import { SimulatorPanel } from './SimulatorPanel';
import { ThreeDSModal } from './ThreeDSModal';
import { WithdrawModal } from './WithdrawModal';

export type ActiveModalType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'CONVERT'
  | 'ISSUE_CARD'
  | 'CARD_DETAILS'
  | 'SIMULATOR'
  | 'KYC'
  | 'THREE_DS'
  | null;

interface DashboardModalsProps {
  activeModal: ActiveModalType;
  onClose: () => void;
  // Wallets
  xofBalance: string;
  usdBalance: string;
  // Cards & Disputes
  cards: VirtualCard[];
  selectedCard: VirtualCard | null;
  disputes: Dispute[];
  kycData?: KYCStatusResponse;
  active3DSChallenge: ThreeDSChallenge | null;
  // Card Issue Form State
  cardType: 'STANDARD' | 'BUSINESS';
  setCardType: (val: 'STANDARD' | 'BUSINESS') => void;
  cardLabel: string;
  setCardLabel: (val: string) => void;
  cardholderName: string;
  setCardholderName: (val: string) => void;
  initialFunding: string;
  setInitialFunding: (val: string) => void;
  // Handlers
  onDeposit: (operator: 'WAVE' | 'ORANGE_MONEY', amount: string, phone: string, otp: string) => Promise<void>;
  onWithdraw: (operator: 'WAVE' | 'ORANGE_MONEY', amount: string, phone: string) => Promise<void>;
  onGetQuote: (amountXof: string) => Promise<FXQuoteResponse>;
  onConvert: (quoteId: string) => Promise<void>;
  onIssueCard: () => Promise<void>;
  onTopupCard: (cardId: string, amountUsd: string) => Promise<void>;
  onUpdateLimit: (cardId: string, limitUsd: string) => Promise<void>;
  onSubmitKYC: (params: {
    documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE';
    documentNumber: string;
    frontImageUrl: string;
    backImageUrl?: string;
    selfieUrl: string;
  }) => Promise<void>;
  onSimulateKYC: (decision: 'APPROVED' | 'REJECTED', tier?: number, reason?: string) => Promise<void>;
  onSimulateDebit: (cardId: string, merchant: string, amountUsd: string, simulateChaos: boolean) => Promise<void>;
  onInitiate3DS: (cardId: string, merchant: string, amountUsd: string) => Promise<void>;
  onVerify3DS: (challengeId: string, otpCode: string, cardId: string) => Promise<void>;
  onRunReconciliation: (provider: 'WAVE' | 'ORANGE_MONEY', simulateDiscrepancy: boolean) => Promise<void>;
  onResolveDispute: (disputeId: string, decision: 'WON' | 'LOST') => Promise<void>;
  // Loading states
  isDepositing: boolean;
  isWithdrawing: boolean;
  isGettingQuote: boolean;
  isConverting: boolean;
  isIssuingCard: boolean;
  isToppingUpCard: boolean;
  isUpdatingLimit: boolean;
  isSubmittingKYC: boolean;
  isDebiting: boolean;
  isInitiating3DS: boolean;
  isVerifying3DS: boolean;
  isReconciling: boolean;
  isResolvingDispute: boolean;
}

export const DashboardModals: React.FC<DashboardModalsProps> = ({
  activeModal,
  onClose,
  xofBalance,
  usdBalance,
  cards,
  selectedCard,
  disputes,
  kycData,
  active3DSChallenge,
  cardType,
  setCardType,
  cardLabel,
  setCardLabel,
  cardholderName,
  setCardholderName,
  initialFunding,
  setInitialFunding,
  onDeposit,
  onWithdraw,
  onGetQuote,
  onConvert,
  onIssueCard,
  onTopupCard,
  onUpdateLimit,
  onSubmitKYC,
  onSimulateKYC,
  onSimulateDebit,
  onInitiate3DS,
  onVerify3DS,
  onRunReconciliation,
  onResolveDispute,
  isDepositing,
  isWithdrawing,
  isGettingQuote,
  isConverting,
  isIssuingCard,
  isToppingUpCard,
  isUpdatingLimit,
  isSubmittingKYC,
  isDebiting,
  isInitiating3DS,
  isVerifying3DS,
  isReconciling,
  isResolvingDispute,
}) => {
  const styles = useThemedStyles(createStyles);

  return (
    <>
      {/* 1. Deposit Modal */}
      <DepositModal
        visible={activeModal === 'DEPOSIT'}
        onDismiss={onClose}
        onDeposit={onDeposit}
        isDepositing={isDepositing}
      />

      {/* 2. Withdraw Modal */}
      <WithdrawModal
        visible={activeModal === 'WITHDRAW'}
        onDismiss={onClose}
        xofBalance={xofBalance}
        onWithdraw={onWithdraw}
        isWithdrawing={isWithdrawing}
      />

      {/* 3. Convert Modal */}
      <ConvertModal
        visible={activeModal === 'CONVERT'}
        onDismiss={onClose}
        xofBalance={xofBalance}
        onGetQuote={onGetQuote}
        onExecuteConvert={onConvert}
        isGettingQuote={isGettingQuote}
        isConverting={isConverting}
      />

      {/* 3. KYC Modal */}
      <KYCVerificationModal
        visible={activeModal === 'KYC'}
        onDismiss={onClose}
        kycData={kycData}
        onSubmitKYC={onSubmitKYC}
        onSimulateDecision={onSimulateKYC}
        isSubmitting={isSubmittingKYC}
      />

      {/* 4. Card Details / Topup Modal */}
      <CardDetailsModal
        visible={activeModal === 'CARD_DETAILS'}
        onDismiss={onClose}
        card={selectedCard}
        walletUsdBalance={usdBalance}
        onTopup={onTopupCard}
        onUpdateLimit={onUpdateLimit}
        isToppingUp={isToppingUpCard}
        isUpdatingLimit={isUpdatingLimit}
      />

      {/* 5. 3DS Challenge Modal */}
      <ThreeDSModal
        visible={activeModal === 'THREE_DS'}
        onDismiss={onClose}
        challenge={active3DSChallenge}
        onVerify={onVerify3DS}
        isVerifying={isVerifying3DS}
      />

      {/* 6. Sandbox / Simulator Panel Modal */}
      <Portal>
        <Modal
          visible={activeModal === 'SIMULATOR'}
          onDismiss={onClose}
          contentContainerStyle={styles.simulatorModalContent}
        >
          <View style={styles.modalCloseRow}>
            <IconButton icon="close" size={20} onPress={onClose} />
          </View>
          <SimulatorPanel
            cards={cards}
            disputes={disputes}
            onSimulateDeposit={onDeposit}
            onSimulateDebit={onSimulateDebit}
            onInitiate3DS={onInitiate3DS}
            onRunReconciliation={onRunReconciliation}
            onResolveDispute={onResolveDispute}
            isDepositing={isDepositing}
            isDebiting={isDebiting}
            isInitiating3DS={isInitiating3DS}
            isReconciling={isReconciling}
            isResolvingDispute={isResolvingDispute}
          />
        </Modal>
      </Portal>

      {/* 7. Issue Card Modal */}
      <Portal>
        <Modal
          visible={activeModal === 'ISSUE_CARD'}
          onDismiss={onClose}
          contentContainerStyle={styles.modalContent}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            Créer une Carte Virtuelle USD
          </Text>

          <Text variant="bodySmall" style={styles.fieldLabel}>
            Type de Carte &amp; Plafond Mensuel
          </Text>
          <SegmentedButtons
            value={cardType}
            onValueChange={(val) => setCardType(val as 'STANDARD' | 'BUSINESS')}
            buttons={[
              { value: 'STANDARD', label: 'Standard ($5k)' },
              { value: 'BUSINESS', label: 'Business ($10k)' },
            ]}
            style={styles.segmentedType}
          />

          <TextInput
            label="Libellé personnalisé (ex: Pubs Meta, SaaS Dev)"
            value={cardLabel}
            onChangeText={setCardLabel}
            mode="outlined"
            style={styles.modalInput}
          />

          <TextInput
            label="Nom du titulaire"
            value={cardholderName}
            onChangeText={setCardholderName}
            mode="outlined"
            style={styles.modalInput}
          />

          <TextInput
            label="Provisionnement initial (USD)"
            value={initialFunding}
            onChangeText={setInitialFunding}
            keyboardType="numeric"
            mode="outlined"
            style={styles.modalInput}
          />

          <Button
            mode="contained"
            onPress={() => {
              void onIssueCard();
            }}
            loading={isIssuingCard}
            disabled={isIssuingCard}
            style={styles.modalBtn}
          >
            Émettre la carte
          </Button>
        </Modal>
      </Portal>
    </>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modalContent: {
      backgroundColor: '#FFFFFF',
      padding: 20,
      margin: 20,
      borderRadius: 16,
    },
    simulatorModalContent: {
      backgroundColor: 'transparent',
      margin: 10,
    },
    modalCloseRow: {
      alignItems: 'flex-end',
      marginBottom: -10,
      zIndex: 10,
    },
    modalTitle: {
      fontWeight: 'bold',
      marginBottom: 16,
      color: theme.colors.onSurface,
    },
    fieldLabel: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 6,
      fontWeight: '600',
    },
    segmentedType: {
      marginBottom: 14,
    },
    modalInput: {
      marginBottom: 12,
    },
    modalBtn: {
      marginTop: 8,
    },
  });
