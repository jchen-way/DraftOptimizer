import { apiClient } from './client';

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export function login(email: string, password: string) {
  return apiClient.post<{ user: User }>('/auth/login', { email, password });
}

export function register(
  email: string,
  password: string,
  displayName: string
) {
  return apiClient.post<{ user: User }>('/auth/register', {
    email,
    password,
    displayName,
  });
}

export function logout() {
  return apiClient.post('/auth/logout');
}

export function getCurrentUser() {
  return apiClient.get<User>('/auth/me');
}

export function forgotPassword(email: string) {
  return apiClient.post<{ message: string; resetToken?: string; resetUrl?: string }>(
    '/auth/forgot-password',
    { email }
  );
}

export function resetPassword(
  token: string,
  password: string,
  confirmPassword: string
) {
  return apiClient.post<{ message: string; user: User }>('/auth/reset-password', {
    token,
    password,
    confirmPassword,
  });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  return apiClient.post<{ message: string }>('/auth/change-password', {
    currentPassword,
    newPassword,
    confirmPassword,
  });
}
