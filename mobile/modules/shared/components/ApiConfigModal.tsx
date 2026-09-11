import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Modal, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { AppConfig } from '@/libs/app-config';
import { env } from '@/libs/env';
import { createLogger } from '@/libs/log';
import { toast } from '@/libs/notification/toast';

import { QrScannerView } from './QrScannerView';

const logger = createLogger('ApiConfigModal');

interface ApiConfigModalProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Dialog that lets users swap the API base URL at runtime.
 * Supports manual entry and QR code scanning.
 */
export function ApiConfigModal({ visible, onDismiss }: ApiConfigModalProps) {
  const theme = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      url: '',
    },
  });

  // Pre-fill with the currently active URL whenever the dialog opens.
  useEffect(() => {
    if (!visible) return;
    void AppConfig.getApiUrl().then((currentUrl) => {
      reset({ url: currentUrl });
    });
  }, [visible, reset]);

  const handleSave = async (data: { url: string }) => {
    setIsSaving(true);
    try {
      // Normalize URL: remove trailing slashes
      const targetUrl = data.url.replace(/\/+$/, '');
      const pingUrl = `${targetUrl}/ping`;

      logger.info(`Pinging new API endpoint: ${pingUrl}`);
      // Perform ping check with a 5-second timeout
      const response = await axios.get(pingUrl, { timeout: 5000 });

      if (response.status !== 200 || response.data?.status !== 'ok') {
        throw new Error(`Endpoint answered with status ${response.status} instead of 200 OK.`);
      }

      await AppConfig.setApiUrl(targetUrl);
      toast.success('API Connectée avec succès', `${targetUrl} (Ping OK)`);
      logger.info(`API URL validée et mise à jour vers: ${targetUrl}`);
      onDismiss();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Serveur injoignable';
      toast.error('Échec de connexion au serveur', `Impossible de joindre /api/ping: ${msg}`);
      logger.error(`Erreur de ping API: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      await AppConfig.clearApiUrl();
      toast.success('API URL reset', env.API_URL);
      onDismiss();
    } catch (err) {
      logger.error(`Failed to reset API URL: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQrScan = (url: string) => {
    setShowScanner(false);
    setValue('url', url);
    toast.info('QR code scanned', url);
  };

  if (showScanner) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <QrScannerView
          onScan={handleQrScan}
          onCancel={() => setShowScanner(false)}
        />
      </Modal>
    );
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>
          <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>
            API Configuration
          </Text>
        </Dialog.Title>

        <Dialog.Content>
          <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
            Configure the API base URL. This change allows pointing the app to a self-hosted
            backend. Reverts to default on reset.
          </Text>

          <View style={styles.inputGroup}>
            <Controller
              control={control}
              name="url"
              rules={{
                required: 'URL is required',
                validate: (v) => {
                  try {
                    new URL(v);
                    return true;
                  } catch {
                    return 'Please enter a valid URL (e.g. http://192.168.1.10:8000)';
                  }
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Base URL"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  error={!!errors.url}
                  style={styles.input}
                />
              )}
            />
            {!!errors.url && (
              <HelperText type="error" visible>
                {errors.url.message}
              </HelperText>
            )}
          </View>

          <Button
            mode="outlined"
            icon="qrcode-scan"
            onPress={() => setShowScanner(true)}
            style={styles.scanButton}
          >
            Scan QR Code
          </Button>

          <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
            Default: {env.API_URL}
          </Text>
        </Dialog.Content>

        <Dialog.Actions>
          <Button
            onPress={() => {
              void handleReset();
            }}
            disabled={isSaving}
            textColor={theme.colors.error}
          >
            Reset
          </Button>
          <Button onPress={onDismiss} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={() => {
              void handleSubmit(handleSave)();
            }}
            loading={isSaving}
            disabled={isSaving}
          >
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 28,
  },
  hint: {
    marginBottom: 16,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 12,
  },
  input: {
    fontSize: 14,
  },
  scanButton: {
    marginBottom: 16,
  },
});
