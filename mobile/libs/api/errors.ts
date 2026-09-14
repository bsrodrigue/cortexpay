/**
 * Centralized API Error Extraction Utility for CortexPay Mobile.
 * Extracts clean, human-readable error messages from Axios, HTTP, or Zod errors.
 */

interface ErrorWithResponse {
  response?: {
    data?: {
      detail?: string | { msg?: string }[];
      message?: string;
    };
    status?: number;
  };
  message?: string;
}

export function getApiErrorMessage(error: unknown, fallbackMessage = 'Une erreur inattendue est survenue'): string {
  if (!error) return fallbackMessage;

  if (typeof error === 'string') return error;

  const err = error as ErrorWithResponse;

  if (err.response?.data) {
    const data = err.response.data;

    if (typeof data.detail === 'string') {
      return data.detail;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0];
      if (typeof first.msg === 'string') {
        return first.msg;
      }
    }

    if (typeof data.message === 'string') {
      return data.message;
    }
  }

  if (typeof err.message === 'string' && err.message.length > 0) {
    return err.message;
  }

  return fallbackMessage;
}
