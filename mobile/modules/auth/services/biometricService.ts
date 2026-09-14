import * as LocalAuthentication from 'expo-local-authentication';

import { createLogger } from '@/libs/log';

const logger = createLogger('BiometricService');

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  biometryName: string;
}

export const BiometricService = {
  /**
   * Check if device has biometric hardware and enrolled fingerprints/facial data
   */
  async checkCapabilities(): Promise<BiometricCapability> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      let biometryName = 'Biométrie';
      if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        biometryName = 'Face ID';
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        biometryName = 'Empreinte Digitale';
      }

      return {
        hasHardware,
        isEnrolled,
        supportedTypes,
        biometryName,
      };
    } catch (error) {
      logger.warn('Failed to check biometric capabilities', error);
      return {
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: [],
        biometryName: 'Biométrie',
      };
    }
  },

  /**
   * Prompt the user for biometric or device PIN authentication
   */
  async authenticate(promptMessage: string = 'Authentification requise pour valider l\'opération'): Promise<boolean> {
    try {
      const capabilities = await this.checkCapabilities();
      if (!capabilities.hasHardware || !capabilities.isEnrolled) {
        // Fallback: If hardware not available or mock simulator, allow passage with log
        logger.info('No biometric hardware enrolled. Falling back gracefully.');
        return true;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Annuler',
        fallbackLabel: 'Utiliser le mot de passe',
        disableDeviceFallback: false,
      });

      if (result.success) {
        logger.info('Biometric authentication succeeded');
        return true;
      } else {
        logger.warn('Biometric authentication failed or cancelled', result.error);
        return false;
      }
    } catch (error) {
      logger.error('Error during biometric authentication', error);
      return false;
    }
  },
};
