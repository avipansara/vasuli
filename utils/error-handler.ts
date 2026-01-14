import { Alert } from 'react-native';

export interface AppError {
  code: string;
  message: string;
  details?: string;
  retry?: () => Promise<void>;
}

export function parseError(error: unknown): AppError {
  if (error instanceof Error) {
    // Supabase errors
    if ('code' in error && typeof (error as any).code === 'string') {
      const supabaseError = error as any;
      return {
        code: supabaseError.code,
        message: getErrorMessage(supabaseError.code, supabaseError.message),
        details: supabaseError.details || supabaseError.hint,
      };
    }
    
    // Network errors
    if (error.message.includes('Network request failed') || 
        error.message.includes('fetch failed') ||
        error.message.includes('network')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Unable to connect. Please check your internet connection.',
      };
    }
    
    // Generic error
    return {
      code: 'UNKNOWN',
      message: error.message || 'An unexpected error occurred',
    };
  }
  
  return {
    code: 'UNKNOWN',
    message: 'An unexpected error occurred',
  };
}

function getErrorMessage(code: string, defaultMessage: string): string {
  const errorMessages: Record<string, string> = {
    // Auth errors
    'invalid_credentials': 'Invalid email or password',
    'user_not_found': 'No account found with this email',
    'email_taken': 'An account with this email already exists',
    'weak_password': 'Password must be at least 6 characters',
    'invalid_email': 'Please enter a valid email address',
    'email_not_confirmed': 'Please verify your email before signing in',
    
    // Database errors
    'PGRST116': 'Record not found',
    '23505': 'This record already exists',
    '23503': 'Cannot delete - this record is referenced elsewhere',
    '42501': 'You do not have permission to perform this action',
    
    // Network errors
    'NETWORK_ERROR': 'Unable to connect. Please check your internet connection.',
    'TIMEOUT': 'Request timed out. Please try again.',
  };
  
  return errorMessages[code] || defaultMessage;
}

export function showErrorAlert(error: AppError, onRetry?: () => void) {
  const buttons: any[] = [{ text: 'OK', style: 'default' }];
  
  if (onRetry && error.code === 'NETWORK_ERROR') {
    buttons.unshift({ text: 'Retry', onPress: onRetry });
  }
  
  Alert.alert('Error', error.message, buttons);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const parsedError = parseError(error);
      
      // Only retry on network errors
      if (parsedError.code !== 'NETWORK_ERROR') {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Email is required';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required';
  }
  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  return null;
}

export function validateAmount(amount: string): string | null {
  if (!amount.trim()) {
    return 'Amount is required';
  }
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    return 'Please enter a valid amount greater than 0';
  }
  if (num > 999999.99) {
    return 'Amount is too large';
  }
  return null;
}

export function validateRequired(value: string, fieldName: string): string | null {
  if (!value.trim()) {
    return `${fieldName} is required`;
  }
  return null;
}
