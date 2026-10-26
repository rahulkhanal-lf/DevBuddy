export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
}
