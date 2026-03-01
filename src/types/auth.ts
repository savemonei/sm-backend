/**
 * Auth API request/response types.
 * Same contract so app works with Supabase today and own auth later.
 */

export interface RegisterBody {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RefreshBody {
  refresh_token: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "bearer";
}

export interface UserInfo {
  id: string;
  email: string | undefined;
  full_name?: string;
}

export interface AuthSuccessResponse {
  user: UserInfo;
  session: AuthTokens;
}

export interface AuthErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
