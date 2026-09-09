import type { CreateUserRequest, Role, User } from '../types';
import apiClient from './api';

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  return response.data;
}

export async function register(
  email: string,
  password: string,
  full_name: string,
): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/register', {
    email,
    password,
    full_name,
  });
  return response.data;
}

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>('/auth/me');
  return response.data;
}

export async function listUsers(): Promise<User[]> {
  const response = await apiClient.get<User[]>('/auth/users');
  return response.data;
}

export async function updateRole(userId: number, role: Role): Promise<User> {
  const response = await apiClient.put<User>(`/auth/users/${userId}/role`, { role });
  return response.data;
}

export async function toggleActive(userId: number, active: boolean): Promise<User> {
  const response = await apiClient.put<User>(`/auth/users/${userId}/activate`, {
    is_active: active,
  });
  return response.data;
}

export async function createUser(data: CreateUserRequest): Promise<User> {
  const response = await apiClient.post<User>('/auth/register', data);
  return response.data;
}

export async function deleteUser(userId: number): Promise<void> {
  await apiClient.delete(`/auth/users/${userId}`);
}
